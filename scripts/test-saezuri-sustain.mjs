import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFrames,quantizeSegments,analyzeSamples} from '../probe/saezuri/analyzer.js';
import {alignCaptureStart} from '../probe/saezuri/capture-support.js';
const hop=1024/48000;
const render=(frames,endSeconds)=>analyzeFrames(frames,{endSeconds,smoothingMs:80,tempo:120,noteMode:'sustain'});
function framesFor(fn,seconds=2) {
 return Array.from({length:Math.floor(seconds/hop)},(_,i)=>({time:i*hop,kind:'pitched',midi:fn(i*hop),confidence:.95}));
}

test('a short G onset settling into F sharp is one F sharp, retaining the initial rest until explicit alignment',()=>{
 const frames=framesFor(t=>t<.375?55:54,.875);
 for(const frame of frames)if(frame.time<.125)frame.kind='silence';
 const notes=quantizeSegments(render(frames,.875).segments,120);
 assert.deepEqual(notes.map(n=>[n.startTick,n.durationTick,n.midi]),[[1,6,54]]);
 const aligned=alignCaptureStart({bars:4,gridStep:1,notes},120);
 assert.deepEqual(aligned.notes.map(n=>[n.startTick,n.durationTick,n.midi]),[[0,6,54]]);
 assert.equal(notes[0].startTick,1);
});

test('onset settling is symmetric and only applies to a short adjacent semitone before a longer tone',()=>{
 for(const onset of [53,55]) {
  const frames=framesFor(t=>t<.25?onset:54,.75);
  assert.deepEqual(quantizeSegments(render(frames,.75).segments,120).map(n=>[n.startTick,n.durationTick,n.midi]),[[0,6,54]]);
  const detail=analyzeFrames(frames,{endSeconds:.75,smoothingMs:80,tempo:120,noteMode:'detail'});
  assert.equal(detail.segments.length,2);
 }
 for(const [onset,firstDuration,total] of [[55,.5,1],[56,.25,.75],[55,.25,.5]]){
  const result=render(framesFor(t=>t<firstDuration?onset:54,total),total);
  assert.equal(result.segments.length,2,JSON.stringify({onset,firstDuration,total,result}));
 }
 for(const kind of ['silence','unknown']){
  const frames=framesFor(t=>t<.25?55:54,.875);
  for(const frame of frames)if(frame.time>=.25&&frame.time<.375)frame.kind=kind;
  assert.equal(render(frames,.875).segments.length,2);
 }
});

test('a real waveform with an onset semitone drift becomes one note in both boundary modes',()=>{
 const sr=48000;let phase=0;
 const samples=Float32Array.from({length:sr},(_,i)=>{
  if(i<sr*.125||i>=sr*.875)return 0;
  const t=i/sr,midi=t<.375?55:54;
  phase+=2*Math.PI*440*2**((midi-69)/12)/sr;
  return .2*Math.sin(phase)+.05*Math.sin(phase*2);
 });
 for(const boundaryMode of ['window-start','energy-gated']) {
  const notes=quantizeSegments(render(analyzeSamples(samples,sr,{boundaryMode}),1).segments,120);
  assert.equal(notes.length,1,boundaryMode);
  assert.equal(notes[0].midi,54);
 }
});
test('long-tone vibrato stays one note across phases, speeds and semitone-boundary offsets',()=>{
 for(const hz of [4,5,6]) for(const phase of [0,1.1,2.4]) for(const offset of [-.2,0,.2]) {
  const frames=framesFor(t=>54+offset+.85*Math.sin(t*2*Math.PI*hz+phase));
  const result=render(frames,2);
  assert.equal(result.segments.length,1,JSON.stringify({hz,phase,offset,segments:result.segments}));
  assert.equal(result.segments[0].midi,54);
  assert.equal(result.segments[0].end,2);
 }
});
test('settled semitone changes remain separate and are backdated rather than delayed by hold',()=>{
 const result=render(framesFor(t=>t<1?60.2:60.9),2);
 const notes=quantizeSegments(result.segments,120);
 assert.deepEqual(notes.map(n=>[n.startTick,n.durationTick,n.midi]),[[0,8,60],[8,8,61]]);
});

test('a real held semitone change survives vibrato on BOTH notes',()=>{
 for(const hz of [4,5,6])for(const phase of [0,1.1,2.4])for(const offset of [-.2,0,.2]) {
  const frames=framesFor(t=>60+(t<2?0:1)+offset+.85*Math.sin(2*Math.PI*hz*t+phase),4);
  const notes=quantizeSegments(render(frames,4).segments,120);
  assert.equal(notes.length,2,JSON.stringify({hz,phase,offset,notes}));
  assert.deepEqual(notes.map(n=>n.midi),[60,61]);
  assert.ok(Math.abs(notes[1].startTick-16)<=1,JSON.stringify(notes));
  assert.equal(notes.at(-1).startTick+notes.at(-1).durationTick,32);
 }
});

