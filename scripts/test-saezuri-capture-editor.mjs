import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptureEditor, proposeCaptureEdit, commitNote, undo } from '../probe/saezuri/capture-editor.js';
import { scoreEvents, validateNotes } from '../saezuri/document.js';

const captured = () => ({bars:4,gridStep:1,notes:[
  {id:'a',startTick:14,durationTick:6,midi:55,origin:'completed',completedRanges:[{start:1.8,end:1.85}]},
  {id:'b',startTick:20,durationTick:4,midi:54,origin:'detected',completedRanges:[]},
  {id:'c',startTick:28,durationTick:4,midi:57,origin:'detected',completedRanges:[]},
]});
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

test('editor starts from an independent valid capture clone', () => {
  const source = freeze(captured()), state = createCaptureEditor(source);
  assert.deepEqual(state, {pattern:source,cursor:0,revision:0,undoStack:[]});
  state.pattern.notes[0].completedRanges[0].start = 0;
  assert.equal(source.notes[0].completedRanges[0].start, 1.8);
  assert.equal(createCaptureEditor({...captured(),bars:3}).code, 'PATTERN_INVALID');
});

test('replace and delete only propose changes; confirmation and undo restore the original capture', () => {
  const state = freeze({...createCaptureEditor(captured()),selectedNoteId:'a'});
  for (const command of [
    {type:'replace',noteId:'a',midi:0,startTick:13,durationTick:7},
    {type:'delete',noteId:'a'},
  ]) {
    const candidate = proposeCaptureEdit(state, command);
    assert.equal(candidate.code, undefined);
    assert.deepEqual(state.pattern, captured());
    const changed = commitNote(state, candidate);
    assert.equal(changed.revision, 1);
    assert.equal(changed.undoStack.length, 1);
    assert.deepEqual(undo(changed).pattern, state.pattern);
    assert.equal(undo(changed).cursor, 0);
    assert.equal(undo(changed).selectedNoteId, 'a');
    if (command.type === 'delete') assert.equal(changed.selectedNoteId, null);
    else {
      assert.equal(changed.pattern.notes[0].id, 'a');
      assert.equal(changed.pattern.notes[0].origin, 'input');
      assert.ok(!changed.pattern.notes[0].completedRanges?.length);
    }
  }
});

test('split preserves the original tie note ID and clears recognition provenance on both edited parts', () => {
  const state = freeze({...createCaptureEditor(captured()),selectedNoteId:'a'});
  assert.ok(scoreEvents(state.pattern).filter(e => e.noteId === 'a').length > 1);
  const candidate = proposeCaptureEdit(state, {type:'split',noteId:'a',offsetTick:2});
  assert.equal(candidate.code, undefined);
  assert.deepEqual(candidate.pattern.notes.slice(0,2).map(n => [n.startTick,n.durationTick,n.midi]), [[14,2,55],[16,4,55]]);
  assert.equal(candidate.pattern.notes[0].id, 'a');
  assert.notEqual(candidate.pattern.notes[1].id, 'a');
  assert.ok(candidate.pattern.notes.slice(0,2).every(n => n.origin === 'input' && !n.completedRanges?.length));
  assert.equal(candidate.cursor, 16);
  const changed = commitNote(state, candidate);
  assert.equal(changed.selectedNoteId, 'a');
  assert.deepEqual(undo(changed).pattern, state.pattern);
  assert.deepEqual(state.pattern, captured());
});

test('split IDs are deterministic, collision-safe, and proposals do not consume revisions', () => {
  const initial = createCaptureEditor(captured());
  const command = {type:'split',noteId:'a',offsetTick:2};
  const reservedId = proposeCaptureEdit(initial,command).pattern.notes[1].id;
  const pattern = captured();
  pattern.notes.push({id:reservedId,startTick:40,durationTick:1,midi:127});
  const state = freeze(createCaptureEditor(pattern));
  const first = proposeCaptureEdit(state, command), second = proposeCaptureEdit(state, command);
  assert.deepEqual(first, second);
  assert.notEqual(first.pattern.notes[1].id, reservedId);
  assert.equal(new Set(first.pattern.notes.map(n => n.id)).size, first.pattern.notes.length);
  assert.equal(state.revision, 0);
  const restored = undo(commitNote(state, first));
  assert.notEqual(proposeCaptureEdit(restored,command).pattern.notes[1].id, first.pattern.notes[1].id);
});

