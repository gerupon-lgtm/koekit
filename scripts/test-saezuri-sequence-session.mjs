import test from 'node:test';import assert from 'node:assert/strict';
import {emptySequence,keepPhrase,sequencePlayback,proposeSequence,commitSequence,undoPlacement} from '../probe/saezuri/sequence-session.js';
const phrase=(bars=4,midi=60)=>({bars,gridStep:2,notes:[{id:'n',midi,startTick:0,durationTick:bars*16}],accompaniment:{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'}});
const append=(s,id)=>commitSequence(s,proposeSequence(s,{type:'append',placement:{id:`p${s.revision}`,patternId:id}}));
test('registered phrases are independent snapshots and arrangement candidates require confirmation',()=>{
 const p=phrase(),s=keepPhrase(emptySequence(),p,' A ');p.notes[0].midi=72;
 assert.equal(s.patterns[0].notes[0].midi,60);assert.equal(s.patterns[0].name,'A');
 const candidate=proposeSequence(s,{type:'append',placement:{id:'p',patternId:s.patterns[0].id}});
 assert.equal(s.placements.length,0);assert.equal(candidate.next.placements.length,1);
 const committed=commitSequence(s,candidate);assert.equal(commitSequence(committed,candidate).code,'STALE_CANDIDATE');
 assert.equal(keepPhrase(s,{...phrase(),notes:[]},'empty').code,'EMPTY_PHRASE');
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
