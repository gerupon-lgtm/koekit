import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialPattern,tutorialExcerpt} from '../probe/saezuri/tutorial-data.js';
import {validateNotes,scoreEvents} from '../saezuri/document.js';
import {accompanimentEvents,validateAccompaniment} from '../saezuri/music/accompaniment.js';
import {openEditSession,stageDuration,confirmEditSession,cancelEditSession,undoEditSession} from '../probe/saezuri/edit-session.js';

test('the lesson plays the approved rhythm and carries one E across the bar without a new attack',()=>{
 const pattern=tutorialPattern();
 assert.equal(validateNotes(pattern),null);
 assert.deepEqual(pattern.notes.map(n=>[n.startTick,n.durationTick,n.midi]),[
  [0,4,62],[4,4,64],[8,2,67],[10,6,64],
  [16,4,65],[20,4,64],[24,8,62],
  [32,4,67],[38,2,67],[40,2,69],[42,4,67],[46,4,64],
  [50,4,62],[54,2,60],[56,8,60],
 ]);
 const tied=scoreEvents(pattern).filter(n=>n.noteId===pattern.notes.find(n=>n.startTick===46).id);
 assert.deepEqual(tied.map(n=>[n.startTick,n.durationTick,!!n.tieIn,!!n.tieOut]),[[46,2,false,true],[48,2,true,false]]);
 assert.equal(accompanimentEvents(pattern).length,0);
 const copy=tutorialPattern();copy.notes[0].midi=99;assert.equal(tutorialPattern().notes[0].midi,62);
});

test('the tutorial backing keeps the approved six chord hits and eight bass hits per measure',()=>{
 const pattern=tutorialPattern({backing:true});
 assert.equal(validateAccompaniment(pattern.accompaniment,4),null);
 const events=accompanimentEvents(pattern);
 assert.equal(events.length,140);
 assert.deepEqual(events.filter(n=>n.part==='bass').map(n=>n.startTick),Array.from({length:32},(_,i)=>i*2));
 assert.ok(events.filter(n=>n.part==='bass').every(n=>n.durationTick===2&&n.gain===.12&&n.velocity===55));
 for(const start of [0,16,32,48]){
  const chords=events.filter(n=>n.part==='chord'&&n.startTick>=start&&n.startTick<start+16);
  assert.deepEqual(chords.map(n=>n.startTick-start),[0,0,0,2,2,2,6,6,6,8,8,8,10,10,10,14,14,14]);
  assert.ok(chords.every(n=>n.durationTick===2&&n.gain===(n.startTick===start?.06:.045)));
 }
 assert.equal(events.filter(n=>n.instrument==='electro-kick'&&n.startTick%16===0&&n.gain===.09).length,4);
 assert.equal(events.filter(n=>n.instrument==='electro-hat'&&n.startTick%16===0&&n.gain===.035).length,4);
});

test('partial auditions keep the chosen music range, harmony and clipped note lengths',()=>{
 const source=tutorialPattern({backing:true}),before=structuredClone(source);
 const first=tutorialExcerpt(source,0,8);
 assert.equal(first.totalTicks,8);assert.deepEqual(first.notes.map(n=>[n.startTick,n.durationTick,n.midi]),[[0,4,62],[4,4,64]]);
 const last=tutorialExcerpt(source,48,64);
 assert.equal(last.totalTicks,16);assert.deepEqual(last.notes.map(n=>[n.startTick,n.durationTick,n.midi]),[[0,2,64],[2,4,62],[6,2,60],[8,8,60]]);
 assert.equal(last.accompaniment.filter(n=>n.part==='bass')[0].midi,36);
 const back=tutorialExcerpt(source,32,64);
 assert.equal(back.accompaniment.filter(n=>n.part==='bass')[0].midi,43);
 assert.equal(back.notes.find(n=>n.midi===64).durationTick,4);
 assert.deepEqual(source,before);
 for(const range of [[0,0],[-2,16],[0,66],[1,16]])assert.throws(()=>tutorialExcerpt(source,...range),/TUTORIAL_RANGE/);
});

test('extending the last selected note is a reversible candidate and follows its new endpoint',()=>{
 let session=openEditSession({bars:4,gridStep:2,source:'manual',notes:[{id:'e',startTick:46,durationTick:2,midi:64}]});
 session.working.selectedNoteId='e';session.working.cursor=48;session.confirmedCursor=48;
 const candidate=stageDuration(session,4);
 assert.equal(candidate.confirmed.notes[0].durationTick,2);assert.equal(candidate.working.pattern.notes[0].durationTick,4);
 assert.equal(candidate.working.cursor,50);assert.equal(session.working.cursor,48);
 const cancelled=cancelEditSession(candidate);assert.equal(cancelled.working.cursor,48);assert.equal(cancelled.working.pattern.notes[0].durationTick,2);
 const committed=confirmEditSession(candidate);assert.equal(committed.confirmed.notes[0].durationTick,4);
 const undone=undoEditSession(committed);assert.equal(undone.working.pattern.notes[0].durationTick,2);assert.equal(undone.working.cursor,48);
});

test('duration edits reject overlap and bad lengths without changing the confirmed melody',()=>{
 const session=openEditSession({bars:4,gridStep:2,source:'manual',notes:[{id:'e',startTick:46,durationTick:2,midi:64},{id:'d',startTick:48,durationTick:4,midi:62}]});
 session.working.selectedNoteId='e';const before=structuredClone(session);
 assert.equal(stageDuration(session,4).code,'NOTE_OVERLAP');
 for(const length of [0,3,NaN])assert.ok(stageDuration(session,length).code);
 assert.deepEqual(session,before);
});
