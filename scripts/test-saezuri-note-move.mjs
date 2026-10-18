import test from 'node:test';import assert from 'node:assert/strict';
import {openEditSession,selectEditNote,stageEdit,confirmEditSession,undoEditSession,cancelEditSession} from '../probe/saezuri/edit-session.js';
import {readCaptureReport} from '../probe/saezuri/capture-report.js';
import {songCheckpoint,restoreCheckpoint} from '../probe/saezuri/song-session.js';
const pattern=()=>({bars:4,gridStep:1,source:'tap',key:{tonicPitchClass:0,mode:'major'},accompaniment:{enabled:true,genre:'pop',rhythm:'offbeat',progression:'pop'},notes:[{id:'a',midi:60,startTick:4,durationTick:4,origin:'input'},{id:'b',midi:67,startTick:20,durationTick:4,origin:'input'}]});

test('selected note moves one sixteenth without changing pitch, length, other notes or accompaniment; confirmation and undo retain the checkpoint',()=>{
 const original=pattern(),session=selectEditNote(openEditSession(original),'a'),moved=stageEdit(session,{type:'move',noteId:'a',deltaTick:1});
 assert.equal(moved.code,undefined);assert.equal(moved.working.pattern.notes[0].startTick,5);
 assert.equal(moved.working.pattern.notes[0].durationTick,4);assert.equal(moved.working.pattern.notes[0].midi,60);assert.equal(moved.working.selectedNoteId,'a');
 assert.deepEqual(moved.working.pattern.notes[1],original.notes[1]);assert.deepEqual(moved.working.pattern.accompaniment,original.accompaniment);assert.deepEqual(moved.confirmed,original);assert.deepEqual(session.working.pattern,original);
 assert.equal(moved.history.length,1);const confirmed=confirmEditSession(moved);assert.equal(confirmed.confirmed.notes[0].startTick,5);assert.deepEqual(undoEditSession(confirmed).working.pattern,original);assert.deepEqual(cancelEditSession(moved).working.pattern,original);
 const back=stageEdit(moved,{type:'move',noteId:'a',deltaTick:-1});assert.deepEqual(back.working.pattern,original);
});

test('manual sixteenth corrections survive copied diagnostics and saved draft/confirmation without moving the input cursor',()=>{
 const original=pattern();original.source='manual';original.gridStep=2;const session=confirmEditSession(openEditSession(original));session.working.cursor=28;
 const moved=stageEdit(session,{type:'move',noteId:'a',deltaTick:1}),restored=restoreCheckpoint(songCheckpoint(moved));
 assert.deepEqual(restored.working.pattern,moved.working.pattern);assert.deepEqual(restored.confirmed,original);assert.equal(restored.working.cursor,28);
 const adopted=confirmEditSession(moved),reopened=restoreCheckpoint(songCheckpoint(adopted));assert.deepEqual(reopened.confirmed,adopted.confirmed);
 const report={capture:null,captureCandidate:adopted.confirmed,compositionOptions:{tempo:120}};assert.deepEqual(readCaptureReport(JSON.stringify(report)).pattern,adopted.confirmed);
});

test('a move crossing a bar retains one note and its duration, with the old source and input cursor intact',()=>{
 const original=pattern();original.notes=[{id:'hum',midi:64,startTick:15,durationTick:6,origin:'detected',completedRanges:[{start:15,end:16}]}];
 const session=openEditSession(original);session.working.cursor=32;
 const moved=stageEdit(session,{type:'move',noteId:'hum',deltaTick:1});assert.equal(moved.working.pattern.notes.length,1);assert.equal(moved.working.pattern.notes[0].startTick,16);assert.equal(moved.working.pattern.notes[0].durationTick,6);assert.equal(moved.working.cursor,32);assert.equal(moved.working.selectedNoteId,'hum');assert.deepEqual(moved.confirmed,original);assert.deepEqual(undoEditSession(moved).working.pattern,original);
});
test('overlapping or out-of-song moves fail atomically, including a tie extending past the end',()=>{
 const original=pattern();original.notes=[{id:'a',midi:60,startTick:0,durationTick:4},{id:'b',midi:67,startTick:4,durationTick:4},{id:'end',midi:64,startTick:62,durationTick:2}];
 const session=openEditSession(original),before=structuredClone(session);
 for(const [noteId,deltaTick,code] of [['a',-1,'NOTE_MOVE_START'],['a',1,'NOTE_OVERLAP'],['b',-1,'NOTE_OVERLAP'],['end',1,'NOTE_OVERFLOW'],['a',0,'NOTE_GRID'],['a',.5,'NOTE_GRID'],['missing',1,'NOTE_NOT_FOUND']])assert.equal(stageEdit(session,{type:'move',noteId,deltaTick}).code,code);
 assert.deepEqual(session,before);
});
test('moving a coarse imported humming note exposes sixteenth precision without requantizing any other note; undo restores the coarse grid',()=>{
 const original=pattern();original.gridStep=2;original.source='humming';original.notes[0].origin='detected';
 const session=openEditSession(original),moved=stageEdit(session,{type:'move',noteId:'a',deltaTick:-1});
 assert.equal(moved.working.pattern.gridStep,1);assert.equal(moved.working.pattern.notes[0].startTick,3);assert.deepEqual(moved.working.pattern.notes[1],original.notes[1]);assert.deepEqual(moved.confirmed,original);assert.deepEqual(undoEditSession(moved).working.pattern,original);
});
