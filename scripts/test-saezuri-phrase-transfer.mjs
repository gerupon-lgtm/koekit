import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSongPhrases} from '../probe/saezuri/phrase-transfer.js';

const phrase=(bars=4)=>({bars,gridStep:2,notes:[{id:'n1',midi:60,startTick:2,durationTick:6}]});
const song=(patterns=[],current=null)=>({
 id:'source-song',schemaVersion:1,title:'もとのきょく',revision:3,
 data:{checkpoint:current?{confirmed:{pattern:current,cursor:8,hasRest:false},draft:null}:null,
  sequence:{patterns,placements:[],revision:2,undoStack:[]},settings:{tempo:110,instrument:'fm-piano'}},
});

test('committed registered phrases have stable source IDs, readable names and independent full copies',()=>{
 assert.equal(typeof extractSongPhrases,'function');
 const source={...phrase(),id:'phrase-1-0',familyId:'family-1',name:' はじめ ',source:'input',
  key:{tonicPitchClass:9,mode:'minor'},imageChoice:{genre:'pop',seed:7},
  accompaniment:{enabled:true,genre:'pop',rhythm:'offbeat',progression:'pop',sounds:{chord:'fm-piano'}}};
 const record=song([source]),before=structuredClone(record),items=extractSongPhrases(record);
 assert.equal(items.length,1);assert.equal(items[0].id,'phrase:phrase-1-0');assert.equal(items[0].label,'はじめ');
 assert.deepEqual(items[0].pattern,before.data.sequence.patterns[0]);
 items[0].pattern.notes[0].midi=72;items[0].pattern.accompaniment.sounds.chord='strings';
 assert.deepEqual(record,before);
 const again=extractSongPhrases(record);assert.equal(again[0].pattern.notes[0].midi,60);
 assert.notEqual(again[0].pattern,source);assert.notEqual(again[0].pattern,items[0].pattern);
});

test('only the confirmed checkpoint is offered, including a song without registered phrases',()=>{
 const current={...phrase(8),source:'keyboard'},record=song([],current);
 record.data.checkpoint.draft={confirmed:{...phrase(),notes:[{id:'draft1',midi:71,startTick:0,durationTick:4}]},
  working:{pattern:{...phrase(),notes:[{id:'draft2',midi:72,startTick:0,durationTick:4}]}},
  entryInput:{midi:73,durationTick:4},imageCandidate:{pattern:phrase()}};
 record.data.sequenceDraft={patterns:[{...phrase(),id:'draft-shelf',name:'まだ'}]};
 record.data.placementDraft={patterns:[{...phrase(),id:'draft-placement',name:'まだ'}]};
 record.data.sequence.undoStack=[{patterns:[{...phrase(),id:'past-shelf',name:'むかし'}]}];
 const before=structuredClone(record),items=extractSongPhrases(record);
 assert.deepEqual(items,[{id:'current',label:'つくったフレーズ',pattern:current}]);
 items[0].pattern.notes[0].midi=65;assert.deepEqual(record,before);
 record.data.checkpoint.confirmed=null;
 assert.deepEqual(extractSongPhrases(record),[],'a saved draft cannot be imported as an accepted phrase');
});

test('the checkpoint is suppressed only for complete matching content regardless of object key order',()=>{
 const first={...phrase(),id:'one',name:'A',familyId:'one',familyName:'A',
  key:{tonicPitchClass:0,mode:'major'},imageChoice:{genre:'nursery',choice:2}};
 const second={...structuredClone(first),id:'two',name:'B',familyId:'two',familyName:'B'};
 const current={imageChoice:{choice:2,genre:'nursery'},notes:[{durationTick:6,startTick:2,midi:60,id:'n1'}],
  key:{mode:'major',tonicPitchClass:0},gridStep:2,bars:4,id:'editing',name:'current',familyId:'editing',familyName:'current'};
 const record=song([first,second],current),before=structuredClone(record);
 assert.deepEqual(extractSongPhrases(record).map(item=>item.id),['phrase:one','phrase:two']);
 assert.deepEqual(record,before);
 for(const change of [
  p=>{p.notes[0].id='different-note-id';},
  p=>{p.notes[0].startTick=4;},
  p=>{p.key.tonicPitchClass=2;},
  p=>{p.imageChoice.choice=3;},
  p=>{p.source='tap';},
 ]){
  const variant=structuredClone(current);change(variant);
  assert.deepEqual(extractSongPhrases(song([first,second],variant)).map(item=>item.id),['phrase:one','phrase:two','current']);
 }
});

