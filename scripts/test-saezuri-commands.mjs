import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeEdit, commitNote, undo, resizePattern } from '../saezuri/document.js';
import { validateComposition, proposeSequence, commitSequence, undoSequence, compositionTicks } from '../saezuri/sequence.js';

const pattern = (id = 'A', midi = 60, bars = 4) => ({id, familyId:id, bars, gridStep:2, notes:[{id:'n1',startTick:0,durationTick:4,midi}]});
const song = () => ({revision:0, patterns:[pattern('A'),pattern('B',64)], placements:[{id:'p1',patternId:'A'},{id:'p2',patternId:'B'},{id:'p3',patternId:'A'}], ending:{enabled:false}});

test('shortening clears a removed selection and undo restores it', () => {
  const state = {pattern:{...pattern(),bars:8,notes:[{id:'tail',midi:60,startTick:80,durationTick:4}]},cursor:84,selectedNoteId:'tail',revision:0};
  const shorter = resizePattern(state,4,{confirmed:true});
  assert.equal(shorter.selectedNoteId,null);
  assert.equal(undo(shorter).selectedNoteId,'tail');
});

test('replacement previews without mutation, preserves note identity, and restores cursor/selection on undo', () => {
  const state = {pattern:pattern(), cursor:12, selectedNoteId:'n1', revision:0};
  const candidate = proposeEdit(state,{type:'replace',noteId:'n1',midi:48,startTick:14,durationTick:6});
  assert.equal(state.pattern.notes[0].midi,60);
  const next = commitNote(state,candidate);
  assert.deepEqual(next.pattern.notes[0],{id:'n1',midi:48,startTick:14,durationTick:6,origin:'input'});
  assert.equal(next.cursor,20);
  const restored = undo(next);
  assert.equal(restored.cursor,12);
  assert.equal(restored.selectedNoteId,'n1');
  assert.deepEqual(restored.pattern,state.pattern);
});
test('deletion is a candidate, stale preview cannot commit; invalid replacements preserve every note', () => {
  const state = {pattern:pattern(), cursor:4, revision:0};
  const candidate = proposeEdit(state,{type:'delete',noteId:'n1'});
  assert.equal(state.pattern.notes.length,1);
  const deleted = commitNote(state,candidate);
  assert.equal(deleted.pattern.notes.length,0);
  assert.equal(deleted.cursor,0);
  assert.equal(commitNote(deleted,candidate).code,'STALE_CANDIDATE');
  assert.equal(proposeEdit(state,{type:'replace',noteId:'n1',midi:60,startTick:62,durationTick:4}).code,'NOTE_OVERFLOW');
  assert.equal(proposeEdit(state,{type:'delete',noteId:'missing'}).code,'NOTE_NOT_FOUND');
});
test('editing last A in A-B-A copies only that placement and retains its family', () => {
  const original = song();
  const candidate = proposeSequence(original,{type:'edit',edits:[{placementId:'p3',patternId:'A-copy',notes:[{id:'n1',midi:48,startTick:0,durationTick:4}]}]});
  assert.equal(original.patterns.length,2);
  const next = commitSequence(original,candidate);
  assert.deepEqual(next.placements.map(p=>p.patternId),['A','B','A-copy']);
  assert.equal(next.patterns.find(p=>p.id==='A').notes[0].midi,60);
  assert.equal(next.patterns.find(p=>p.id==='A-copy').familyId,'A');
  assert.equal(next.patterns.find(p=>p.id==='A-copy').notes[0].midi,48);
  assert.deepEqual(undoSequence(next).placements,original.placements);
  assert.equal(commitSequence(next,candidate).code,'STALE_CANDIDATE');
});
test('explicit multi-placement edit is atomic and does not affect unselected placements', () => {
  const original = song();
  const edits = ['p1','p3'].map((placementId,i)=>({placementId,patternId:`copy${i}`,notes:[{id:'n1',midi:72,startTick:0,durationTick:4}]}));
  const bad = structuredClone(edits); bad[1].notes[0].durationTick = 66;
  assert.equal(proposeSequence(original,{type:'edit',edits:bad}).code,'NOTE_OVERFLOW');
  assert.equal(original.patterns.length,2);
  const candidate = proposeSequence(original,{type:'edit',edits});
  assert.deepEqual(candidate.targets,['p1','p3']);
  const next = commitSequence(original,candidate);
  assert.deepEqual(next.placements.map(p=>p.patternId),['copy0','B','copy1']);
  assert.deepEqual(undoSequence(next).patterns,original.patterns);
});
test('16 placements is separate from retained pattern count and ending bar', () => {
  const original = song();
  original.patterns = Array.from({length:20},(_,i)=>pattern(`part${i}`,60,8));
  original.placements = Array.from({length:16},(_,i)=>({id:`p${i}`,patternId:'part0'}));
  original.ending.enabled = true;
  assert.equal(validateComposition(original),null);
  assert.equal(compositionTicks(original),2064);
  assert.equal(proposeSequence(original,{type:'append',placement:{id:'new',patternId:'part1'}}).code,'PLACEMENT_LIMIT');
  const moved = commitSequence(original,proposeSequence(original,{type:'move',placementId:'p15',index:0}));
  assert.equal(moved.placements[0].id,'p15');
  const removed = commitSequence(moved,proposeSequence(moved,{type:'remove',placementId:'p15'}));
  assert.equal(removed.placements.length,15);
  assert.equal(removed.patterns.length,20);
  assert.equal(compositionTicks(removed),1936);
});
test('missing references, duplicate ids and malformed patterns are rejected', () => {
  for (const modify of [s=>s.placements.push({...s.placements[0]}),s=>s.placements[0].patternId='missing',s=>s.patterns.push({...s.patterns[0]})]) {
    const value = song(); modify(value); assert.ok(validateComposition(value)?.code);
  }
  assert.equal(validateComposition(null).code,'COMPOSITION_INVALID');
  const value = song();value.patterns[0].notes=[null];
  assert.equal(validateComposition(value).code,'NOTE_INVALID');
});
