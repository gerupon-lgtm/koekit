import test from 'node:test';
import assert from 'node:assert/strict';
import { openEditSession, stageEdit, selectEditNote, confirmEditSession, cancelEditSession, undoEditSession, endEditSession, hasDraftChanges } from '../probe/saezuri/edit-session.js';
const pattern = () => ({bars:4,gridStep:1,notes:[{id:'a',midi:60,startTick:0,durationTick:4},{id:'b',midi:64,startTick:4,durationTick:4}]});
const move = (s,id,midi) => stageEdit(selectEditNote(s,id),{type:'replace',noteId:id,midi,startTick:id==='a'?0:4,durationTick:4});
test('multiple draft changes accumulate without replacing the confirmed pattern or source',()=>{
 const original=pattern(), first=openEditSession(original), a=move(first,'a',61), b=move(a,'b',65);
 assert.deepEqual(original,pattern()); assert.deepEqual(b.confirmed,pattern());
 assert.deepEqual(b.working.pattern.notes.map(n=>n.midi),[61,65]); assert.equal(hasDraftChanges(b),true);
 assert.equal(b.history.length,2); assert.equal(b.accepted,false);
});
test('confirmation is a checkpoint, permits more edits, and does not consume an undo step',()=>{
 const s=move(move(openEditSession(pattern()),'a',61),'b',65), confirmed=confirmEditSession(s);
 assert.equal(confirmed.accepted,true); assert.equal(hasDraftChanges(confirmed),false); assert.equal(confirmed.history.length,2);
 const reverted=undoEditSession(confirmed);
 assert.deepEqual(reverted.working.pattern.notes.map(n=>n.midi),[61,64]);
 assert.deepEqual(reverted.confirmed.notes.map(n=>n.midi),[61,65]); assert.equal(hasDraftChanges(reverted),true);
 const next=confirmEditSession(move(confirmed,'a',62)); assert.equal(next.confirmed.notes[0].midi,62);
 assert.equal(next.history.length,3);
});
test('cancel restores the checkpoint and undo can recover the cancelled draft',()=>{
 const s=confirmEditSession(move(openEditSession(pattern()),'a',61)), edit=move(s,'b',66), cancel=cancelEditSession(edit);
 assert.deepEqual(cancel.working.pattern,cancel.confirmed); assert.equal(hasDraftChanges(cancel),false);
 assert.deepEqual(undoEditSession(cancel).working.pattern,edit.working.pattern);
});
test('invalid edits are rejected atomically and selection alone does not add history',()=>{
 const s=openEditSession(pattern()), before=structuredClone(s), selected=selectEditNote(s,'b');
 assert.equal(selected.history.length,0); assert.equal(selected.working.selectedNoteId,'b');
 assert.equal(stageEdit(s,{type:'replace',noteId:'a',midi:61,startTick:0,durationTick:5}).code,'NOTE_OVERLAP');
 assert.deepEqual(s,before); assert.equal(selectEditNote(s,'missing').code,'NOTE_NOT_FOUND');
});
test('end refuses unconfirmed changes and drops history only after explicit session end',()=>{
 const s=move(openEditSession(pattern()),'a',61);
 assert.equal(endEditSession(s).code,'DRAFT_PENDING');
 const confirmed=confirmEditSession(s), closed=endEditSession(confirmed);
 assert.equal(closed.closed,true); assert.deepEqual(closed.history,[]); assert.deepEqual(closed.confirmed,confirmed.confirmed);
 assert.equal(stageEdit(closed,{type:'delete',noteId:'a'}).code,'SESSION_CLOSED');
 assert.equal(undoEditSession(closed).code,'SESSION_CLOSED');
 const reopened=openEditSession(closed.confirmed); assert.equal(reopened.history.length,0); assert.equal(reopened.closed,false);
});
test('delete all can be undone while empty draft remains a valid preview',()=>{
 let s=openEditSession(pattern()); s=stageEdit(s,{type:'delete',noteId:'a'}); s=stageEdit(s,{type:'delete',noteId:'b'});
 assert.equal(s.working.pattern.notes.length,0); assert.equal(s.working.selectedNoteId,null);
 const reverted=undoEditSession(s); assert.equal(reverted.working.pattern.notes.length,1); assert.equal(reverted.working.selectedNoteId,'b');
 assert.equal(confirmEditSession(s).confirmed.notes.length,0);
});
test('deleting a selected note leaves a rest, selects its neighbour, and undo restores it',()=>{
 const original=pattern();original.notes.push({id:'c',midi:67,startTick:8,durationTick:4});
 const s=selectEditNote(openEditSession(original),'b');
 const removed=stageEdit(s,{type:'delete',noteId:'b'});
 assert.deepEqual(removed.working.pattern.notes.map(n=>[n.id,n.startTick]),[['a',0],['c',8]]);
 assert.equal(removed.working.selectedNoteId,'c');assert.deepEqual(removed.confirmed,original);
 const restored=undoEditSession(removed);assert.deepEqual(restored.working.pattern,original);assert.equal(restored.working.selectedNoteId,'b');
});
