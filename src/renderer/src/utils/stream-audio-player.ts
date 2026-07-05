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
  // Delivery-rate tracking for the adaptive initial gate.
  firstChunkAt: number | null;
  receivedSeconds: number;
}

// Matches the lipSyncScale boost applied to file-based playback in
// use-audio-task.ts so both paths drive the mouth equally hard.
const LIP_SYNC_SCALE = 2.0;
// Minimal scheduling headroom when (re)anchoring to the context clock.
// Only applied when we're genuinely behind — in-time chunks butt-join
// sample-exactly at nextStartTime with no re-anchor.
const MIN_LEAD_S = 0.02;
// Jitter buffer tunables. A TTS server may deliver audio slower than
// realtime early in a stream; any deficit has to surface as silence
// somewhere. These parameters push it to the least disruptive places:
// before speech starts (reads as "thinking") and, failing that, into a
// single consolidated mid-speech pause rather than repeated gaps.
//
// Initial gate, phase 1: start playback once this much audio is buffered…
const INITIAL_BUFFER_S = 0.35;
// …but only if delivery is keeping up with realtime. Below this measured
// production rate (audio-seconds per wall-second since the first chunk),
// enter phase 2 and buffer further before starting.
const HEALTHY_RATE = 0.95;
// Initial gate, phase 2 target for slow streams.
const SLOW_INITIAL_BUFFER_S = 1.0;
// Wall-clock caps for each phase — play what we have rather than wait longer.
const INITIAL_WAIT_MS = 700;
const SLOW_INITIAL_WAIT_MS = 2000;
// Underrun refill: one big cushion (or end-of-stream) so a slow stream
// pauses at most once mid-speech instead of cracking chunk after chunk.
const REFILL_BUFFER_S = 2.0;
const REFILL_WAIT_MS = 2500;

class StreamAudioPlayer {
  private ctx: AudioContext | null = null;

  private analyser: AnalyserNode | null = null;

  private gain: GainNode | null = null;

  private analyserBuf: Float32Array | null = null;

  private streams = new Map<string, StreamState>();

  private dropped = new Set<string>();

  private activeSources = new Set<AudioBufferSourceNode>();

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
        firstChunkAt: null,
        receivedSeconds: 0,
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
    if (state.firstChunkAt === null) state.firstChunkAt = performance.now();
    state.receivedSeconds += float32.length / state.sampleRate;
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

    // Initial gate, phase 1: a small cushion so marginally-late chunks
    // don't force an immediate underrun.
    await this.waitForBuffer(state, INITIAL_BUFFER_S, INITIAL_WAIT_MS);
    // Phase 2: if delivery is measurably slower than realtime, pay the
    // deficit up front (reads as latency) instead of mid-speech (reads
    // as broken audio). Fast servers skip this entirely.
    if (!state.stopped && !state.ended && state.firstChunkAt !== null) {
      const elapsed = (performance.now() - state.firstChunkAt) / 1000;
      const rate = elapsed > 0.2 ? state.receivedSeconds / elapsed : Infinity;
      if (rate < HEALTHY_RATE) {
        await this.waitForBuffer(state, SLOW_INITIAL_BUFFER_S, SLOW_INITIAL_WAIT_MS);
      }
    }

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
          // Underrun: generation fell behind playback despite the initial
          // gate. Refill one big cushion (or reach end-of-stream) so the
          // stream pauses at most once instead of gapping repeatedly.
          await this.waitForBuffer(state, REFILL_BUFFER_S, REFILL_WAIT_MS);
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
