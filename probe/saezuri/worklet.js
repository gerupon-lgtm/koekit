// Captures exactly the sample-index interval after the count-in. No network or storage.
class CaptureProbe extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = null;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'start') {
        this.start = data.startFrame;
        this.end = data.endFrame;
        this.buffer = new Float32Array(this.end - this.start);
        this.written = 0;
      } else this.buffer = null;
    };
  }
  process(inputs) {
    if (!this.buffer) return true;
    const channel = inputs[0]?.[0];
    if (channel) {
      const first = Math.max(this.start, currentFrame), last = Math.min(this.end, currentFrame + channel.length);
      if (last > first) {
        this.buffer.set(channel.subarray(first - currentFrame, last - currentFrame), first - this.start);
        this.written += last - first;
      }
    }
    if (currentFrame >= this.end) {
      const samples = this.buffer;
      this.buffer = null;
      this.port.postMessage({ samples, sampleRate, written: this.written, startFrame: this.start, endFrame: this.end }, [samples.buffer]);
    }
    return true;
  }
}
registerProcessor('saezuri-capture-probe', CaptureProbe);
