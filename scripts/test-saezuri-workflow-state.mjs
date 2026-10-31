import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySequence,keepPhrase,proposeSequence,commitSequence} from '../probe/saezuri/sequence-session.js';
import {openEditSession,confirmEditSession} from '../probe/saezuri/edit-session.js';
import {songCheckpoint} from '../probe/saezuri/song-session.js';
const state=await import('../probe/saezuri/workflow-state.js').catch(()=>({}));
const pattern=midi=>({bars:4,gridStep:2,source:'manual',key:{tonicPitchClass:0,mode:'major'},notes:[{id:'n',midi,startTick:0,durationTick:4}],accompaniment:{enabled:false}});
const record=(sequence=emptySequence(),checkpoint=null)=>({id:'one',schemaVersion:1,title:'同じ名前',data:{sequence,checkpoint,settings:{tempo:100,instrument:'fm-piano'}}});
test('workflow state API is available',()=>{assert.equal(typeof state.songNavigation,'function');assert.equal(typeof state.songPlaybackChoices,'function');});
test('old songs open registered materials on connect and standalone work on create',()=>{
 assert.deepEqual(state.songNavigation(record().data),{screen:'create',mode:'input'});
 const r=record(keepPhrase(emptySequence(),pattern(60),'A'));assert.equal(state.songNavigation(r.data).screen,'connect');
 r.data.checkpoint=songCheckpoint(confirmEditSession(openEditSession(pattern(62))));assert.equal(state.songNavigation(r.data).screen,'connect');
});
test('recorded screen/mode are restored; unknown fields do not block old songs',()=>{
 const r=record();r.data.navigation={screen:'create',mode:'backing'};assert.deepEqual(state.songNavigation(r.data),{screen:'create',mode:'backing'});
 r.data.navigation={screen:'connect',mode:'edit'};assert.equal(state.songNavigation(r.data).screen,'connect');
 r.data.navigation={screen:'bad',mode:'bad'};assert.deepEqual(state.songNavigation(r.data),{screen:'create',mode:'input'});
 r.data.placementDraft={placementId:'p'};assert.equal(state.songNavigation(r.data).screen,'create');
});
test('registered phrases are independent choices; listing does not mutate the record',()=>{
 const r=record(keepPhrase(keepPhrase(emptySequence(),pattern(60),'A'),pattern(67),'B')),before=JSON.stringify(r);
 const choices=state.songPlaybackChoices(r);assert.equal(choices.length,2);assert.deepEqual(choices.map(x=>x.state),['登録済み','登録済み']);
 choices[0].data.pattern.notes[0].midi=90;assert.equal(JSON.stringify(r),before);
});
test('draft and confirmed current phrase are separate audition choices',()=>{
 const session=confirmEditSession(openEditSession(pattern(60)));session.working.pattern.notes[0].midi=65;
 const r=record(emptySequence(),songCheckpoint(session));const before=JSON.stringify(r),choices=state.songPlaybackChoices(r);
 assert.equal(choices.length,2);assert.equal(choices[0].data.pattern.notes[0].midi,60);assert.equal(choices[1].data.pattern.notes[0].midi,65);
 assert.match(choices[1].state,/未確定/);assert.equal(JSON.stringify(r),before);
});
test('a phrase already registered is not offered twice as current confirmed',()=>{
 const r=record(keepPhrase(emptySequence(),pattern(60),'A'),songCheckpoint(confirmEditSession(openEditSession(pattern(60)))));
 assert.equal(state.songPlaybackChoices(r).length,1);
});
test('arranged songs offer the full order, not an arbitrary first phrase',()=>{
 let seq=keepPhrase(keepPhrase(emptySequence(),pattern(60),'A'),pattern(67),'B');
 for(const [i,index] of [0,1,0].entries())seq=commitSequence(seq,proposeSequence(seq,{type:'append',placement:{id:'p'+i,patternId:seq.patterns[index].id}}));
 const choices=state.songPlaybackChoices(record(seq));assert.equal(choices.length,1);assert.equal(choices[0].id,'sequence');assert.equal(choices[0].data.pattern.bars,12);
 assert.deepEqual(choices[0].data.pattern.notes.map(n=>n.midi),[60,67,60]);
});
test('missing playback data stays empty and is never repaired or deleted',()=>{const r=record(),before=JSON.stringify(r);assert.deepEqual(state.songPlaybackChoices(r),[]);assert.equal(JSON.stringify(r),before);});
