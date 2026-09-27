import test from 'node:test';
import assert from 'node:assert/strict';
import {blankPattern,proposeEntry,confirmEntry,cancelEntry,moveEntryCursor,entryPreview} from '../probe/saezuri/entry-session.js';
import {openEditSession,undoEditSession,stageEdit,confirmEditSession,cancelEditSession} from '../probe/saezuri/edit-session.js';
const empty=()=>openEditSession(blankPattern());
const add=(s,midi=60,durationTick=4)=>confirmEntry(proposeEntry(s,{midi,durationTick}));

test('individual candidates replace without advancing, then commit once and retain session undo',()=>{
 const s=empty(),before=structuredClone(s),a=proposeEntry(s,{midi:60,durationTick:4});
 const b=proposeEntry(a,{midi:64,durationTick:8});
 assert.deepEqual(s,before);assert.equal(b.working.cursor,0);assert.equal(b.confirmed.notes.length,0);
 assert.equal(entryPreview(b).notes[0].midi,64);
 const c=confirmEntry(b);assert.equal(c.working.cursor,8);assert.equal(c.confirmed.notes[0].midi,64);
 assert.equal(confirmEntry(c).code,'CANDIDATE_INVALID');
 assert.deepEqual(undoEditSession(c).working.pattern,blankPattern());
 assert.equal(undoEditSession(c).working.cursor,0);
});
test('half-beat rests advance only on confirmation and undo restores the cursor',()=>{
 const s=add(empty()),a=proposeEntry(s,{midi:null,durationTick:2});
 assert.equal(a.working.cursor,4);assert.deepEqual(entryPreview(a),s.working.pattern);
 const b=confirmEntry(a);assert.equal(b.working.cursor,6);assert.equal(b.confirmed.notes.length,1);
 assert.equal(undoEditSession(b).working.cursor,4);assert.equal(b.history.length,2);
 assert.deepEqual(cancelEntry(a).working,s.working);
});
test('white-key range, grid, shortage and overlap errors retain input without mutating melody',()=>{
 const s=add(empty()),before=structuredClone(s);
 for(const midi of [59,61,85,60.5]) assert.equal(proposeEntry(s,{midi,durationTick:4}).entry.proposal.code,'ENTRY_PITCH');
 assert.equal(proposeEntry(s,{midi:60,durationTick:1}).entry.proposal.code,'NOTE_GRID');
 const nearEnd=moveEntryCursor(s,62),overflow=proposeEntry(nearEnd,{midi:60,durationTick:4});
 assert.equal(overflow.entry.proposal.details.shortageBeats,.5);assert.equal(confirmEntry(overflow).code,'NOTE_OVERFLOW');
 for(const midi of [60,null]) assert.equal(proposeEntry(moveEntryCursor(s,0),{midi,durationTick:2}).entry.proposal.code,'NOTE_OVERLAP');
 assert.equal(moveEntryCursor(s,3).code,'NOTE_GRID');assert.deepEqual(s,before);
});
test('replacement keeps source until confirmation, shortening leaves a gap, overlap rejects',()=>{
 const s=add(add(empty()),64),id=s.working.pattern.notes[0].id;
 const a=proposeEntry(s,{midi:67,durationTick:2,replaceNoteId:id});
 assert.equal(a.confirmed.notes[0].durationTick,4);assert.equal(entryPreview(a).notes[0].durationTick,2);
 const b=confirmEntry(a);assert.equal(b.working.cursor,2);assert.equal(b.confirmed.notes[1].startTick,4);
 assert.equal(proposeEntry(s,{midi:67,durationTick:6,replaceNoteId:id}).entry.proposal.code,'NOTE_OVERLAP');
 assert.equal(proposeEntry(s,{midi:null,durationTick:2,replaceNoteId:id}).entry.proposal.code,'ENTRY_REST_REPLACE');
});
test('cursor changes invalidate old proposals and provisional edits block new entry',()=>{
 const s=empty(),a=proposeEntry(s,{midi:60,durationTick:4}),moved=moveEntryCursor(a,8);
 assert.equal(moved.entry,null);assert.equal(confirmEntry({...moved,entry:a.entry}).code,'STALE_CANDIDATE');
 const filled=add(s),draft=stageEdit(filled,{type:'transpose',semitones:1});
 assert.equal(proposeEntry(draft,{midi:60,durationTick:4}).code,'DRAFT_PENDING');
 assert.equal(proposeEntry({...s,closed:true},{midi:60,durationTick:4}).code,'SESSION_CLOSED');
});
test('resize shares candidate, confirm, cancel and undo, preserving key and original notes',()=>{
 const s=add(empty()),extended=stageEdit(s,{type:'resize',bars:8,copy:true});
 assert.equal(extended.confirmed.bars,4);assert.equal(extended.working.pattern.bars,8);
 assert.deepEqual(extended.working.pattern.notes.map(n=>n.startTick),[0,64]);
 assert.equal(cancelEditSession(extended).working.pattern.bars,4);
 const accepted=confirmEditSession(extended),short=stageEdit(accepted,{type:'resize',bars:4});
 assert.equal(short.confirmed.notes.length,2);assert.equal(short.working.pattern.notes.length,1);
 assert.deepEqual(undoEditSession(short).working.pattern,accepted.confirmed);
 const minor=stageEdit(s,{type:'key',key:'Am'});assert.equal(minor.working.pattern.key.mode,'minor');
 assert.deepEqual(minor.working.pattern.notes,s.working.pattern.notes);
});