test('4 and 8 bar melodies and chord-only parts retain timing, key, sounds and image choices',()=>{
 for(const bars of [4,8]){
  const melody={...phrase(bars),gridStep:1,notes:[{id:'odd-tick',midi:69,startTick:1,durationTick:7}],id:`melody-${bars}`,name:''};
  const chords={bars,gridStep:2,notes:[],id:`chords-${bars}`,name:'コード',key:{tonicPitchClass:9,mode:'minor'},source:'image',
   imageChoice:{id:'slow'},accompaniment:{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home',
    sounds:{chord:'fm-piano',bass:'synth-bass',drums:'none'},chords:[
     {root:9,quality:'m7',bass:9,startTick:0,durationTick:8},
     {root:1,quality:'maj7',bass:5,startTick:8,durationTick:8},
     {root:7,quality:'7',bass:7,startTick:16,durationTick:bars*16-16},
    ]}};
  const items=extractSongPhrases(song([melody,chords]));
  assert.deepEqual(items.map(item=>[item.id,item.label]),[[`phrase:melody-${bars}`,'フレーズ1'],[`phrase:chords-${bars}`,'コード']]);
  assert.deepEqual(items.map(item=>item.pattern),[melody,chords]);
  assert.notEqual(items[1].pattern.accompaniment.chords,chords.accompaniment.chords);
  for(const mutate of [p=>{p.accompaniment.sounds.chord='strings';},p=>{p.accompaniment.chords[0].bass=4;}]){
   const current=structuredClone(chords);mutate(current);
   assert.equal(extractSongPhrases(song([chords],current)).at(-1).id,'current');
  }
 }
});

test('invalid parts are skipped without hiding valid siblings or a valid checkpoint',()=>{
 const valid={...phrase(),id:'valid',name:42},current={...phrase(8),notes:[{id:'current-note',midi:67,startTick:4,durationTick:4}]};
 const chordOnly={bars:4,gridStep:2,notes:[],id:'bad-chords',accompaniment:{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home',chords:[null,{root:0,quality:'major',bass:0,startTick:0,durationTick:16}]}};
 const invalid=[null,{}, {...phrase(),id:''},{...phrase(),id:12},{...phrase(),id:'bad-bars',bars:16},
  {...phrase(),id:'bad-grid',gridStep:3},{...phrase(),id:'bad-notes',notes:[null]},
  {...phrase(),id:'empty',notes:[]},{...phrase(),id:'backing-off',notes:[],accompaniment:{enabled:false}},
  {...phrase(),id:'not-cloneable',metadata:()=>{}},chordOnly];
 const record=song([...invalid,valid],current),items=extractSongPhrases(record);
 assert.deepEqual(items.map(item=>item.id),['phrase:valid','current']);
 assert.equal(items[0].label,`フレーズ${invalid.length+1}`);
 assert.deepEqual(extractSongPhrases(song([valid],{...phrase(),notes:[]})).map(item=>item.id),['phrase:valid']);
});

test('null, malformed records and unsupported schema versions safely yield no source parts',()=>{
 const valid=song([{...phrase(),id:'valid'}]);
 for(const record of [null,undefined,[],{},'song',{...valid,schemaVersion:2},{...valid,schemaVersion:'1'},
  {...valid,data:null},{...valid,data:[]},{...valid,data:{}},{...valid,data:{sequence:{patterns:{}}}}]){
  assert.deepEqual(extractSongPhrases(record),[]);
 }
});
