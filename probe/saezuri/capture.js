import { microphoneEnabled, onMicrophoneChange } from '../../src/speech/microphone.js';
import { captureTiming, scheduleShaker, prepareShaker } from './capture-support.js?v=v0.1.0-20261002222541-da565ef';
import {loopCaptureTiming} from './loop-timing.js?v=v0.1.0-20261002222541-da565ef';
export class ProbeCapture {
  constructor(ctx, onState, onResult, mixer=null) {
    this.ctx = ctx; this.onState = onState; this.onResult = onResult;this.mixer=mixer; this.serial = 0; this.counts = [];
    this.unsubscribe = onMicrophoneChange(enabled => { if (!enabled) this.cancel('MIC_DISABLED'); });
  }
  async connectInput(options,sessionId){
    const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:options.processing,noiseSuppression:options.processing,autoGainControl:options.processing}});
    if(sessionId!==this.serial){stream.getTracks().forEach(t=>t.stop());return false;}
    this.stream=stream;
    await this.ctx.audioWorklet.addModule(new URL('./worklet.js?v=v0.1.0-20261002222541-da565ef',import.meta.url));
    if(sessionId!==this.serial)return false;
    this.node=new AudioWorkletNode(this.ctx,'saezuri-capture-probe');this.source=this.ctx.createMediaStreamSource(stream);
    this.silent=this.ctx.createGain();this.silent.gain.value=0;this.source.connect(this.node).connect(this.silent).connect(this.ctx.destination);
    this.inputSettings=stream.getAudioTracks()[0]?.getSettings()||{};
    return true;
  }
  async prepareLoop(options){
    this.cancel();const sessionId=this.serial;
    if(!microphoneEnabled())throw new Error('MIC_DISABLED');
    this.active=true;this.onState('preparing');
    try{
      if(!await this.connectInput(options,sessionId))return;
      this.node.port.postMessage({type:'prepare'});this.active=false;this.ready=true;this.onState('loop-ready');
    }catch(error){if(sessionId===this.serial){this.cancel();throw error;}}
  }
  async start(tempo, options) {
    const prepared=!!options.loop&&this.ready;
    if(!prepared)this.cancel();else this.ready=false;
    const sessionId = this.serial;
    if (!microphoneEnabled()) throw new Error('MIC_DISABLED');
    this.active = true;
    if(!prepared)this.onState('preparing');
    let stream;
    try {
      if(!prepared&&!await this.connectInput(options,sessionId))return;
      const inputSettings = this.inputSettings;
      if(options.countSound){prepareShaker(this.ctx,false);prepareShaker(this.ctx,true);}
      // Give the singer a short preparation pause after opening the microphone.
      // Keep all counts and capture frames on the same audio-clock anchor.
      const preparedAudioTime = this.ctx.currentTime, startLeadSeconds = 1;
      const anchor = preparedAudioTime + startLeadSeconds;
      const audibleCount=!!options.countSound&&(this.mixer?this.mixer.levels.count*this.mixer.levels.master>0:(options.countVolume??1)>0);
      this.timing = captureTiming({ anchor, tempo, sampleRate: this.ctx.sampleRate, baseLatency: this.ctx.baseLatency,
        outputLatency: this.ctx.outputLatency, inputLatency: inputSettings.latency, manualMs: options.manualMs || 0, audibleCount });
      if(options.loop)this.timing=loopCaptureTiming({musicalStart:options.loop.musicalStart,bars:options.loop.bars,tempo,sampleRate:this.ctx.sampleRate,baseLatency:this.ctx.baseLatency,outputLatency:this.ctx.outputLatency,inputLatency:inputSettings.latency,manualMs:options.manualMs||0});
      this.timing.preparedAudioTime=preparedAudioTime;this.timing.startLeadSeconds=options.loop?this.timing.musicalStart-preparedAudioTime:startLeadSeconds;
      this.anchor = options.loop?this.timing.musicalStart:anchor; this.tempo = tempo;
      this.startTime = this.timing.musicalStart;
      const acousticSync=!options.loop && !!options.acousticSync && audibleCount;
      const captureStartFrame=acousticSync?Math.round((anchor-.1)*this.ctx.sampleRate):this.timing.startFrame;
      const captureEndFrame=acousticSync?Math.round((this.timing.musicalStart+16*60/tempo+Math.max(1.2,this.timing.correctionSeconds))*this.ctx.sampleRate):this.timing.endFrame;
      this.timing.captureStartFrame=captureStartFrame;this.timing.captureEndFrame=captureEndFrame;
      this.endTime = captureEndFrame / this.ctx.sampleRate;
      this.node.port.postMessage({ type: 'start', startFrame: captureStartFrame, endFrame: captureEndFrame });
      if (options.countSound&&!options.loop) for (let i = 0; i < this.timing.countTimes.length; i++) {
        const beat = this.timing.countBeats[i];
        if (beat >= 8 && !options.recordCount) break;
        this.counts.push(scheduleShaker(this.ctx, this.timing.countTimes[i], beat % 4 === 0, this.mixer?1:options.countVolume??1,this.mixer?.count??this.ctx.destination));
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
        const worker = this.worker = new Worker(new URL('./worker.js?v=v0.1.0-20261002222541-da565ef', import.meta.url), { type: 'module' });
        worker.onerror = () => {if(sessionId===this.serial)this.cancel('ANALYSIS_FAILED');};
        worker.onmessage = ({ data: result }) => {
          if (sessionId !== this.serial) return;
          worker.terminate(); this.worker = null; this.active = false;
          const { deviceId, groupId, ...diagnosticSettings } = inputSettings;
          this.onResult({ ...result, inputSettings: diagnosticSettings, processing: options.processing, countSound: options.countSound,
            recordCount: options.recordCount, bars:options.loop?.bars??4, timing: result.timing || this.timing });
        };
        worker.postMessage({ samples: data.samples, sampleRate: data.sampleRate, tempo, sessionId, options, timing: this.timing, acousticSync }, [data.samples.buffer]);
      };
    } catch (error) {
      stream?.getTracks().forEach(t => t.stop());
      if (sessionId === this.serial) { this.cancel(); throw error; }
    }
  }
  releaseInput() {
    this.ready=false;
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
