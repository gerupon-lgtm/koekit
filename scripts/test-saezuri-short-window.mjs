import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSamples, analyzeFrames } from '../probe/saezuri/analyzer.js';
import { filterCaptureSamples, shakerSamples } from '../probe/saezuri/capture-support.js';

function melody(sr, notes=[55,61], seconds=1) {
  let phase=0;
  return Float32Array.from({length:Math.round(sr*seconds)},(_,i)=>{
    const midi=notes[Math.floor(i/(sr/6))%notes.length];
    phase+=2*Math.PI*440*2**((midi-69)/12)/sr;
    return .2*Math.sin(phase)+.04*Math.sin(phase*2);
  });
}
for (const sr of [44100,48000]) test(`short-window agreement recovers reliable pitch bodies before a transition at ${sr}`,()=>{
  const samples=melody(sr);
  const original=analyzeSamples(samples,sr,{adaptiveWindow:false});
  const recovered=analyzeSamples(samples,sr,{adaptiveWindow:true});
  assert.ok(recovered.filter(f=>f.kind==='unknown').length<original.filter(f=>f.kind==='unknown').length);
  const rescued=recovered.filter(f=>f.pitchSource==='short-window');
  assert.ok(rescued.length>=4);
  for(let i=0;i<recovered.length;i++) {
    if(original[i].kind!=='unknown') assert.deepEqual(recovered[i],original[i]);
    if(recovered[i].pitchSource==='short-window') {
      assert.equal(original[i].kind,'unknown');
      assert.ok(Math.abs(recovered[i].midi-([55,61][Math.floor(recovered[i].time*6)%2]))<.35);
    }
  }
});

test('recovery leaves already reliable low notes and true silence untouched',()=>{
  for(const midi of [36,37,42]) {
    const samples=melody(48000,[midi],.5);
    assert.deepEqual(analyzeSamples(samples,48000,{adaptiveWindow:true}),analyzeSamples(samples,48000,{adaptiveWindow:false}));
  }
  assert.ok(analyzeSamples(new Float32Array(48000),48000).every(f=>f.kind==='silence'));
});

test('fixed random noise is not recovered as a melody',()=>{
  let seed=1357;
  const samples=Float32Array.from({length:48000},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed/4294967296-.5)*.2;});
  const frames=analyzeSamples(samples,48000);
  assert.equal(frames.filter(f=>f.kind==='pitched').length,0);
});

test('filtered count alone at each volume remains empty',()=>{
  for(const volume of [.5,1,2]) {
    const samples=new Float32Array(48000*2);
    for(let beat=0;beat<4;beat++) {
      const click=shakerSamples(48000,beat===0);
      for(let i=0;i<click.length;i++)samples[beat*24000+i]+=click[i]*volume;
    }
    const frames=analyzeSamples(filterCaptureSamples(samples,48000),48000);
    assert.equal(analyzeFrames(frames,{endSeconds:2,smoothingMs:120,noteMode:'sustain'}).empty,true);
  }
});

test('waveform reattacks survive recovery and same-pitch completion together',()=>{
  let seed=4321;
  const sr=48000,samples=Float32Array.from({length:sr},(_,i)=>{
    const t=i/sr;
    if(t>=.4&&t<.48){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed/4294967296-.5)*.055;}
    return .2*Math.sin(2*Math.PI*196*t);
  });
  const frames=analyzeSamples(samples,sr,{adaptiveWindow:true});
  const result=analyzeFrames(frames,{endSeconds:1,maxGapSeconds:.2,smoothingMs:120,noteMode:'sustain'});
  assert.equal(result.segments.length,2);
  assert.ok(result.segments.every(s=>!s.completedRanges.length));
});
