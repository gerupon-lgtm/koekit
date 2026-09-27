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