test('split rejects ends, fractions, and positions off the existing grid', () => {
  const state = createCaptureEditor(captured());
  for (const offsetTick of [-1,0,6,7]) assert.equal(proposeCaptureEdit(state,{type:'split',noteId:'a',offsetTick}).code,'NOTE_SPLIT');
  for (const offsetTick of [1.5,NaN,undefined]) assert.equal(proposeCaptureEdit(state,{type:'split',noteId:'a',offsetTick}).code,'NOTE_GRID');
  const eighthGrid = createCaptureEditor({...captured(),gridStep:2});
  assert.equal(proposeCaptureEdit(eighthGrid,{type:'split',noteId:'a',offsetTick:1}).code,'NOTE_GRID');
  assert.equal(proposeCaptureEdit(eighthGrid,{type:'split',noteId:'a',offsetTick:2}).code,undefined);
});

test('merge finds the chronological next note even when input storage is unsorted', () => {
  const pattern = captured(); pattern.notes.reverse();
  const state = freeze(createCaptureEditor(pattern));
  for (const midi of [undefined,0,127]) {
    const candidate = proposeCaptureEdit(state,{type:'merge-next',noteId:'a',midi});
    assert.equal(candidate.code,undefined);
    const merged = candidate.pattern.notes.find(n => n.id === 'a');
    assert.deepEqual([merged.startTick,merged.durationTick,merged.midi], [14,10,midi ?? 55]);
    assert.equal(merged.origin,'input');
    assert.ok(!merged.completedRanges?.length);
    assert.ok(!candidate.pattern.notes.some(n => n.id === 'b'));
    assert.equal(candidate.cursor,24);
    assert.equal(validateNotes(candidate.pattern),null);
    assert.deepEqual(undo(commitNote(state,candidate)).pattern,pattern);
  }
});

test('merge refuses rests, absent next notes, and invalid pitch without touching the source', () => {
  const state = freeze(createCaptureEditor(captured()));
  assert.equal(proposeCaptureEdit(state,{type:'merge-next',noteId:'b'}).code,'NOTE_GAP');
  assert.equal(proposeCaptureEdit(state,{type:'merge-next',noteId:'c'}).code,'NOTE_NEXT_NOT_FOUND');
  for (const midi of [-1,128,54.5,null]) assert.equal(proposeCaptureEdit(state,{type:'merge-next',noteId:'a',midi}).code,'NOTE_PITCH');
  assert.deepEqual(state.pattern,captured());
});

test('selection of a consumed merge note is cleared on commit and restored by undo', () => {
  const state = {...createCaptureEditor(captured()),selectedNoteId:'b'};
  const changed = commitNote(state,proposeCaptureEdit(state,{type:'merge-next',noteId:'a',midi:54}));
  assert.equal(changed.selectedNoteId,null);
  assert.equal(undo(changed).selectedNoteId,'b');
});

test('all proposal types carry strict stale guards and cannot be confirmed twice', () => {
  const commands = [
    {type:'replace',noteId:'a',midi:54,startTick:14,durationTick:6},
    {type:'delete',noteId:'a'}, {type:'split',noteId:'a',offsetTick:2}, {type:'merge-next',noteId:'a'},
  ];
  for (const command of commands) {
    const state = createCaptureEditor(captured()), candidate = proposeCaptureEdit(state,command);
    assert.equal(candidate.baseRevision,0); assert.equal(candidate.baseCursor,0);
    assert.deepEqual(candidate.basePattern,state.pattern);
    assert.equal(commitNote(commitNote(state,candidate),candidate).code,'STALE_CANDIDATE');
    assert.equal(commitNote({...state,cursor:1},candidate).code,'STALE_CANDIDATE');
    const external = structuredClone(state); external.pattern.notes[0].midi = 53;
    assert.equal(commitNote(external,candidate).code,'STALE_CANDIDATE');
    assert.equal(commitNote(undo(commitNote(state,candidate)),candidate).code,'STALE_CANDIDATE');
  }
});

test('replacement retains sixteenth precision and enforces MIDI, overlap and end boundaries', () => {
  const state = createCaptureEditor(captured());
  const command = {type:'replace',noteId:'a',midi:127,startTick:13,durationTick:7};
  assert.equal(proposeCaptureEdit(state,command).code,undefined);
  for (const [change,code] of [
    [{midi:128},'NOTE_PITCH'],[{midi:-1},'NOTE_PITCH'],[{startTick:13.5},'NOTE_GRID'],
    [{durationTick:0},'NOTE_GRID'],[{startTick:60,durationTick:5},'NOTE_OVERFLOW'],[{durationTick:8},'NOTE_OVERLAP'],
  ]) assert.equal(proposeCaptureEdit(state,{...command,...change}).code,code);
  assert.equal(proposeCaptureEdit(state,{type:'split',noteId:'missing',offsetTick:2}).code,'NOTE_NOT_FOUND');
  assert.equal(proposeCaptureEdit(state,{type:'unknown',noteId:'a'}).code,'COMMAND_UNKNOWN');
});
