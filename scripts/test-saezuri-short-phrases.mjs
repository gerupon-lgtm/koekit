import test from 'node:test';
import assert from 'node:assert/strict';
import {resizePattern,validateNotes} from '../saezuri/document.js';
import {blankPattern} from '../probe/saezuri/entry-session.js';
import {openEditSession,stageEdit,confirmEditSession,cancelEditSession,undoEditSession} from '../probe/saezuri/edit-session.js';
import {nextLoopHead,loopCaptureTiming} from '../probe/saezuri/loop-timing.js';
import {accompanimentEvents,validateAccompaniment} from '../saezuri/music/accompaniment.js';
import {TapRecording} from '../probe/saezuri/tap-recording.js';
import {emptySequence,keepPhrase,sequencePlayback} from '../probe/saezuri/sequence-session.js';
const pattern=()=>({...blankPattern(),notes:[{id:'a',midi:60,startTick:0,durationTick:4},{id:'cross',midi:64,startTick:12,durationTick:8},{id:'tail',midi:67,startTick:48,durationTick:4}],accompaniment:{enabled:true,genre:'nursery',rhythm:'halves',progression:'home',drumPattern:'hat-half-front',chords:[{root:7,bass:7,quality:'major',startTick:12,durationTick:24}]}});
test('1/2/4/8-bar resize trims notes/chords/cursor only in the candidate; cancel and Undo recover the source',()=>{
 for(const bars of [1,2]){
  const p=pattern(),state={pattern:p,cursor:52,revision:0};assert.equal(resizePattern(state,bars).code,'SHORTEN_CONFIRM');
  const short=resizePattern(state,bars,{confirmed:true});assert.equal(validateNotes(short.pattern),null);assert.equal(validateAccompaniment(short.pattern.accompaniment,bars),null);assert.equal(short.cursor,bars*16);
  assert.ok(short.pattern.notes.every(n=>n.startTick+n.durationTick<=bars*16));assert.ok(short.pattern.accompaniment.chords.every(c=>c.startTick+c.durationTick<=bars*16));
  const session=openEditSession(p),pending=stageEdit(session,{type:'resize',bars});assert.equal(pending.confirmed.bars,4);assert.equal(confirmEditSession(pending).confirmed.bars,bars);
  assert.deepEqual(cancelEditSession(pending).working.pattern,p);assert.deepEqual(undoEditSession(pending).working.pattern,p);
 }
});
test('copy extends a short phrase by repeating its full content to the selected length',()=>{
 const p={...blankPattern(),bars:1,notes:[{id:'a',midi:60,startTick:0,durationTick:4}]};
 for(const bars of [2,4,8]){const large=resizePattern({pattern:p,cursor:4,revision:1},bars,{copy:true});assert.equal(validateNotes(large.pattern),null);assert.equal(large.pattern.notes.length,bars);assert.equal(new Set(large.pattern.notes.map(n=>n.id)).size,bars);assert.deepEqual(large.pattern.notes.map(n=>n.startTick),Array.from({length:bars},(_,i)=>i*16));}
});
test('short phrases keep loop heads and microphone capture frames at their selected length',()=>{
 for(const bars of [1,2]){assert.equal(nextLoopHead({anchor:1,now:1,tempo:120,bars}),1+bars*2);const timing=loopCaptureTiming({musicalStart:3,tempo:120,bars,sampleRate:48000});assert.equal(timing.endFrame-timing.startFrame,bars*2*48000);assert.equal(timing.bars,bars);}
});
test('short tapping and mixed-length arrangement playback retain exact timing and backing',()=>{
 let sequence=emptySequence();for(const bars of [1,2,4,8]){
  const p={...blankPattern(),bars,notes:[{id:'a',midi:60,startTick:0,durationTick:4}],accompaniment:{enabled:true,genre:'nursery',rhythm:'whole',progression:'home',drumPattern:'hat-half-back'}};
  assert.equal(validateNotes(p),null);const take=new TapRecording(p);assert.equal(take.totalTicks,bars*16);
  assert.equal(accompanimentEvents(p).filter(e=>e.part==='bass').length,bars);sequence=keepPhrase(sequence,p,'P'+bars);
 }
 sequence.placements=sequence.patterns.map((p,i)=>({id:'p'+i,patternId:p.id}));const played=sequencePlayback(sequence);assert.equal(played.pattern.bars,15);assert.deepEqual(played.ranges.map(r=>[r.start,r.end]),[[0,16],[16,48],[48,112],[112,240]]);
 assert.equal(validateNotes({...blankPattern(),bars:3})?.code,'PATTERN_INVALID');
});
