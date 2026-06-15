import { getProcessorBlobUrl } from './pcm-stream-processor';

class AudioManager {
  private currentAudio: HTMLAudioElement | null = null;
  private currentModel: any | null = null;

  // Streaming state
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private streaming = false;
  private currentRms = 0;
  private streamEndResolve: (() => void) | null = null;
  private originalWavUpdate: ((dt: number) => boolean) | null = null;
  private originalWavGetRms: (() => number) | null = null;

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

  async startStream(sampleRate: number, model: any): Promise<void> {
    this.currentModel = model;
    this.streaming = true;
    this.currentRms = 0;

    this.audioContext = new AudioContext({ sampleRate });
    await this.audioContext.audioWorklet.addModule(getProcessorBlobUrl());
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-stream-processor', {
      outputChannelCount: [1],
    });
    this.workletNode.connect(this.audioContext.destination);

    this.workletNode.port.onmessage = (e) => {
      if (e.data.type === 'rms') {
        this.currentRms = e.data.value;
      } else if (e.data.type === 'ended') {
        this.cleanupStream();
      }
    };

    if (model?._wavFileHandler) {
      this.originalWavUpdate = model._wavFileHandler.update.bind(model._wavFileHandler);
      this.originalWavGetRms = model._wavFileHandler.getRms.bind(model._wavFileHandler);
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      model._wavFileHandler.update = () => self.streaming;
      model._wavFileHandler.getRms = () => Math.min(2.0, self.currentRms * 1.5 * 2.0);
    }
  }

  feedStream(data: ArrayBuffer): void {
    if (!this.workletNode) return;

    const int16 = new Int16Array(data);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    this.workletNode.port.postMessage({ type: 'chunk', pcm: float32 }, [float32.buffer]);
  }

  endStream(): Promise<void> {
    if (!this.workletNode) {
      this.cleanupStream();
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.streamEndResolve = resolve;
      this.workletNode!.port.postMessage({ type: 'end' });
    });
  }

  stopStream(): void {
    this.cleanupStream();
  }

  private cleanupStream(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
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

  isStreaming(): boolean {
    return this.streaming;
  }
}

export const audioManager = new AudioManager();
