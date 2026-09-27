import test from 'node:test';
import assert from 'node:assert/strict';
import { shakerSamples, captureTiming } from '../probe/saezuri/capture-support.js';
import { measureCountDelay, selectCaptureWindow } from '../probe/saezuri/acoustic-sync.js';

function fixture({tempo=120, sr=48000, delay=.173, missing=[], jitter={}, echo=false, count=true}={}) {
 const timing=captureTiming({anchor:.1,tempo,sampleRate:sr,baseLatency:.01,outputLatency:.02,inputLatency:.01});
 const rawStart=0, samples=new Float32Array(Math.ceil((timing.musicalStart+16*60/tempo+1.2)*sr));
 // Low voice overlaps the last preparation click and all the melody.
 for(let i=0;i<samples.length;i++)samples[i]=.15*Math.sin(2*Math.PI*185*i/sr)+.015*Math.sin(2*Math.PI*370*i/sr);
 if(count) timing.countTimes.slice(0,6).forEach((t,k)=>{
  if(missing.includes(k))return;
  const click=shakerSamples(sr,timing.countBeats[k]%4===0), at=Math.round((t+delay+(jitter[k]||0))*sr);
  for(let j=0;j<click.length;j++) {samples[at+j]+=.35*click[j];if(echo)samples[at+j+Math.round(.027*sr)]+=.12*click[j];}
 });
 return {samples,sampleRate:sr,timing,rawStart,tempo};
}
for(const tempo of [60,120,180]) test(`measures physical delay independently of BPM ${tempo}`,()=>{
 const f=fixture({tempo,echo:true}), r=measureCountDelay(f);
 assert.equal(r.status,'measured');assert.ok(Math.abs(r.delaySeconds-.173)<.003,JSON.stringify(r));assert.ok(r.inliers>=4);
});
test('44.1kHz and a 420ms path are measured',()=>{
 const r=measureCountDelay(fixture({sr:44100,delay:.42,tempo:180}));
 assert.equal(r.status,'measured');assert.ok(Math.abs(r.delaySeconds-.42)<.003);
});
test('missing clicks and one outlier do not bias accepted measurement',()=>{
 const r=measureCountDelay(fixture({missing:[2],jitter:{4:.03}}));
 assert.equal(r.status,'measured');assert.ok(Math.abs(r.delaySeconds-.173)<.003);
});
test('voice without count and insufficient count fail closed',()=>{
 assert.equal(measureCountDelay(fixture({count:false})).status,'unavailable');
 assert.equal(measureCountDelay(fixture({missing:[0,1,2]})).status,'unavailable');
});
test('measured timing REPLACES estimated timing; manual correction is applied once',()=>{
 const f=fixture(), r=selectCaptureWindow({...f,measurement:{status:'measured',delaySeconds:.173},manualMs:20});
 assert.ok(Math.abs(r.correctionSeconds-.193)<1e-9);
 assert.equal(r.offset,Math.round((f.timing.musicalStart+.193)*f.sampleRate));
 assert.equal(r.length,384000);
});
test('unavailable measurement preserves original estimated window exactly',()=>{
 const f=fixture(), r=selectCaptureWindow({...f,measurement:{status:'unavailable'},manualMs:20});
 assert.equal(r.offset,f.timing.startFrame);assert.equal(r.source,'estimated');
});
test('unrelated broadband noise is not accepted as a count',()=>{
 const f=fixture({count:false});let seed=12;
 for(let i=0;i<f.samples.length;i++){seed=(1664525*seed+1013904223)>>>0;f.samples[i]+=.05*(seed/2**32-.5);}
 assert.equal(measureCountDelay(f).status,'unavailable');
});
test('moderate speaker coloration and polarity inversion still match',()=>{
 const f=fixture({echo:true});let prev=0;
 for(let i=0;i<f.samples.length;i++){prev=.4*f.samples[i]+.6*prev;f.samples[i]=-prev;}
 const r=measureCountDelay(f);assert.equal(r.status,'measured');assert.ok(Math.abs(r.delaySeconds-.173)<.003);
});
test('inconsistent per-click delays fail rather than shifting a song',()=>{
 const r=measureCountDelay(fixture({jitter:{1:.03,2:-.03,3:.025,4:-.025,5:.04}}));
 assert.equal(r.status,'unavailable');
});
test('negative manual correction and late tail keep the four-bar window',()=>{
 const f=fixture({delay:.7});
 for(const manualMs of [-200,400]){
  const r=selectCaptureWindow({...f,measurement:{status:'measured',delaySeconds:.7},manualMs});
  assert.ok(r.offset>=0&&r.offset+r.length<=f.samples.length);assert.equal(r.length,384000);
 }
});
