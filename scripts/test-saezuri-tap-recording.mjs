import test from 'node:test';
import assert from 'node:assert/strict';
import {TapRecording,pianoKeys} from '../probe/saezuri/tap-recording.js';
import {validateNotes} from '../saezuri/document.js';
import {readCaptureReport} from '../probe/saezuri/capture-report.js';
const blank=(bars=4)=>({bars,gridStep:2,source:'manual',notes:[],key:{tonicPitchClass:9,mode:'minor'},accompaniment:{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'}});
test('A through upper C has ten white/six black keys; only internal C is marked',()=>{
 const keys=pianoKeys(0);assert.equal(keys.length,16);assert.equal(keys.filter(k=>!k.black).length,10);assert.deepEqual([keys[0].midi,keys.at(-1).midi],[57,72]);assert.deepEqual(keys.filter(k=>k.reference).map(k=>k.midi),[60]);
 for(const offset of [-1,0,1])assert.deepEqual(pianoKeys(offset).map(k=>k.midi),keys.map(k=>k.midi+offset*12));
});
test('press/release quantizes to sixteenths, retaining a quick tap and long note',()=>{
 const base=blank(),take=new TapRecording(base);take.press(60,.1);take.release(.15);take.press(64,3.8);take.release(15.9);
 assert.deepEqual(take.pattern.notes.map(n=>[n.midi,n.startTick,n.durationTick]),[[60,0,1],[64,4,12]]);assert.deepEqual(base,blank());assert.equal(validateNotes(take.pattern),null);
});
test('later note wins at the same position, across repeated cycles',()=>{
 const take=new TapRecording({...blank(),notes:[{id:'old',midi:60,startTick:0,durationTick:8}]});take.press(64,64);take.release(66);assert.deepEqual(take.pattern.notes.map(n=>[n.midi,n.startTick,n.durationTick]),[[64,0,2]]);
 take.press(67,128);take.release(132);assert.deepEqual(take.pattern.notes.map(n=>[n.midi,n.startTick,n.durationTick]),[[67,0,4]]);assert.equal(validateNotes(take.pattern),null);
});
test('overlap replaces its interval and keeps unaffected notes and phrase metadata',()=>{
 const base={...blank(8),notes:[{id:'a',midi:60,startTick:0,durationTick:16},{id:'b',midi:69,startTick:32,durationTick:4}]};const take=new TapRecording(base);take.press(64,4);take.release(8);
 assert.deepEqual(take.pattern.notes.map(n=>[n.midi,n.startTick,n.durationTick]),[[60,0,4],[64,4,4],[60,8,8],[69,32,4]]);assert.deepEqual(take.pattern.accompaniment,base.accompaniment);assert.deepEqual(take.pattern.key,base.key);assert.equal(take.pattern.bars,8);assert.equal(validateNotes(take.pattern),null);
});
test('held notes cross the loop boundary; many cycles stay bounded and valid',()=>{
 const take=new TapRecording(blank());take.press(60,62);take.release(66);assert.deepEqual(take.pattern.notes.map(n=>[n.startTick,n.durationTick]),[[0,2],[62,2]]);
 take.press(64,68);take.release(270);assert.ok(take.pattern.notes.every(n=>n.midi===64));assert.equal(take.pattern.notes.reduce((sum,n)=>sum+n.durationTick,0),64);assert.equal(validateNotes(take.pattern),null);
});
test('a new press closes the old one; live preview does not mutate the take',()=>{
 const take=new TapRecording(blank());take.press(60,0);const preview=take.preview(8);assert.equal(preview.notes[0].durationTick,8);assert.equal(take.pattern.notes.length,0);
 take.press(72,4);take.release(6);assert.deepEqual(take.pattern.notes.map(n=>[n.midi,n.startTick,n.durationTick]),[[60,0,4],[72,4,2]]);assert.equal(take.events,2);
});
test('a new take keeps unique IDs from an earlier take and its diagnostics round-trip',()=>{
 const first=new TapRecording(blank(8));first.press(60,0);first.release(4);
 const second=new TapRecording(first.pattern);second.press(64,8);second.release(12);assert.equal(validateNotes(second.pattern),null);
 const decoded=readCaptureReport(JSON.stringify({captureCandidate:second.pattern,compositionOptions:{tempo:120}}));assert.deepEqual(decoded.pattern,second.pattern);
});