test('held semitone change with vibrato survives waveform detection',()=>{
 const sr=48000;let phase=0;
 const samples=Float32Array.from({length:sr*4},(_,i)=>{
  const t=i/sr,midi=60+(t<2?0:1)+.85*Math.sin(2*Math.PI*5*t+1.1);
  phase+=2*Math.PI*440*2**((midi-69)/12)/sr;
  return .2*Math.sin(phase)+.05*Math.sin(phase*2);
 });
 const notes=quantizeSegments(render(analyzeSamples(samples,sr),4).segments,120);
 assert.deepEqual(notes.map(n=>[n.startTick,n.durationTick,n.midi]),[[0,16,60],[16,16,61]]);
});

test('larger intervals do not create intermediate notes or contaminate the previous pitch',()=>{
 for(const step of [4,5,12]) {
  const notes=quantizeSegments(render(framesFor(t=>60+(t<2?0:step),4),4).segments,120);
  assert.deepEqual(notes.map(n=>[n.startTick,n.durationTick,n.midi]),[[0,16,60],[16,16,60+step]]);
 }
 const sr=48000;let phase=0;
 const samples=Float32Array.from({length:sr*4},(_,i)=>{
  phase+=2*Math.PI*440*2**(((i<sr*2?60:72)-69)/12)/sr;
  return .2*Math.sin(phase)+.05*Math.sin(phase*2);
 });
 const notes=quantizeSegments(render(analyzeSamples(samples,sr),4).segments,120);
 assert.deepEqual(notes.map(n=>[n.startTick,n.durationTick,n.midi]),[[0,16,60],[16,16,72]]);
});

test('separate sung pitches with vibrato keep their rests, starts and durations',()=>{
 const pitches=[55,52,55,50,48,47,55];
 const frames=framesFor(t=>pitches[Math.min(6,Math.floor(t))]+.2+.85*Math.sin(2*Math.PI*5*t+1.1),7);
 for(const frame of frames)if(frame.time%1>=.75)frame.kind='silence';
 const notes=quantizeSegments(render(frames,7).segments,120);
 assert.deepEqual(notes.map(n=>[n.startTick,n.durationTick,n.midi]),pitches.map((m,i)=>[i*8,6,m]));
});

test('detail mode retains rapid semitones; smoothing off remains an explicit comparison',()=>{
 const frames=framesFor(t=>60+Math.min(5,Math.floor(t/.125)),.75);
 const result=analyzeFrames(frames,{endSeconds:.75,smoothingMs:80,tempo:120,noteMode:'detail'});
 assert.deepEqual(quantizeSegments(result.segments,120).map(n=>n.midi),[60,61,62,63,64,65]);
 const wobble=framesFor(t=>54+.85*Math.sin(2*Math.PI*5*t));
 assert.ok(analyzeFrames(wobble,{endSeconds:2,smoothingMs:0,noteMode:'sustain'}).segments.length>1);
});
test('a short unknown gap at a rounding boundary does not reattack a held tone',()=>{
 const frames=framesFor(t=>60.45+.15*Math.sin(2*Math.PI*5*t));
 for(let i=44;i<46;i++)frames[i]={time:i*hop,kind:'unknown',rms:.1,confidence:0};
 const result=render(frames,2);
 assert.equal(result.segments.length,1);
 assert.equal(result.segments[0].origin,'completed');
 assert.ok(result.segments[0].completedRanges.length>0);
 assert.equal(result.segments[0].end,2);
});
test('sustain mode never fills silence or a long/one-sided unknown gap',()=>{
 for(const kind of ['silence','unknown']) {
  const frames=framesFor(()=>60);
  for(let i=35;i<48;i++)frames[i]={time:i*hop,kind};
  const result=render(frames,2);
  assert.equal(result.segments.length,2);
  assert.ok(result.segments[0].end<result.segments[1].start);
 }
 const frames=framesFor(()=>60);
 frames[0]={time:0,kind:'unknown'}; frames.at(-1).kind='unknown';
 const result=render(frames,2);
 assert.ok(result.segments[0].start>0);
 assert.ok(result.segments.at(-1).end<2);
});
test('quantization of tiny pitch fragments does not push all later notes to the right',()=>{
 const segments=[{start:0,end:.03,midi:59},{start:.03,end:.49,midi:60},{start:.50,end:1,midi:62}];
 const notes=quantizeSegments(segments,120);
 assert.deepEqual(notes.map(n=>[n.startTick,n.durationTick,n.midi]),[[0,4,60],[4,4,62]]);
});
test('sustain averaging survives a real low-frequency vibrato waveform',()=>{
 const sr=48000;let phase=0;
 const samples=Float32Array.from({length:sr*2},(_,i)=>{
  const midi=54.2+.85*Math.sin(2*Math.PI*5*i/sr+1.1);
  phase+=2*Math.PI*440*2**((midi-69)/12)/sr;
  return .2*Math.sin(phase)+.05*Math.sin(phase*2);
 });
 const notes=quantizeSegments(render(analyzeSamples(samples,sr),2).segments,120);
 assert.equal(notes.length,1);
 assert.equal(notes[0].midi,54);
 assert.equal(notes[0].durationTick,16);
});
