import test from 'node:test';
import assert from 'node:assert/strict';
import { captureTiming, shakerSamples, filterCaptureSamples, alignCaptureStart } from '../probe/saezuri/capture-support.js';
import { analyzeSamples, analyzeFrames, quantizeSegments } from '../probe/saezuri/analyzer.js';
test('latency shifts the whole four-bar capture window, preserving its end',()=>{
 const plan=captureTiming({anchor:1,tempo:120,sampleRate:48000,baseLatency:0.0026666667,outputLatency:0.022,inputLatency:0.02,manualMs:80});
 assert.ok(Math.abs(plan.correctionSeconds-0.1246666667)<1e-9);
 assert.equal(plan.endFrame-plan.startFrame,384000);
 assert.equal(plan.musicalStart,5);
 assert.equal(plan.countTimes.length,22);
 assert.deepEqual(plan.countTimes.slice(0,7),[1,2,3,3.5,4,4.5,5]);
 assert.deepEqual(plan.countBeats.slice(0,7),[0,2,4,5,6,7,8]);
 assert.equal(plan.countTimes[6],5);
 assert.equal(plan.countTimes.at(-1),12.5);
});
test('bar-head shaker is longer and stronger than ordinary beats',()=>{
 const regular=shakerSamples(48000),accent=shakerSamples(48000,true);
 assert.ok(accent.length>=regular.length*1.5);
 const peak=s=>s.reduce((p,x)=>Math.max(p,Math.abs(x)),0);
 assert.ok(peak(accent)>=peak(regular)*1.8);
});

for(const sr of [44100,48000]) test(`bar-head shaker uses the higher band, ordinary beats the lower band at ${sr}`,()=>{
 const power=(samples,from,to)=>{
  let total=0;
  for(let hz=from;hz<=to;hz+=100){
   let re=0,im=0;
   for(let i=0;i<samples.length;i++){
    re+=samples[i]*Math.cos(2*Math.PI*hz*i/sr);
    im+=samples[i]*Math.sin(2*Math.PI*hz*i/sr);
   }
   total+=re*re+im*im;
  }
  return total;
 };
 const regular=shakerSamples(sr),accent=shakerSamples(sr,true);
 assert.ok(power(accent,8600,10400)>power(accent,6600,8400)*10);
 assert.ok(power(regular,6600,8400)>power(regular,8600,10400)*10);
});
test('unknown latency does not invent a measurement and explicit adjustment may be negative',()=>{
 const plan=captureTiming({anchor:1,tempo:180,sampleRate:44100,manualMs:-50});
 assert.equal(plan.correctionSeconds,-0.05);
 assert.equal(plan.estimatedLatencySeconds,0);
 assert.equal(plan.endFrame-plan.startFrame,235200);
});
test('silent visual count does not include output-device latency',()=>{
 const plan=captureTiming({anchor:1,tempo:120,sampleRate:48000,baseLatency:0.01,outputLatency:0.15,inputLatency:0.02,audibleCount:false});
 assert.equal(plan.correctionSeconds,0.02);
});
test('explicit align shifts the candidate only and keeps internal rests and lengths',()=>{
 const pattern={bars:4,gridStep:1,notes:[{id:'a',midi:55,startTick:1,durationTick:3,completedRanges:[{start:0.2,end:0.3}]},{id:'b',midi:52,startTick:6,durationTick:2}]};
 const result=alignCaptureStart(pattern,120);
 assert.deepEqual(result.notes.map(n=>[n.startTick,n.durationTick]),[[0,3],[5,2]]);
 assert.equal(pattern.notes[0].startTick,1);
 assert.equal(result.notes[0].completedRanges[0].start,0.07500000000000001);
});
for(const sr of [44100,48000]) test(`shaker spill is suppressed without removing low or high melody at ${sr}`,()=>{
 const samples=new Float32Array(sr);
 samples.set(shakerSamples(sr,true),0);
 samples.set(shakerSamples(sr),Math.round(0.5*sr));
 const filtered=filterCaptureSamples(samples,sr);
 assert.ok(Math.max(...filtered)<0.008);
 assert.ok(analyzeSamples(filtered,sr).every(f=>f.kind==='silence'));
 for(const midi of [48,69,96]) {
  const mixed=Float32Array.from(samples,(value,i)=>value+0.15*Math.sin(2*Math.PI*440*2**((midi-69)/12)*i/sr));
  const frames=analyzeSamples(filterCaptureSamples(mixed,sr),sr);
  const notes=quantizeSegments(analyzeFrames(frames,{endSeconds:1,smoothingMs:80,tempo:120}).segments,120);
  assert.equal(notes.length,1);
  assert.equal(notes[0].midi,midi);
  assert.equal(notes[0].startTick,0);
 }
});
