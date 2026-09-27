// Preview percussion only. Recording keeps the calibrated shaker waveform.
import { scheduleShaker } from './capture-support.js';
const cache = new WeakMap();
export const COUNT_STYLES = ['rim','stick','tambourine','shaker'];

export function percussionSamples(sampleRate, style, accent=false) {
  if (!COUNT_STYLES.includes(style) || style==='shaker') throw new Error('COUNT_STYLE_UNKNOWN');
  const duration = {rim:.045,stick:.018,tambourine:.12}[style] * (accent ? 1.15 : 1);
  const samples = new Float32Array(Math.ceil(sampleRate*duration));
  let seed=431, low=0, previous=0, peak=0;
  for (let i=0;i<samples.length;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1, t=i/sampleRate;
    low+=.22*(noise-low);
    // Broad noise bands: no periodic oscillator or pitched resonator.
    const band=style==='rim' ? low*.8+(noise-previous)*.22
      : style==='stick' ? noise-previous : noise-low;
    previous=noise;
    const envelope=Math.min(1,t/.0005)*Math.exp(-t/(duration/6)) * (1-i/samples.length);
    samples[i]=band*envelope;peak=Math.max(peak,Math.abs(samples[i]));
  }
  const level=accent ? .3 : .2;
  for(let i=0;i<samples.length;i++) samples[i]*=level/peak;
  return samples;
}

export function schedulePlaybackCount(ctx,time,accent=false,volume=1,style='rim') {
  if (!COUNT_STYLES.includes(style)) throw new Error('COUNT_STYLE_UNKNOWN');
  if (style==='shaker') return scheduleShaker(ctx,time,accent,volume);
  let buffers=cache.get(ctx);
  if(!buffers) cache.set(ctx,buffers=new Map());
  const key=`${style}:${accent}`;
  if(!buffers.has(key)) {
    const samples=percussionSamples(ctx.sampleRate,style,accent);
    const buffer=ctx.createBuffer(1,samples.length,ctx.sampleRate);
    buffer.copyToChannel(samples,0); buffers.set(key,buffer);
  }
  const source=ctx.createBufferSource(),gain=ctx.createGain();
  source.buffer=buffers.get(key);gain.gain.value=[.5,1,2].includes(volume)?volume:1;
  source.connect(gain).connect(ctx.destination);
  const disconnect=()=>{source.disconnect();gain.disconnect();};
  source.onended=disconnect;source.start(time);
  return ()=>{try{source.stop();}catch{}disconnect();};
}
