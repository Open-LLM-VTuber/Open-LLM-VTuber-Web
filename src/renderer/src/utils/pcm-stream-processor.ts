const RING_BUFFER_SIZE = 24000 * 30; // 30s at 24kHz
const RMS_REPORT_SAMPLES = 2400; // Report RMS every ~100ms at 24kHz

const processorCode = `
class PCMStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(${RING_BUFFER_SIZE});
    this.writePos = 0;
    this.readPos = 0;
    this.ended = false;
    this.rmsAccum = 0;
    this.rmsSamples = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'chunk') {
        const pcm = e.data.pcm;
        const bufLen = this.buffer.length;
        for (let i = 0; i < pcm.length; i++) {
          this.buffer[(this.writePos + i) % bufLen] = pcm[i];
        }
        this.writePos += pcm.length;
      } else if (e.data.type === 'end') {
        this.ended = true;
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    const available = this.writePos - this.readPos;
    const needed = output.length;
    const bufLen = this.buffer.length;

    if (available >= needed) {
      for (let i = 0; i < needed; i++) {
        const sample = this.buffer[(this.readPos + i) % bufLen];
        output[i] = sample;
        this.rmsAccum += sample * sample;
      }
      this.readPos += needed;
      this.rmsSamples += needed;

      if (this.rmsSamples >= ${RMS_REPORT_SAMPLES}) {
        const rms = Math.sqrt(this.rmsAccum / this.rmsSamples);
        this.port.postMessage({ type: 'rms', value: rms });
        this.rmsAccum = 0;
        this.rmsSamples = 0;
      }
      return true;
    }

    output.fill(0);
    const done = this.ended && available < needed;
    if (done) {
      this.port.postMessage({ type: 'ended' });
    }
    return !done;
  }
}
registerProcessor('pcm-stream-processor', PCMStreamProcessor);
`;

let blobUrl: string | null = null;

export function getProcessorBlobUrl(): string {
  if (!blobUrl) {
    const blob = new Blob([processorCode], { type: 'application/javascript' });
    blobUrl = URL.createObjectURL(blob);
  }
  return blobUrl;
}
