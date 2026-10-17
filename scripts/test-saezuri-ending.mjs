import test from 'node:test';import assert from 'node:assert/strict';
import {sequencePlayback,proposeSequence,commitSequence,undoPlacement} from '../probe/saezuri/sequence-session.js';
import {compositionTicks,validateComposition} from '../saezuri/sequence.js';
const phrase=(id='A',key={tonicPitchClass:9,mode:'minor'})=>({id,familyId:id,name:id,bars:4,gridStep:2,key,notes:[{id:'n',midi:69,startTick:0,durationTick:4}],accompaniment:{enabled:true,genre:'ballad',rhythm:'arpeggio',progression:'home',sounds:{chord:'strings',bass:'soft'}}});
const song=()=>({revision:0,undoStack:[],patterns:[phrase()],placements:[{id:'p',patternId:'A'}]});

test('one A-major ending can hold four bars after an A-minor phrase, without extending the melody',()=>{
 const s={...song(),ending:{enabled:true,bars:4,mode:'custom',customChord:{root:9,quality:'major',bass:9}}},before=structuredClone(s),play=sequencePlayback(s);
 assert.equal(play.pattern.bars,8);assert.equal(compositionTicks(s),128);assert.deepEqual(s,before);
 assert.deepEqual(play.pattern.notes.map(n=>[n.midi,n.startTick,n.durationTick]),[[69,0,4]]);
 const ending=play.backing.filter(n=>n.startTick>=64);assert.equal(ending.length,4);
 assert.ok(ending.every(n=>n.startTick===64&&n.durationTick===64));assert.ok(ending.every(n=>n.part!=='drums'));
 assert.deepEqual(ending.filter(n=>n.part==='chord').map(n=>n.midi%12).sort((a,b)=>a-b),[1,4,9]);
 assert.equal(ending.find(n=>n.part==='bass').midi,45);assert.ok(ending.filter(n=>n.part==='chord').every(n=>n.instrument==='strings'));
 assert.deepEqual(play.ranges.at(-1),{id:'ending',start:64,end:128});
});

test('none, one, two and four bars share exact song bounds and a single ending attack',()=>{
 for(const [bars,totalTicks] of [[0,64],[1,80],[2,96],[4,128]]){
  const s={...song(),ending:{enabled:bars>0,bars:bars||1,mode:'auto'}},play=sequencePlayback(s);
  assert.equal(compositionTicks(s),totalTicks);assert.equal(play.pattern.bars*16,totalTicks);
  assert.equal(play.backing.filter(n=>n.ending).length,bars?4:0);
  if(bars)assert.ok(play.backing.filter(n=>n.ending).every(n=>n.startTick===64&&n.durationTick===totalTicks-64));
 }
 assert.equal(sequencePlayback(song()).ending,null,'old songs with no ending retain their original length');
});

test('automatic suggestion follows the last placed key; manual out-of-key and slash chords survive rearrangement',()=>{
 const s={...song(),patterns:[phrase(),phrase('B',{tonicPitchClass:2,mode:'major'})],placements:[{id:'p',patternId:'A'},{id:'q',patternId:'B'}],ending:{enabled:true,bars:2,mode:'auto'}};
 assert.deepEqual(sequencePlayback(s).ending.chord,{root:2,quality:'major',bass:2});
 const moved=commitSequence(s,proposeSequence(s,{type:'move',placementId:'q',index:0}));
 assert.deepEqual(sequencePlayback(moved).ending.chord,{root:9,quality:'minor',bass:9});
 const custom={enabled:true,bars:4,mode:'custom',bassMode:'custom',customChord:{root:9,quality:'major',bass:5}};
 const manual=commitSequence(moved,proposeSequence(moved,{type:'ending',value:custom}));
 const reordered=commitSequence(manual,proposeSequence(manual,{type:'move',placementId:'q',index:1}));
 assert.deepEqual(reordered.ending,custom);assert.deepEqual(sequencePlayback(reordered).ending.chord,custom.customChord);
 assert.equal(sequencePlayback(reordered).backing.find(n=>n.ending&&n.part==='bass').midi,41);
 const saved=JSON.parse(JSON.stringify({...reordered,undoStack:[]}));assert.deepEqual(sequencePlayback(saved).ending,sequencePlayback(reordered).ending);
 assert.deepEqual(undoPlacement(manual).ending,moved.ending);
});

test('all thirteen qualities and independent bass notes use the existing musical vocabulary',()=>{
 const qualities=['major','minor','7','maj7','m7','sus4','dim','aug','6','m6','add9','m(add9)','m7♭5'];
 for(const quality of qualities){
  const s={...song(),ending:{enabled:true,bars:1,mode:'custom',customChord:{root:11,quality,bass:5}}};
  assert.equal(validateComposition(s),null);const notes=sequencePlayback(s).backing.filter(n=>n.ending);assert.ok(notes.length>=4&&notes.length<=5);assert.equal(notes.find(n=>n.part==='bass').midi,41);
  if(quality==='m7♭5')assert.deepEqual(notes.filter(n=>n.part==='chord').map(n=>n.midi%12).sort((a,b)=>a-b),[2,5,9,11]);
 }
});

test('invalid endings cannot create or commit a candidate',()=>{
 const s=song(),before=structuredClone(s);
 for(const value of [{enabled:true,bars:3},{enabled:true,bars:0},{enabled:true,bars:2,mode:'custom',customChord:{root:9,quality:'major',bass:12}},{enabled:true,bars:1,mode:'custom'},{enabled:'yes'}]){
  assert.equal(proposeSequence(s,{type:'ending',value}).code,'ENDING_INVALID');assert.deepEqual(s,before);
 }
});

test('sixteen eight-bar placements plus four ending bars are 132 bars; deleting all placements leaves no ghost ending',()=>{
 const p={...phrase(),bars:8},s={...song(),patterns:[p],placements:Array.from({length:16},(_,i)=>({id:`p${i}`,patternId:p.id})),ending:{enabled:true,bars:4,mode:'auto'}};
 const play=sequencePlayback(s);assert.equal(play.pattern.bars,132);assert.equal(compositionTicks(s),2112);assert.deepEqual(play.ranges.at(-1),{id:'ending',start:2048,end:2112});
 assert.equal(play.pattern.notes.length,16);assert.equal(play.backing.filter(n=>n.ending).length,4);
 const empty={...s,placements:[]};assert.equal(compositionTicks(empty),0);assert.equal(sequencePlayback(empty).pattern.bars,0);assert.equal(sequencePlayback(empty).backing.length,0);
});
