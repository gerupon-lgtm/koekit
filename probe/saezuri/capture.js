import { microphoneEnabled, onMicrophoneChange } from '../../src/speech/microphone.js';
import { scheduleVoice } from './audio.js';
export class ProbeCapture {
  constructor(ctx, onState, onResult) {
    this.ctx = ctx; this.onState = onState; this.onResult = onResult; this.serial = 0; this.counts = [];
    this.unsubscribe = onMicrophoneChange(enabled => { if (!enabled) this.cancel('MIC_DISABLED'); });
  }
  async start(tempo, options) {
    this.cancel();
    const sessionId = this.serial;
    if (!microphoneEnabled()) throw new Error('MIC_DISABLED');
    this.active = true;
    this.onState('preparing');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: options.processing, noiseSuppression: options.processing, autoGainControl: options.processing } });
      if (sessionId !== this.serial) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      await this.ctx.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
      if (sessionId !== this.serial) return;
      this.node = new AudioWorkletNode(this.ctx, 'saezuri-capture-probe');
      this.source = this.ctx.createMediaStreamSource(stream);
      this.silent = this.ctx.createGain(); this.silent.gain.value = 0;
      this.source.connect(this.node).connect(this.silent).connect(this.ctx.destination);
      const anchor = this.ctx.currentTime + 0.35, beat = 60 / tempo;
      this.startTime = anchor + beat * 8;
      this.endTime = this.startTime + beat * 16;
      this.node.port.postMessage({ type: 'start', startFrame: Math.round(this.startTime * this.ctx.sampleRate), endFrame: Math.round(this.endTime * this.ctx.sampleRate) });
      if (options.countSound) for (const tick of [0, 2, 4, 5, 6, 7]) this.counts.push(scheduleVoice(this.ctx, this.ctx.destination, { midi: 84, time: anchor + tick * beat, duration: 0.04, instrument: 'wood', gain: 0.08 }));
      this.onState('count-in');
      this.timer = setInterval(() => {
        if (sessionId !== this.serial) return;
        if (this.ctx.state !== 'running' || this.ctx.currentTime > this.endTime + 2) return this.cancel('CAPTURE_INTERRUPTED');
        if (this.ctx.currentTime >= this.startTime) this.onState('recording');
      }, 80);
      this.node.port.onmessage = ({ data }) => {
        if (sessionId !== this.serial) return;
        this.releaseInput();
        if (data.written !== data.samples.length) return this.cancel('CAPTURE_INCOMPLETE');
        this.onState('analyzing');
        const worker = this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        worker.onerror = () => this.cancel('ANALYSIS_FAILED');
        worker.onmessage = ({ data: result }) => {
          if (sessionId !== this.serial) return;
          worker.terminate(); this.worker = null; this.active = false;
          this.onResult({ ...result, inputSettings: stream.getAudioTracks()[0]?.getSettings(), processing: options.processing, countSound: options.countSound });
        };
        worker.postMessage({ samples: data.samples, sampleRate: data.sampleRate, tempo, sessionId, options }, [data.samples.buffer]);
      };
    } catch (error) {
      stream?.getTracks().forEach(t => t.stop());
      if (sessionId === this.serial) { this.cancel(); throw error; }
    }
  }
  releaseInput() {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    if (this.node) { this.node.port.onmessage = null; this.node.port.postMessage({ type: 'cancel' }); this.node.disconnect(); this.node.port.close(); }
    this.node = null;
    this.source?.disconnect(); this.source = null;
    this.silent?.disconnect(); this.silent = null;
    this.counts.forEach(stop => stop()); this.counts = [];
  }
  cancel(reason) {
    this.serial++;
    this.releaseInput(); this.worker?.terminate(); this.worker = null;
    const active = this.active; this.active = false;
    if (active) this.onState('idle', reason);
  }
}
