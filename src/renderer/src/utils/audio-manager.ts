import { getProcessorBlobUrl } from './pcm-stream-processor';

class AudioManager {
  private currentAudio: HTMLAudioElement | null = null;
  private currentModel: any | null = null;

  // Streaming state
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletReady = false;
  private streaming = false;
  private currentRms = 0;
  private streamEndResolve: (() => void) | null = null;
  private originalWavUpdate: ((dt: number) => boolean) | null = null;
  private originalWavGetRms: (() => number) | null = null;
  private pendingChunks: ArrayBuffer[] = [];
  private drainingNode: AudioWorkletNode | null = null;

  setCurrentAudio(audio: HTMLAudioElement, model: any) {
    this.currentAudio = audio;
    this.currentModel = model;
  }

  stopCurrentAudioAndLipSync() {
    if (this.streaming) {
      this.stopStream();
      return;
    }

    if (this.currentAudio) {
      const audio = this.currentAudio;
      audio.pause();
      audio.src = '';
      audio.load();

      const model = this.currentModel;
      if (model?._wavFileHandler) {
        try {
          model._wavFileHandler.releasePcmData();
          model._wavFileHandler._lastRms = 0.0;
          model._wavFileHandler._sampleOffset = 0;
          model._wavFileHandler._userTimeSeconds = 0.0;
        } catch (e) {
          console.error('[AudioManager] Error stopping wavFileHandler:', e);
        }
      }

      this.currentAudio = null;
      this.currentModel = null;
    }
  }

  clearCurrentAudio(audio: HTMLAudioElement) {
    if (this.currentAudio === audio) {
      this.currentAudio = null;
      this.currentModel = null;
    }
  }

  hasCurrentAudio(): boolean {
    return this.currentAudio !== null || this.streaming;
  }

  // --- Streaming API ---

  private async ensureAudioContext(sampleRate: number): Promise<void> {
    if (this.audioContext && this.audioContext.sampleRate === sampleRate && this.workletReady) {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      return;
    }

    if (this.audioContext) {
      await this.audioContext.close().catch(() => {});
      this.workletReady = false;
    }

    this.audioContext = new AudioContext({ sampleRate });
    await this.audioContext.audioWorklet.addModule(getProcessorBlobUrl());
    this.workletReady = true;
  }

  async startStream(sampleRate: number, model: any): Promise<void> {
    this.currentModel = model;
    this.streaming = true;
    this.currentRms = 0;

    await this.ensureAudioContext(sampleRate);

    this.workletNode = new AudioWorkletNode(this.audioContext!, 'pcm-stream-processor', {
      outputChannelCount: [1],
    });
    this.workletNode.connect(this.audioContext!.destination);

    this.workletNode.port.onmessage = (e) => {
      if (e.data.type === 'rms') {
        this.currentRms = e.data.value;
      } else if (e.data.type === 'ended') {
        this.onStreamEnded();
      }
    };

    // Flush chunks that arrived before the worklet was ready
    for (const chunk of this.pendingChunks) {
      this.feedStreamDirect(chunk);
    }
    this.pendingChunks = [];

    if (model?._wavFileHandler) {
      this.originalWavUpdate = model._wavFileHandler.update.bind(model._wavFileHandler);
      this.originalWavGetRms = model._wavFileHandler.getRms.bind(model._wavFileHandler);
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      model._wavFileHandler.update = () => self.streaming;
      model._wavFileHandler.getRms = () => Math.min(2.0, self.currentRms * 1.5 * 2.0);
    }
  }

  private feedStreamDirect(data: ArrayBuffer): void {
    if (!this.workletNode) return;
    const int16 = new Int16Array(data);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    this.workletNode.port.postMessage({ type: 'chunk', pcm: float32 }, [float32.buffer]);
  }

  feedStream(data: ArrayBuffer): void {
    if (this.workletNode) {
      this.feedStreamDirect(data);
    } else {
      this.pendingChunks.push(data);
    }
  }

  endStream(): Promise<void> {
    if (!this.workletNode) {
      this.onStreamEnded();
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.streamEndResolve = resolve;
      this.drainingNode = this.workletNode;
      this.workletNode = null;
      this.drainingNode!.port.postMessage({ type: 'end' });
    });
  }

  private onStreamEnded(): void {
    if (this.drainingNode) {
      this.drainingNode.disconnect();
      this.drainingNode = null;
    }

    const model = this.currentModel;
    if (model?._wavFileHandler) {
      if (this.originalWavUpdate) {
        model._wavFileHandler.update = this.originalWavUpdate;
        this.originalWavUpdate = null;
      }
      if (this.originalWavGetRms) {
        model._wavFileHandler.getRms = this.originalWavGetRms;
        this.originalWavGetRms = null;
      }
      model._wavFileHandler._lastRms = 0.0;
    }

    this.streaming = false;
    this.currentRms = 0;
    this.currentModel = null;

    if (this.streamEndResolve) {
      this.streamEndResolve();
      this.streamEndResolve = null;
    }
  }

  stopStream(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.drainingNode) {
      this.drainingNode.disconnect();
      this.drainingNode = null;
    }
    this.pendingChunks = [];
    this.onStreamEnded();
  }

  isStreaming(): boolean {
    return this.streaming;
  }
}

export const audioManager = new AudioManager();
