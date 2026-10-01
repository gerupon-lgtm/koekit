import test from 'node:test';
import assert from 'node:assert/strict';
import {openEditSession, stageEdit, confirmEditSession, undoEditSession, hasDraftChanges} from '../probe/saezuri/edit-session.js';
import {blankPattern, proposeEntry, confirmEntry} from '../probe/saezuri/entry-session.js';
const module = await import('../probe/saezuri/song-session.js').catch(()=>({}));
test('empty opening and unconfirmed backing do not allocate a song',()=>{
 assert.equal(typeof module.songCheckpoint,'function');
 const s=openEditSession(blankPattern());
 assert.equal(module.songCheckpoint(s),null);
 const edited=stageEdit(s,{type:'accompaniment',value:{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'}});
 assert.equal(module.songCheckpoint(edited),null);
 const saved=module.songCheckpoint(confirmEditSession(edited));
 assert.equal(saved.confirmed.pattern.accompaniment.enabled,true);
 assert.equal(saved.draft,null);
});
test('moving the cursor alone never creates an empty song',()=>{
 const s=openEditSession(blankPattern());s.working.cursor=16;
 assert.equal(module.songCheckpoint(s),null);
 s.accepted=true;s.confirmedCursor=0;assert.equal(module.songCheckpoint(s),null);
 assert.equal(module.songCheckpoint(confirmEditSession(s)),null);
});
test('an explicitly confirmed rest survives cursor navigation and restoration',()=>{
 const s=confirmEntry(proposeEntry(openEditSession(blankPattern()),{midi:null,durationTick:4}));
 s.working.cursor=0;
 const saved=module.songCheckpoint(s);
 assert.equal(saved.confirmed.pattern.notes.length,0);
 assert.equal(module.songCheckpoint(module.restoreCheckpoint(saved)).confirmed.hasRest,true);
 const undone=undoEditSession(s);assert.equal(hasDraftChanges(undone),true);
 assert.equal(module.songCheckpoint(confirmEditSession(undone)),null,'undoing and confirming removal of the only rest creates no new empty song');
});
test('unconfirmed note survives without becoming confirmed and restored undo starts empty',()=>{
 assert.equal(typeof module.restoreCheckpoint,'function');
 const s=proposeEntry(openEditSession(blankPattern()),{midi:60,durationTick:4});
 const saved=module.songCheckpoint(s);
 assert.equal(saved.confirmed,null);
 const restored=module.restoreCheckpoint(saved);
 assert.equal(restored.entry.input.midi,60);
 assert.equal(restored.confirmed.notes.length,0);
 assert.equal(restored.history.length,0);
});
test('draft chord edits retain the confirmed melody and checkpoint',()=>{
 assert.equal(typeof module.songCheckpoint,'function');
 let s=openEditSession({...blankPattern(),notes:[{id:'a',midi:60,startTick:0,durationTick:4}]});
 s=confirmEditSession(s);
 const next=stageEdit(s,{type:'accompaniment',value:{enabled:true,genre:'pop',rhythm:'offbeat',progression:'pop'}});
 const saved=module.songCheckpoint(next);
 assert.equal(saved.confirmed.pattern.accompaniment,undefined);
 assert.equal(saved.draft.working.pattern.accompaniment.genre,'pop');
 assert.equal(module.restoreCheckpoint(saved,{discardDraft:true}).working.pattern.accompaniment,undefined);
});
