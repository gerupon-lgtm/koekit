import test from 'node:test';import assert from 'node:assert/strict';
import {emptySequence,canKeepPhrase,keepPhrase,sequencePlayback,proposeSequence,commitSequence,undoPlacement} from '../probe/saezuri/sequence-session.js';
const phrase=(bars=4,midi=60)=>({bars,gridStep:2,notes:[{id:'n',midi,startTick:0,durationTick:bars*16}],accompaniment:{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'}});
const append=(s,id)=>commitSequence(s,proposeSequence(s,{type:'append',placement:{id:`p${s.revision}`,patternId:id}}));
test('registered phrases are independent snapshots and arrangement candidates require confirmation',()=>{
 const p=phrase(),s=keepPhrase(emptySequence(),p,' A ');p.notes[0].midi=72;
 assert.equal(s.patterns[0].notes[0].midi,60);assert.equal(s.patterns[0].name,'A');
 const candidate=proposeSequence(s,{type:'append',placement:{id:'p',patternId:s.patterns[0].id}});
 assert.equal(s.placements.length,0);assert.equal(candidate.next.placements.length,1);
 const committed=commitSequence(s,candidate);assert.equal(commitSequence(committed,candidate).code,'STALE_CANDIDATE');
 assert.equal(keepPhrase(s,{...phrase(),notes:[],accompaniment:{...phrase().accompaniment,enabled:false}},'empty').code,'EMPTY_PHRASE');
});

test('chord-only phrases retain custom timing, key and sounds as independent reusable snapshots',()=>{
 for(const bars of [4,8]){
  const p={...phrase(bars),key:{tonicPitchClass:9,mode:'minor'},notes:[]};
  p.accompaniment={...p.accompaniment,sounds:{chord:'fm-piano',bass:'synth-bass',drums:'none'},chords:[
   {root:9,quality:'m7',bass:9,startTick:0,durationTick:8},
   {root:1,quality:'maj7',bass:5,startTick:8,durationTick:8},
   {root:7,quality:'7',bass:7,startTick:16,durationTick:16},
  ]};
  const original=structuredClone(p),saved=keepPhrase(emptySequence(),p,' コードだけ ');
  assert.equal(canKeepPhrase(p),true);
  assert.equal(saved.code,undefined);assert.deepEqual(saved.patterns[0].notes,[]);
  p.accompaniment.chords[0].root=0;p.accompaniment.sounds.chord='brass';
  assert.deepEqual(saved.patterns[0].accompaniment,original.accompaniment);
  let s=append(append(saved,saved.patterns[0].id),saved.patterns[0].id);
  const play=sequencePlayback(s),first=sequencePlayback(append(saved,saved.patterns[0].id));
  assert.equal(play.pattern.bars,bars*2);assert.deepEqual(play.pattern.notes,[]);
  assert.ok(first.backing.length>0);assert.deepEqual(play.backing,[...first.backing,...first.backing.map(n=>({...n,startTick:n.startTick+bars*16}))]);
  assert.deepEqual(play.ranges.map(r=>[r.start,r.end]),[[0,bars*16],[bars*16,bars*32]]);
  assert.deepEqual(sequencePlayback(JSON.parse(JSON.stringify({...s,undoStack:[]}))),play,'existing save shape round-trips without a new schema');
  s=keepPhrase(s,phrase(),'メロディー');s=append(s,s.patterns.at(-1).id);
  assert.equal(sequencePlayback(s).pattern.notes[0].startTick,bars*32,'silent melody regions keep their full duration');
 }
});

test('an empty or invalid backing cannot become a silent chord-only phrase',()=>{
 const p={...phrase(),notes:[]};
 assert.equal(canKeepPhrase(null),false);
 for(const accompaniment of [undefined,{...p.accompaniment,enabled:false},{...p.accompaniment,genre:'unknown'},{...p.accompaniment,chords:[{root:0,quality:'major',bass:0,startTick:63,durationTick:2}]}]){
  const s=emptySequence(),before=structuredClone(s);
  assert.equal(canKeepPhrase({...p,accompaniment}),false);
  assert.equal(keepPhrase(s,{...p,accompaniment},'空').code,'EMPTY_PHRASE');assert.deepEqual(s,before);
 }
});

test('chord-only placement edits and endings preserve the source and exact song bounds',async()=>{
 const {derivePlacement}=await import('../probe/saezuri/sequence-session.js');
 const p={...phrase(),key:{tonicPitchClass:9,mode:'minor'},notes:[]};
 let s=keepPhrase(emptySequence(),p,'伴奏');s=append(append(s,s.patterns[0].id),s.patterns[0].id);
 const source=structuredClone(s.patterns[0]),edited=structuredClone(source);edited.accompaniment.rhythm='arpeggio';
 const changed=commitSequence(s,derivePlacement(s,s.placements[1].id,edited));
 assert.deepEqual(changed.patterns[0],source);assert.equal(changed.placements[0].patternId,source.id);
 assert.deepEqual(sequencePlayback(changed).pattern.notes,[]);assert.deepEqual(undoPlacement(changed).placements,s.placements);
 for(const bars of [0,1,2,4])for(const mode of ['auto','custom']){
  const ending={enabled:bars>0,bars:bars||1,mode,...(mode==='custom'?{customChord:{root:1,quality:'maj7',bass:5}}:{})};
  const next=commitSequence(changed,proposeSequence(changed,{type:'ending',value:ending})),play=sequencePlayback(next);
  assert.equal(play.pattern.bars,8+bars);assert.deepEqual(play.pattern.notes,[]);
  const tail=play.backing.filter(n=>n.ending);assert.equal(tail.length,bars?(mode==='custom'?5:4):0);
  if(bars){
   assert.ok(tail.every(n=>n.startTick===128&&n.durationTick===bars*16));
   assert.deepEqual(play.ending.chord,mode==='custom'?ending.customChord:{root:9,quality:'minor',bass:9});
  }
 }
});

test('explicit replacement and unused-shelf deletion are cancellable candidates with safe Undo',async()=>{
 const {derivePlacement}=await import('../probe/saezuri/sequence-session.js');
 let s=keepPhrase(emptySequence(),phrase(),'A');s=append(append(s,s.patterns[0].id),s.patterns[0].id);
 const source=s.patterns[0],original=structuredClone(s);
 s=commitSequence(s,derivePlacement(s,s.placements[0].id,{...source,notes:[{id:'n',midi:64,startTick:0,durationTick:64}]}));
 const derived=s.patterns.at(-1),before=structuredClone(s);
 assert.equal(proposeSequence(s,{type:'delete-pattern',patternId:source.id}).code,'PATTERN_IN_USE');
 const replace=proposeSequence(s,{type:'replace',placementId:s.placements[1].id,patternId:derived.id});
 assert.deepEqual(s,before,'not adopting a candidate leaves the arrangement untouched');
 const replaced=commitSequence(s,replace);assert.ok(replaced.placements.every(p=>p.patternId===derived.id));
 const removed=commitSequence(replaced,proposeSequence(replaced,{type:'delete-pattern',patternId:source.id}));
 assert.equal(removed.patterns.some(p=>p.id===source.id),false);
 const restored=undoPlacement(removed);assert.ok(restored.patterns.some(p=>p.id===source.id));assert.deepEqual(restored.placements,replaced.placements);
 const prior=undoPlacement(restored);assert.deepEqual(prior.placements,before.placements);
 const originalAgain=undoPlacement(prior);assert.deepEqual(originalAgain.placements,original.placements);
 assert.ok(originalAgain.patterns.some(p=>p.id===derived.id),'Undo leaves the new reusable phrase on the shelf');
});

test('phrase identities and derivative names do not collide after deletion, Undo or reload',async()=>{
 const {derivePlacement}=await import('../probe/saezuri/sequence-session.js');
 const {validateComposition}=await import('../saezuri/sequence.js');
 let s=keepPhrase(emptySequence(),phrase(),'A');s=append(s,s.patterns[0].id);
 const first=commitSequence(s,derivePlacement(s,s.placements[0].id,s.patterns[0]));
 s=undoPlacement(first);s=keepPhrase(s,phrase(),'A 2');
 const changed=commitSequence(s,derivePlacement(s,s.placements[0].id,s.patterns[0]));
 assert.equal(changed.patterns.at(-1).name,'A 3');
 const saved=JSON.parse(JSON.stringify({...changed,undoStack:[]}));assert.equal(validateComposition(saved),null);
 assert.equal(new Set(saved.patterns.map(p=>p.id)).size,saved.patterns.length);
 let empty=keepPhrase(emptySequence(),phrase(),'A');empty=commitSequence(empty,proposeSequence(empty,{type:'delete-pattern',patternId:empty.patterns[0].id}));
 assert.equal(empty.keepEmpty,true,'explicitly emptying the shelf must not delete its saved song');
});
test('4 and 8 bar phrases flatten with exact offsets, accompaniment, and a single tied attack',()=>{
 let s=keepPhrase(keepPhrase(emptySequence(),phrase(),'A'),phrase(8,67),'B');
 s=append(append(s,s.patterns[0].id),s.patterns[1].id);const play=sequencePlayback(s);
 assert.equal(play.pattern.bars,12);assert.deepEqual(play.pattern.notes.map(n=>[n.startTick,n.durationTick,n.midi]),[[0,64,60],[64,128,67]]);
 assert.equal(play.ranges[1].start,64);assert.equal(play.ranges[1].end,192);
 assert.ok(play.backing.some(n=>n.startTick===64));
 const moved=commitSequence(s,proposeSequence(s,{type:'move',placementId:s.placements[1].id,index:0}));
 assert.deepEqual(sequencePlayback(moved).pattern.notes.map(n=>n.midi),[67,60]);
 assert.deepEqual(undoPlacement(moved).placements,s.placements);
});
test('arrangement undo preserves subsequently registered phrases, and the 16 placement bound',()=>{
 let s=keepPhrase(emptySequence(),phrase(),'A');s=append(s,s.patterns[0].id);s=keepPhrase(s,phrase(),'B');
 const undone=undoPlacement(s);assert.equal(undone.patterns.length,2);assert.equal(undone.placements.length,0);
 for(let i=0;i<15;i++)s=append(s,s.patterns[0].id);
 assert.equal(proposeSequence(s,{type:'append',placement:{id:'overflow',patternId:s.patterns[0].id}}).code,'PLACEMENT_LIMIT');
});


test('editing one placement derives a complete phrase and leaves its source and other placements intact',async()=>{
 const {derivePlacement}=await import('../probe/saezuri/sequence-session.js');
 assert.equal(typeof derivePlacement,'function');
 let s=keepPhrase(emptySequence(),{...phrase(),key:{tonicPitchClass:0,mode:'major'}},'A');
 s=append(append(s,s.patterns[0].id),s.patterns[0].id);const before=structuredClone(s),source=s.patterns[0];
 const edited={...structuredClone(source),key:{tonicPitchClass:9,mode:'minor'},notes:[{id:'new',midi:69,startTick:4,durationTick:12}],accompaniment:{...source.accompaniment,rhythm:'arpeggio',sounds:{chord:'strings'}}};
 const candidate=derivePlacement(s,s.placements[0].id,edited);assert.equal(candidate.code,undefined);assert.deepEqual(s,before);
 const changed=commitSequence(s,candidate),derived=changed.patterns.find(p=>p.id===changed.placements[0].patternId);
 assert.deepEqual(changed.patterns.find(p=>p.id===source.id),source);assert.equal(changed.placements[1].patternId,source.id);
 assert.notEqual(derived.id,source.id);assert.equal(derived.familyId,source.familyId);assert.notEqual(derived.name,source.name);
 assert.deepEqual(derived.notes,edited.notes);assert.deepEqual(derived.key,edited.key);assert.deepEqual(derived.accompaniment,edited.accompaniment);
});
