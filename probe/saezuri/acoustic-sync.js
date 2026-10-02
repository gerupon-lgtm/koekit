import { shakerSamples } from './capture-support.js?v=v0.1.0-20261002215245-e39d004';

const median = values => { const a=[...values].sort((x,y)=>x-y); return (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2; };
// A second difference suppresses voice fundamentals. Apply the identical,
// zero-phase operation to the recorded signal and the known click template.
function highBand(samples) {
 const out=new Float32Array(samples.length);
 for(let i=1;i<samples.length-1;i++)out[i]=samples[i-1]-2*samples[i]+samples[i+1];
 return out;
}
function locate(signal, template, sampleRate, start, end) {
 const lo=Math.max(0,Math.ceil(start*sampleRate)), hi=Math.min(signal.length-template.length,Math.floor(end*sampleRate));
 if(hi<lo)return null;
 const scoreAt=(at,stride)=>{
  let dot=0,aa=0,bb=0;
  for(let j=1;j<template.length-1;j+=stride){const a=signal[at+j],b=template[j];dot+=a*b;aa+=a*a;bb+=b*b;}
  return {score:aa&&bb?Math.abs(dot)/Math.sqrt(aa*bb):0,rms:Math.sqrt(aa/Math.ceil((template.length-2)/stride))};
 };
 let best={score:0,at:lo,rms:0};
 // Sparse dot products locate the peak; full-rate refinement validates it.
 for(let at=lo;at<=hi;at+=2){const r=scoreAt(at,4);if(r.score>best.score)best={...r,at};}
 const coarse=best.at;best={score:0,at:coarse,rms:0};
 for(let at=Math.max(lo,coarse-3);at<=Math.min(hi,coarse+3);at++){const r=scoreAt(at,1);if(r.score>best.score)best={...r,at};}
 return best.score>=.35 && best.rms>=.0003 ? {time:best.at/sampleRate,confidence:best.score} : null;
}

// Measures only preparation clicks, before the singer is asked to start.
// No voice timing, OS latency estimate or quantized notes influence this result.
export function measureCountDelay({samples,sampleRate,timing,rawStart}) {
 const signal=highBand(samples), templates=[false,true].map(a=>highBand(shakerSamples(sampleRate,a)));
 const observations=[];
 let anchorDelay=null;
 for(let k=0;k<6;k++){
  const expected=timing.countTimes[k]-rawStart, accent=timing.countBeats[k]%4===0;
  const lower=anchorDelay===null?0:Math.max(0,anchorDelay-.045), upper=anchorDelay===null?.75:Math.min(.75,anchorDelay+.045);
  const found=locate(signal,templates[Number(accent)],sampleRate,expected+lower,expected+upper);
  const observation={beat:timing.countBeats[k],scheduledSeconds:timing.countTimes[k],detectedSeconds:found?rawStart+found.time:null,confidence:found?.confidence??0};
  observations.push(observation);
  // The first accented count uniquely anchors the wide search, avoiding a
  // whole-beat alias when latency exceeds a beat on a fast tempo.
  if(k===0){if(!found)return {status:'unavailable',reason:'first-count-not-found',observations,inliers:0};anchorDelay=found.time-expected;}
 }
 const delays=observations.filter(o=>o.detectedSeconds!==null).map(o=>o.detectedSeconds-o.scheduledSeconds);
 const center=median(delays), good=delays.filter(d=>Math.abs(d-center)<=.012);
 if(good.length<4)return {status:'unavailable',reason:'inconsistent-counts',observations,inliers:good.length};
 const delaySeconds=median(good), spreadSeconds=Math.max(...good)-Math.min(...good);
 if(spreadSeconds>.012)return {status:'unavailable',reason:'unstable-counts',observations,inliers:good.length};
 return {status:'measured',delaySeconds,spreadSeconds,inliers:good.length,observations};
}

export function selectCaptureWindow({sampleRate,timing,rawStart,tempo,measurement,manualMs=0}) {
 const measured=measurement.status==='measured';
 const correctionSeconds=measured?measurement.delaySeconds+manualMs/1000:timing.correctionSeconds;
 const startFrame=measured?Math.round((timing.musicalStart+correctionSeconds)*sampleRate):timing.startFrame;
 return {offset:startFrame-Math.round(rawStart*sampleRate),length:Math.round(16*60/tempo*sampleRate),startFrame,correctionSeconds,source:measured?'acoustic':'estimated'};
}
