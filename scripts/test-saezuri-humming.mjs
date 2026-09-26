import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSamples, analyzeFrames, quantizeSegments } from '../probe/saezuri/analyzer.js';

function run(pitches, tempo=120, options={}) {
 const frames = pitches.map((midi,i)=>({time:i*0.02,kind:midi===null?'silence':'pitched',midi,confidence:0.95}));
 return quantizeSegments(analyzeFrames(frames,{endSeconds:pitches.length*0.02,smoothingMs:80,tempo,...options}).segments,tempo);
}
test('average vibrato before semitone rounding instead of producing a stream of notes',()=>{
 const pitches=Array.from({length:100},(_,i)=>54.2+0.65*Math.sin(2*Math.PI*i/10));
 const notes=run(pitches);
 assert.equal(notes.length,1);
 assert.equal(notes[0].midi,54);
 assert.equal(notes[0].startTick,0);
});
test('seven separated sung notes with wobble become seven notes, preserving silence',()=>{
 const pitches=[55,52,55,50,48,47,55].flatMap(m=>[
  ...Array.from({length:22},(_,i)=>m+0.6*Math.sin(2*Math.PI*i/8)),null,null,null,
 ]);
 const notes=run(pitches);
 assert.deepEqual(notes.map(n=>n.midi),[55,52,55,50,48,47,55]);
 assert.ok(notes.every((n,i)=>!i||n.startTick>notes[i-1].startTick));
});
test('sustained semitone changes and fast sixteenths survive smoothing',()=>{
 const pitches=[60,61,62,61,60,59].flatMap(m=>Array(4).fill(m));
 assert.deepEqual(run(pitches,180).map(n=>n.midi),[60,61,62,61,60,59]);
});
test('a sustained change across the semitone midpoint is retained even below 0.8 semitone',()=>{
 assert.deepEqual(run([...Array(50).fill(60.2),...Array(50).fill(60.9)]).map(n=>n.midi),[60,61]);
});
test('brief octave glitches are rejected but a sustained octave is retained',()=>{
 const pitches=[...Array(20).fill(60),48,...Array(20).fill(60),...Array(20).fill(48)];
 assert.deepEqual(run(pitches).map(n=>n.midi),[60,48]);
});
test('edge octave glitches cannot poison the phrase with NaN pitches',()=>{
 for(const pitches of [[...Array(49).fill(60),48],[48,...Array(49).fill(60)],[60,48]]) {
  const frames=pitches.map((midi,i)=>({time:i*1024/48000,kind:'pitched',midi}));
  const result=analyzeFrames(frames,{endSeconds:pitches.length*1024/48000,smoothingMs:80,tempo:120});
  assert.ok(result.segments.every(s=>Number.isFinite(s.midi)));
  if(pitches.length>2) assert.deepEqual(result.segments.map(s=>s.midi),[60]);
 }
});
test('same-pitch rearticulation with silence is not merged; intentional pickup is retained',()=>{
 const notes=run([...Array(6).fill(null),...Array(10).fill(60),...Array(6).fill(null),...Array(10).fill(60)]);
 assert.equal(notes.length,2);
 assert.equal(notes[0].startTick,1);
 assert.ok(notes[1].startTick>notes[0].startTick+notes[0].durationTick);
});
test('waveform-to-notes retains seven wobbling low sung pitches on a sixteenth grid',()=>{
 const sr=48000,tempo=120,midi=[55,52,55,50,48,47,55];
 let phase=0;
 const samples=Float32Array.from({length:sr*8},(_,i)=>{
  const t=i/sr,k=Math.floor(t),within=t-k;
  if(k>=midi.length||within>=0.75)return 0;
  const pitch=midi[k]+0.55*Math.sin(2*Math.PI*5*within);
  phase+=2*Math.PI*440*2**((pitch-69)/12)/sr;
  return 0.2*Math.sin(phase)+0.04*Math.sin(2*phase);
 });
 const frames=analyzeSamples(samples,sr);
 const notes=quantizeSegments(analyzeFrames(frames,{endSeconds:8,smoothingMs:80,tempo}).segments,tempo);
 assert.deepEqual(notes.map(n=>[n.startTick,n.durationTick,n.midi]),midi.map((m,i)=>[i*8,6,m]));
});
test('real contiguous sixteenth semitones survive long-window pitch transitions',()=>{
 const sr=48000,midi=[60,61,62,61,60,59],samples=Float32Array.from({length:sr/2},(_,i)=>0.2*Math.sin(2*Math.PI*440*2**((midi[Math.floor(i/4000)]-69)/12)*i/sr));
 const frames=analyzeSamples(samples,sr);
 const notes=quantizeSegments(analyzeFrames(frames,{endSeconds:0.5,smoothingMs:80,tempo:180}).segments,180);
 assert.deepEqual(notes.map(n=>[n.startTick,n.durationTick,n.midi]),midi.map((m,i)=>[i,1,m]));
});
test('phase-continuous sixteenth semitones also retain every transition',()=>{
 const sr=48000,midi=[60,61,62,61,60,59],samples=new Float32Array(sr*2);
 let phase=0;
 for(let i=0;i<sr/2;i++){phase+=2*Math.PI*440*2**((midi[Math.floor(i/4000)]-69)/12)/sr;samples[i]=0.2*Math.sin(phase);}
 const frames=analyzeSamples(samples,sr);
 const notes=quantizeSegments(analyzeFrames(frames,{endSeconds:2,smoothingMs:80,tempo:180}).segments,180);
 assert.deepEqual(notes.map(n=>[n.startTick,n.durationTick,n.midi]),midi.map((m,i)=>[i,1,m]));
});
