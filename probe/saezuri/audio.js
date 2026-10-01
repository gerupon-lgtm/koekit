// ML-T01 only: locally synthesized comparison voices, not approved instrument assets.
import { tickSeconds } from '../../saezuri/document.js';
import { schedulePlaybackCount, COUNT_STYLES } from './playback-count.js';
export function scheduleVoice(ctx, output, { midi, time, duration, instrument = 'piano', gain = 0.16 }) {
  if(/^(electro-)?(kick|snare|hat)$/.test(instrument))return schedulePercussion(ctx,output,{time,duration,instrument,gain});
  // A sustained, band-limited saw-like lead, synthesized locally.
  const harmonics = { sine: [1], piano: [1, 0.35, 0.16, 0.08], wood: [1, 0, 0.12], soft: [1, 0.12, 0.04],
    lead: Array.from({length:10},(_,i)=>1/(i+1)) }[instrument];
  if (!harmonics) throw new Error('INSTRUMENT_UNKNOWN');
  const envelope = ctx.createGain();
  envelope.connect(output);
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(gain, time + 0.008);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, gain * (instrument === 'wood' ? 0.02 : instrument === 'lead' ? .8 : 0.25)), time + Math.max(0.016, duration));
  envelope.gain.linearRampToValueAtTime(0, time + duration + 0.06);
  const oscillators = harmonics.map((amplitude, i) => {
    if (!amplitude || 440 * 2 ** ((midi - 69) / 12) * (i + 1) >= ctx.sampleRate/2) return null;
    const oscillator = ctx.createOscillator(), level = ctx.createGain();
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12) * (i + 1);
    level.gain.value = amplitude / harmonics.reduce((a,b) => a+b,0);
    oscillator.connect(level).connect(envelope);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.065);
    oscillator.onended = () => { oscillator.disconnect(); level.disconnect(); };
    return oscillator;
  }).filter(Boolean);
  const last = oscillators.at(-1);
  if (last) {const cleanup=last.onended;last.onended=()=>{cleanup();envelope.disconnect();};}
  else envelope.disconnect();
  return () => { envelope.disconnect(); for (const node of oscillators) { try { node.stop(); } catch {} } };
}

function schedulePercussion(ctx,output,{time,duration,instrument,gain}){
 const electronic=instrument.startsWith('electro-'),kind=instrument.replace('electro-',''),length=Math.min(duration,kind==='kick'?.18:kind==='snare'?.12:.045);
 const level=ctx.createGain();level.connect(output);level.gain.setValueAtTime(Math.max(.0001,gain),time);level.gain.exponentialRampToValueAtTime(.0001,time+length);
 let source,filter;
 if(kind==='kick'){
  source=ctx.createOscillator();source.type=electronic?'sine':'triangle';source.frequency.setValueAtTime(electronic?145:100,time);source.frequency.exponentialRampToValueAtTime(42,time+length);source.connect(level);
 }else{
  source=ctx.createBufferSource();const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate),data=buffer.getChannelData(0);let seed=917;
  for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/2**32)*2-1;}
  source.buffer=buffer;filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=kind==='hat'?(electronic?6500:4200):800;source.connect(filter).connect(level);
 }
 const cleanup=()=>{source.disconnect();filter?.disconnect();level.disconnect();};source.onended=cleanup;source.start(time);source.stop(time+length+.005);
 return ()=>{try{source.stop();}catch{}cleanup();};
}
export class ProbeTransport {
  constructor(ctx, onStop, mixer=null) { this.ctx = ctx; this.onStop = onStop; this.mixer=mixer;this.serial = 0; this.voices = new Set(); this.active = false; }
  start(notes, { tempo = 120, totalTicks = 64, instrument = 'piano', lead = 0.35, ahead = 0.15, countSound = false, countVolume = 1, countStyle = 'rim', accompaniment = [], loop = false } = {}) {
    this.stop(false);
    if (!COUNT_STYLES.includes(countStyle)) throw new Error('COUNT_STYLE_UNKNOWN');
    if (this.ctx.state !== 'running') throw new Error('AUDIO_NOT_READY');
    const serial = this.serial;
    this.anchor = this.ctx.currentTime + lead;
    this.tempo = tempo;
    this.totalTicks = totalTicks;
    this.loop=loop;
    this.active = true;
    this.metrics = { events: 0, accompanimentEvents:0, countEvents: 0, maxTimerGapMs: 0, aheadMs: ahead * 1000, leadMs: lead * 1000 };
    const queue = [...notes.map(n=>({...n,accompaniment:false})),...accompaniment.map(n=>({...n,accompaniment:true}))].sort((a,b) => a.startTick - b.startTick);
    let index = 0, cycle = 0, countTick = 0, previous = performance.now();
    const pump = (prime = false) => {
      if (serial !== this.serial) return;
      const wall = performance.now();
      this.metrics.maxTimerGapMs = Math.max(this.metrics.maxTimerGapMs, wall - previous);
      previous = wall;
      const now = this.ctx.currentTime;
      // Queue the musical head before synchronous UI work can consume the lead.
      const horizon = prime ? Math.max(now + ahead, this.anchor + ahead) : now + ahead;
      for (const voice of this.voices) if (voice.end < now) this.voices.delete(voice);
      if (this.ctx.state !== 'running') return this.stop(true, 'AUDIO_INTERRUPTED');
      while (countSound && (loop || countTick < totalTicks)) {
        const time = this.anchor + tickSeconds(countTick, tempo);
        if (time > horizon) break;
        if (time < now - 0.04) return this.stop(true, 'SCHEDULER_LATE');
        const stop = schedulePlaybackCount(this.ctx, Math.max(now,time), countTick % 16 === 0, this.mixer?1:countVolume, countStyle,this.mixer?.count??this.ctx.destination);
        this.voices.add({stop, end:time+0.15});
        countTick += 4; this.metrics.countEvents++;
      }
      while (queue.length && (loop || index < queue.length)) {
        if(index===queue.length){index=0;cycle++;}
        const note = queue[index], time = this.anchor + tickSeconds(cycle*totalTicks+note.startTick, tempo);
        if (time > horizon) break;
        if (time < now - 0.04) return this.stop(true, 'SCHEDULER_LATE');
        const duration = tickSeconds(note.durationTick, tempo);
        const stop = scheduleVoice(this.ctx, this.mixer?(note.accompaniment?this.mixer.backing:this.mixer.melody):this.ctx.destination, { midi: note.midi, time: Math.max(now, time), duration, instrument:note.accompaniment?note.instrument:instrument, gain:note.accompaniment?note.gain:.16 });
        this.voices.add({ stop, end: time + duration + 0.07 });
        index++; this.metrics[note.accompaniment?'accompanimentEvents':'events']++;
      }
      if (!loop && now >= this.anchor + tickSeconds(totalTicks, tempo) + 0.08) this.stop(true, 'ENDED');
    };
    this.timer = setInterval(pump, 25);
    pump(true);
  }
  position() {const tick=Math.max(0,(this.ctx.currentTime-this.anchor)*this.tempo*4/60);return this.active?(this.loop?tick%this.totalTicks:Math.min(this.totalTicks,tick)):0;}
  stop(notify = true, reason = 'STOPPED') {
    this.serial++;
    clearInterval(this.timer);
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    const wasActive = this.active;
    this.active = false;
    if (notify && wasActive) this.onStop?.(reason, this.metrics);
  }
}
