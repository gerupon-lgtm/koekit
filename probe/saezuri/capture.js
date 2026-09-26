import { microphoneEnabled, onMicrophoneChange } from '../../src/speech/microphone.js';
import { captureTiming, scheduleShaker } from './capture-support.js';
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
      const inputSettings = stream.getAudioTracks()[0]?.getSettings() || {};
      const anchor = this.ctx.currentTime + 0.35;
      this.timing = captureTiming({ anchor, tempo, sampleRate: this.ctx.sampleRate, baseLatency: this.ctx.baseLatency,
        outputLatency: this.ctx.outputLatency, inputLatency: inputSettings.latency, manualMs: options.manualMs || 0, audibleCount: !!options.countSound });
      this.anchor = anchor; this.tempo = tempo;
      this.startTime = this.timing.musicalStart;
      this.endTime = this.timing.endFrame / this.ctx.sampleRate;
      this.node.port.postMessage({ type: 'start', startFrame: this.timing.startFrame, endFrame: this.timing.endFrame });
      if (options.countSound) for (let i = 0; i < this.timing.countTimes.length; i++) {
        const beat = this.timing.countBeats[i];
        if (beat >= 8 && !options.recordCount) break;
        this.counts.push(scheduleShaker(this.ctx, this.timing.countTimes[i], beat % 4 === 0));
      }
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
          const { deviceId, groupId, ...diagnosticSettings } = inputSettings;
          this.onResult({ ...result, inputSettings: diagnosticSettings, processing: options.processing, countSound: options.countSound,
            recordCount: options.recordCount, timing: this.timing });
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
