// Captures exactly the sample-index interval after the count-in. No network or storage.
class CaptureProbe extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = null;
    this.ring=null;this.ringEnd=0;
    this.port.onmessage = ({ data }) => {
      if(data.type==='prepare'){this.ring=new Float32Array(Math.ceil(sampleRate*1.2));this.ringEnd=currentFrame;}
      else if (data.type === 'start') {
        this.start = data.startFrame;
        this.end = data.endFrame;
        this.buffer = new Float32Array(this.end - this.start);
        this.written = 0;
        if(this.ring){const first=Math.max(this.start,this.ringEnd-this.ring.length),last=Math.min(this.end,this.ringEnd);for(let frame=first;frame<last;frame++)this.buffer[frame-this.start]=this.ring[frame%this.ring.length];this.written=Math.max(0,last-first);}
      } else {this.buffer = null;this.ring=null;}
    };
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if(this.ring&&channel){for(let i=0;i<channel.length;i++)this.ring[(currentFrame+i)%this.ring.length]=channel[i];this.ringEnd=currentFrame+channel.length;}
    if (!this.buffer) return true;
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
