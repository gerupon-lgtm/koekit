import test from 'node:test';
import assert from 'node:assert/strict';
import {PROGRESSIONS,PRESETS,RHYTHMS,SOUNDS,accompanimentEvents,validateAccompaniment} from '../saezuri/music/accompaniment.js';
import {blankPattern} from '../probe/saezuri/entry-session.js';
import {openEditSession,stageEdit,confirmEditSession,undoEditSession} from '../probe/saezuri/edit-session.js';
test('all progression, genre, rhythm and chord sound combinations keep audible upper voices in every bar',()=>{
 let checked=0;
 for(const key of ['C','Am'])for(const progression of PROGRESSIONS[key])for(const genre of Object.keys(PRESETS))for(const rhythm of RHYTHMS)for(const sound of SOUNDS)for(const bars of [4,8]){
  const p={...blankPattern(key),bars,accompaniment:{enabled:true,genre,rhythm:rhythm.id,progression:progression.id,sounds:{chord:sound.id}}},events=accompanimentEvents(p);
  for(let bar=0;bar<bars;bar++){
   const chord=events.filter(n=>n.part==='chord'&&n.startTick>=bar*16&&n.startTick<(bar+1)*16),bass=events.filter(n=>n.part==='bass'&&n.startTick>=bar*16&&n.startTick<(bar+1)*16);
   assert.ok(chord.length&&chord.some(n=>n.midi>=60),`${key}/${progression.id}/${genre}/${rhythm.id}/${sound.id}/${bars}: bar ${bar+1} retains upper voices`);
   assert.ok(chord.every(n=>Number.isFinite(n.gain)&&n.gain>0&&n.midi>=53&&n.midi<=79));assert.ok(chord.every(n=>n.midi>=Math.max(...bass.map(b=>b.midi))+12),'chord stays above the sample bass');
  }
  checked++;
 }
 assert.equal(checked,1728);
});
test('audition presets generate bounded accompaniment independently from the melody',()=>{
 for(const key of ['C','Am'])for(const genre of Object.keys(PRESETS))for(const progression of PROGRESSIONS[key])for(const bars of [4,8]) {
  const pattern={...blankPattern(key),bars,notes:[{id:'a',midi:72,startTick:0,durationTick:32}],accompaniment:{enabled:true,genre,progression:progression.id,rhythm:PRESETS[genre].rhythm}};
  const before=structuredClone(pattern),events=accompanimentEvents(pattern);
  assert.ok(events.length>0);assert.deepEqual(pattern,before);
  for(const e of events){assert.ok(e.startTick>=0&&e.startTick+e.durationTick<=bars*16);assert.ok(e.midi>=0&&e.midi<=127);}
 }
 assert.deepEqual(accompanimentEvents(blankPattern()),[]);
});
test('image changes retain melody, require confirmation, and participate in common undo',()=>{
 const pattern={...blankPattern(),notes:[{id:'a',midi:60,startTick:0,durationTick:4}]},s=openEditSession(pattern);
 const value={enabled:true,genre:'ballad',rhythm:'arpeggio',progression:'circle'},a=stageEdit(s,{type:'accompaniment',value});
 assert.deepEqual(a.confirmed,pattern);assert.deepEqual(a.working.pattern.notes,pattern.notes);
 assert.deepEqual(confirmEditSession(a).confirmed.accompaniment,value);assert.deepEqual(undoEditSession(a).working.pattern,pattern);
 assert.equal(validateAccompaniment({...value,rhythm:'unknown'}).code,'ACCOMPANIMENT_INVALID');
 assert.deepEqual(accompanimentEvents({...pattern,accompaniment:{...value,enabled:false}}),[]);
});
