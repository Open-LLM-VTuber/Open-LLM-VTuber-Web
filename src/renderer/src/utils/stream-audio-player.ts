/**
 * Streamed TTS audio player.
 *
 * The backend delivers a streamed sentence as:
 *   audio-stream-start  (stream_id, sample_rate, display_text, actions)
 *   audio-stream-chunk  (base64 little-endian int16 PCM, mono)  × N
 *   audio-stream-end
 *
 * Chunks are decoded to AudioBuffers and scheduled gaplessly on a shared
 * AudioContext. Playback of a stream is wrapped in a promise so it can run
 * inside the same audioTaskQueue as legacy file-based audio, preserving
 * sentence order. All sources route through an AnalyserNode so Live2D
 * lip-sync can read the live RMS (see getStreamingLipSyncRms).
 */

interface StreamState {
  sampleRate: number;
  pending: Float32Array[];
  ended: boolean;
  stopped: boolean;
  playing: boolean;
  notify: (() => void) | null;
}

// Matches the lipSyncScale boost applied to file-based playback in
// use-audio-task.ts so both paths drive the mouth equally hard.
const LIP_SYNC_SCALE = 2.0;
// Minimal scheduling headroom when (re)anchoring to the context clock.
// Only applied when we're genuinely behind — in-time chunks butt-join
// sample-exactly at nextStartTime with no re-anchor.
const MIN_LEAD_S = 0.02;
// Jitter cushion. A stream starts playing (and resumes after an underrun)
// only once this much audio is buffered, so a delivery stall shorter than
// the cushion can never split a word. Deterministic by design: if an
// underrun still occurs, the cushion ratchets up for the rest of the
// session, converging on the machine's actual worst-case jitter without
// manual tuning. Streams that already ended start immediately, and a wall
// cap bounds every wait so playback never hangs on a slow producer.
const INITIAL_CUSHION_S = 0.6;
const CUSHION_WAIT_CAP_MS = 1500;
const CUSHION_RATCHET_S = 0.3;
const CUSHION_MAX_S = 1.5;

class StreamAudioPlayer {
  private ctx: AudioContext | null = null;

  private analyser: AnalyserNode | null = null;

  private gain: GainNode | null = null;

  private analyserBuf: Float32Array | null = null;

  private streams = new Map<string, StreamState>();

  private dropped = new Set<string>();

  private activeSources = new Set<AudioBufferSourceNode>();

  // Session-level jitter cushion; ratchets up on observed underruns.
  private cushionS = INITIAL_CUSHION_S;

  private underruns = 0;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyserBuf = new Float32Array(this.analyser.fftSize);
      this.gain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private getState(streamId: string, sampleRate = 24000): StreamState {
    let state = this.streams.get(streamId);
    if (!state) {
      state = {
        sampleRate,
        pending: [],
        ended: false,
        stopped: false,
        playing: false,
        notify: null,
      };
      this.streams.set(streamId, state);
    }
    return state;
  }

  private wake(state: StreamState) {
    if (state.notify) {
      const resolve = state.notify;
      state.notify = null;
      resolve();
    }
  }

  /** Announce a stream (from audio-stream-start). */
  openStream(streamId: string, sampleRate: number) {
    if (this.dropped.has(streamId)) return;
    this.getState(streamId, sampleRate).sampleRate = sampleRate;
  }

  /** Mark a stream as unwanted; its chunks will be discarded on arrival. */
  dropStream(streamId: string) {
    this.dropped.add(streamId);
    const state = this.streams.get(streamId);
    if (state) {
      state.stopped = true;
      this.wake(state);
      this.streams.delete(streamId);
    }
  }

  /** Append a base64 int16 PCM chunk (from audio-stream-chunk). */
  pushChunk(streamId: string, chunkBase64: string) {
    if (this.dropped.has(streamId)) return;
    const raw = atob(chunkBase64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) float32[i] = int16[i] / 32768.0;

    const state = this.getState(streamId);
    state.pending.push(float32);
    this.wake(state);
  }

  /** Close a stream (from audio-stream-end). */
  endStream(streamId: string) {
    if (this.dropped.delete(streamId)) return;
    const state = this.streams.get(streamId);
    if (state) {
      state.ended = true;
      this.wake(state);
    }
  }

