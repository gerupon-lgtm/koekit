import test from 'node:test';import assert from 'node:assert/strict';
import {IMAGE_TYPES,IMAGE_SPEEDS,IMAGE_MOODS,generateImageAccompaniment} from '../saezuri/music/image-arrangement.js';
import {accompanimentEvents,harmonicSegments,validateAccompaniment,recommendProgressions} from '../saezuri/music/accompaniment.js';
import {blankPattern,proposeEntry,confirmEntry} from '../probe/saezuri/entry-session.js';
import {openEditSession,stageEdit,stageAccompanimentCandidate,confirmEditSession,cancelEditSession,undoEditSession,canGenerateAccompaniment} from '../probe/saezuri/edit-session.js';
import {songCheckpoint,restoreCheckpoint} from '../probe/saezuri/song-session.js';
const choice={type:'pop',speed:'normal',mood:'gentle'};
const generate=s=>stageAccompanimentCandidate(s,generateImageAccompaniment(s.working.pattern,choice));
const pattern=()=>({...blankPattern(),notes:[{id:'held',midi:64,startTick:2,durationTick:18},{id:'end',midi:67,startTick:48,durationTick:8}]});
const restOf=p=>{const {accompaniment,...rest}=p;return rest;};
test('48 word combinations × 8 distinct arrangements × two keys × two lengths remain audible, bounded and fixed',()=>{
 let checked=0;
 for(const [type] of IMAGE_TYPES)for(const [speed] of IMAGE_SPEEDS)for(const [mood] of IMAGE_MOODS)for(const key of ['C','Am'])for(const bars of [4,8]){
  let p={...blankPattern(key),bars};const unique=new Set();
  for(let n=0;n<8;n++){
   const before=structuredClone(p);p.accompaniment=generateImageAccompaniment(p,{type,speed,mood});
   assert.equal(validateAccompaniment(p.accompaniment,bars),null);assert.deepEqual(restOf(p),restOf(before));
   const events=accompanimentEvents(p);unique.add(JSON.stringify(events));
   assert.ok(events.length);assert.deepEqual(events,accompanimentEvents(JSON.parse(JSON.stringify(p))));
   assert.ok(events.every(e=>Number.isFinite(e.midi)&&e.midi>=0&&e.midi<=127&&Number.isFinite(e.gain)&&e.gain>0&&e.durationTick>0&&e.startTick>=0&&e.startTick+e.durationTick<=bars*16));
   for(let bar=0;bar<bars;bar++)for(const part of ['chord','bass','drums'])assert.ok(events.some(e=>e.part===part&&e.startTick>=bar*16&&e.startTick<(bar+1)*16),`${type}/${speed}/${mood}/${key}/${bars}/${n}/${bar}/${part}`);
   checked++;
  }
  assert.equal(unique.size,8);
 }
 assert.equal(checked,1536);
});
test('repeat candidate, cancel, adopt and Undo preserve melody, rests, key, length and one history entry',()=>{
 const original=pattern();let s=confirmEditSession(openEditSession(original));s.working.hasRest=true;s.confirmedHasRest=true;
 for(let i=0;i<40;i++){s=generate(s);assert.equal(s.history.length,1);assert.deepEqual(restOf(s.working.pattern),restOf(original));assert.equal(s.working.hasRest,true);assert.deepEqual(s.confirmed,original);}
 const canceled=cancelEditSession(s);assert.deepEqual(canceled.working.pattern,original);assert.equal(canceled.imageCandidate,null);
 const adopted=confirmEditSession(s);assert.deepEqual(adopted.confirmed,s.working.pattern);assert.equal(adopted.imageCandidate,null);
 const undone=undoEditSession(adopted);assert.deepEqual(undone.working.pattern,original);assert.deepEqual(undone.confirmed,adopted.confirmed);
});
test('manual chords including short slash changes, progression, rhythm, sounds and disabled backing survive generation',()=>{
 const p=pattern();p.accompaniment=generateImageAccompaniment(p,choice);
 Object.assign(p.accompaniment,{genre:'rock',rhythm:'offbeat',progression:'circle',enabled:false,manualSettings:{genre:true,rhythm:true,progression:true,enabled:true},sounds:{chord:'lead',bass:'wood',drums:'none'},chords:[{startTick:16,durationTick:4,root:11,quality:'m7♭5',bass:1,manual:true}]});
 const before=structuredClone(p.accompaniment);
 for(let i=0;i<12;i++){
  p.accompaniment=generateImageAccompaniment(p,{type:'ballad',speed:'fast',mood:'sad'});
  for(const field of ['enabled','genre','rhythm','progression','manualSettings','sounds','chords'])assert.deepEqual(p.accompaniment[field],before[field]);
  assert.equal(harmonicSegments(p).find(c=>c.startTick===16).bass,1);
 }
 for(const candidate of recommendProgressions(p))assert.equal(candidate.manualSettings.progression,true);
 const reset=generateImageAccompaniment(p,choice,{resetManual:true});assert.equal(reset.chords,undefined);assert.equal(reset.sounds,undefined);assert.equal(reset.manualSettings,undefined);
});
test('other edit or input candidates block generation; confirmed rest/chord-only save rules and draft reload remain intact',()=>{
 let s=openEditSession(pattern());s=stageEdit(s,{type:'transpose',semitones:1});assert.equal(canGenerateAccompaniment(s),false);assert.equal(generate(s).code,'DRAFT_PENDING');
 s=openEditSession(blankPattern());s=proposeEntry(s,{midi:60,durationTick:4});assert.equal(generate(s).code,'DRAFT_PENDING');s=confirmEntry(s);assert.equal(canGenerateAccompaniment(s),true);
 const empty=generate(openEditSession(blankPattern()));assert.equal(songCheckpoint(empty),null);const confirmed=confirmEditSession(empty);assert.ok(songCheckpoint(confirmed).confirmed);
 let withNotes=generate(confirmEditSession(openEditSession(pattern())));const saved=songCheckpoint(withNotes),restored=restoreCheckpoint(saved);
 assert.equal(canGenerateAccompaniment(restored),true);assert.equal(restored.history.length,1);assert.deepEqual(accompanimentEvents(restored.working.pattern),accompanimentEvents(withNotes.working.pattern));
 withNotes=generate(restored);assert.equal(withNotes.history.length,1);assert.deepEqual(cancelEditSession(withNotes).working.pattern,saved.confirmed.pattern);
});
test('corrupt saved arrangement recipes are rejected without breaking legacy backing',()=>{
 const p=pattern(),value=generateImageAccompaniment(p,choice);assert.equal(validateAccompaniment(value),null);
 assert.equal(generateImageAccompaniment({...p,accompaniment:value},{mood:choice.mood,speed:choice.speed,type:choice.type}).imageArrangement.index,1,'property order cannot repeat the current alternative');
 const keyChanged={...p,key:{mode:'minor',tonicPitchClass:9},accompaniment:value};assert.deepEqual(harmonicSegments(keyChanged).map(c=>[c.root,c.quality]),value.imageArrangement.progressions.minor,'explicit key changes use the stored harmonies of that key');
 for(const patch of [{chordTicks:[16]},{bassIntervals:[13]},{progressions:{major:[[0,'no']]}},{sounds:{chord:'no'}},{strength:NaN},{index:100}])assert.equal(validateAccompaniment({...value,imageArrangement:{...value.imageArrangement,...patch}}).code,'IMAGE_INVALID');
 assert.equal(validateAccompaniment({enabled:true,genre:'pop',rhythm:'offbeat',progression:'pop'}),null);
});