  /** Seconds of audio currently buffered but not yet scheduled. */
  private static pendingDuration(state: StreamState): number {
    let samples = 0;
    for (let i = 0; i < state.pending.length; i += 1) samples += state.pending[i].length;
    return samples / state.sampleRate;
  }

  /**
   * Wait until at least `targetSeconds` of audio is buffered, the stream
   * ends/stops, or `timeoutMs` elapses — whichever comes first.
   */
  private async waitForBuffer(
    state: StreamState,
    targetSeconds: number,
    timeoutMs: number,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (
      !state.stopped
      && !state.ended
      && StreamAudioPlayer.pendingDuration(state) < targetSeconds
    ) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      await new Promise<void>((resolve) => {
        state.notify = resolve;
        setTimeout(resolve, remaining);
      });
    }
  }

  /**
   * Play a stream to completion. Resolves when the stream has ended and the
   * last scheduled buffer finished playing, or immediately after stop/drop.
   * Intended to run as an audioTaskQueue task.
   */
  async play(streamId: string): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    const state = this.getState(streamId);
    state.playing = true;
    let nextStartTime = 0;

    // Deterministic gate: buffer a jitter cushion before the first sample,
    // so a delivery stall shorter than the cushion can never split a word.
    // Ended streams start immediately; the wall cap bounds the wait.
    await this.waitForBuffer(state, this.cushionS, CUSHION_WAIT_CAP_MS);

    try {
      for (;;) {
        if (state.stopped) return;

        if (state.pending.length > 0) {
          const samples = state.pending.shift()!;
          const buffer = ctx.createBuffer(1, samples.length, state.sampleRate);
          buffer.copyToChannel(samples, 0);

          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(this.gain!);
          this.activeSources.add(source);
          source.onended = () => this.activeSources.delete(source);

          // Re-anchor to the context clock only when genuinely behind;
          // in-time chunks butt-join exactly at nextStartTime.
          if (nextStartTime < ctx.currentTime + MIN_LEAD_S) {
            nextStartTime = ctx.currentTime + MIN_LEAD_S;
          }
          source.start(nextStartTime);
          nextStartTime += buffer.duration;
        } else if (state.ended) {
          // Wait out the tail of the last scheduled buffer.
          const remaining = nextStartTime - ctx.currentTime;
          if (remaining > 0) {
            await new Promise((r) => { setTimeout(r, remaining * 1000 + 20); });
          }
          return;
        } else {
          // Underrun despite the gate: the machine's jitter exceeds the
          // cushion. Ratchet it up for the rest of the session so this
          // converges to zero recurrences, then refill before resuming.
          this.underruns += 1;
          this.cushionS = Math.min(CUSHION_MAX_S, this.cushionS + CUSHION_RATCHET_S);
          console.warn(
            `[stream-audio] underrun #${this.underruns} — cushion → ${this.cushionS.toFixed(1)}s`,
          );
          await this.waitForBuffer(state, this.cushionS, CUSHION_WAIT_CAP_MS);
        }
      }
    } finally {
      state.playing = false;
      this.streams.delete(streamId);
    }
  }

  /** Stop all streams immediately (interrupt / new conversation). */
  stopAll() {
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    });
    this.activeSources.clear();
    this.streams.forEach((state) => {
      state.stopped = true;
      this.wake(state);
    });
    this.streams.clear();
    this.dropped.clear();
    // Release the audio device promptly instead of letting the context keep
    // rendering silence until the browser's own silence timeout kicks in.
    // play() resumes the context on the next stream, so this is transparent —
    // but the OS sees the stream go idle immediately, which matters for
    // audio-session policies keyed to stream activity (e.g. ducking).
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  /** Live RMS of whatever is currently audible, boosted for lip-sync. */
  getCurrentRms(): number {
    if (!this.analyser || !this.analyserBuf || this.activeSources.size === 0) {
      return 0;
    }
    this.analyser.getFloatTimeDomainData(this.analyserBuf);
    let sum = 0;
    for (let i = 0; i < this.analyserBuf.length; i += 1) {
      sum += this.analyserBuf[i] * this.analyserBuf[i];
    }
    return Math.sqrt(sum / this.analyserBuf.length) * LIP_SYNC_SCALE;
  }
}

export const streamAudioPlayer = new StreamAudioPlayer();

/** Read by the Live2D update loop (lappmodel.ts) each frame. */
export function getStreamingLipSyncRms(): number {
  return streamAudioPlayer.getCurrentRms();
}
