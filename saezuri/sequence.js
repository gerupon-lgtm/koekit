// ML-T02: pure composition editing drafts, not the database Song serializer.
// undoStack is session-only. Q1 save/history lifecycle and Q2 selection UI are not implemented.
import { validateNotes } from './document.js?v=v0.1.0-20261018083007-a4d4b63';
import {validateAccompaniment} from './music/accompaniment.js?v=v0.1.0-20261018083007-a4d4b63';
import {validateEnding,endingBars} from './music/ending.js?v=v0.1.0-20261018083007-a4d4b63';
const error = code => ({ code });
const validId = id => typeof id === 'string' && id.length > 0;
function snapshot(draft) {
  const { undoStack, ...data } = draft;
  return structuredClone(data);
}

export function validateComposition(draft) {
  if (!draft || !Array.isArray(draft.patterns) || !Array.isArray(draft.placements) || !Number.isSafeInteger(draft.revision) || draft.revision < 0) return error('COMPOSITION_INVALID');
  if (draft.placements.length > 16) return error('PLACEMENT_LIMIT');
  const invalidEnding=validateEnding(draft.ending);if(invalidEnding)return invalidEnding;
  const patterns = new Set(), placements = new Set();
  for (const pattern of draft.patterns) {
    if (!pattern || !validId(pattern.id) || patterns.has(pattern.id) || !validId(pattern.familyId)) return error('PATTERN_ID');
    patterns.add(pattern.id);
    const invalid = validateNotes(pattern);
    if (invalid) return invalid;
  }
  for (const placement of draft.placements) {
    if (!placement || !validId(placement.id) || placements.has(placement.id)) return error('PLACEMENT_ID');
    placements.add(placement.id);
    if (!patterns.has(placement.patternId)) return error('PATTERN_NOT_FOUND');
  }
  return null;
}

export function compositionTicks(draft) {
  const invalid = validateComposition(draft);
  if (invalid) throw new Error(invalid.code);
  const patterns = new Map(draft.patterns.map(pattern => [pattern.id, pattern]));
  return draft.placements.reduce((ticks, placement) => ticks + patterns.get(placement.patternId).bars * 16, draft.placements.length?endingBars(draft.ending)*16:0);
}

export function proposeSequence(draft, command) {
  const invalid = validateComposition(draft);
  if (invalid) return invalid;
  const next = snapshot(draft), targets = [];
  if (command.type === 'append') next.placements.push(structuredClone(command.placement));
  else if (command.type === 'move' || command.type === 'remove') {
    const index = next.placements.findIndex(p => p.id === command.placementId);
    if (index < 0) return error('PLACEMENT_NOT_FOUND');
    if (command.type === 'move' && (!Number.isInteger(command.index) || command.index < 0 || command.index >= next.placements.length)) return error('PLACEMENT_INDEX');
    const [placement] = next.placements.splice(index, 1);
    if (command.type === 'move') next.placements.splice(command.index, 0, placement);
    targets.push(placement.id);
  } else if(command.type==='ending') {
    const invalidEnding=validateEnding(command.value);if(invalidEnding)return invalidEnding;
    next.ending=structuredClone(command.value);
  } else if(command.type==='derive') {
    const placement=next.placements.find(p=>p.id===command.placementId);
    if(!placement)return error('PLACEMENT_NOT_FOUND');
    if(!validId(command.patternId)||next.patterns.some(p=>p.id===command.patternId))return error('PATTERN_ID');
    const source=next.patterns.find(p=>p.id===placement.patternId);
    const replacement={...structuredClone(command.pattern),id:command.patternId,familyId:source.familyId,
      familyName:source.familyName??source.name,derivedFrom:source.id,name:command.name,revision:(source.revision??0)+1};
    const invalidPattern=validateNotes(replacement)??(replacement.accompaniment&&validateAccompaniment(replacement.accompaniment,replacement.bars));
    if(invalidPattern)return invalidPattern;
    next.patterns.push(replacement);placement.patternId=replacement.id;targets.push(placement.id);
  } else if(command.type==='replace') {
    const placement=next.placements.find(p=>p.id===command.placementId);
    if(!placement)return error('PLACEMENT_NOT_FOUND');
    if(!next.patterns.some(p=>p.id===command.patternId))return error('PATTERN_NOT_FOUND');
    placement.patternId=command.patternId;targets.push(placement.id);
  } else if(command.type==='delete-pattern') {
    if(!next.patterns.some(p=>p.id===command.patternId))return error('PATTERN_NOT_FOUND');
    if(next.placements.some(p=>p.patternId===command.patternId))return error('PATTERN_IN_USE');
    next.patterns=next.patterns.filter(p=>p.id!==command.patternId);
    if(!next.patterns.length)next.keepEmpty=true;
  } else if (command.type === 'edit') {
    if (!Array.isArray(command.edits) || !command.edits.length) return error('EDIT_TARGETS');
    let familyId;
    for (const edit of command.edits) {
      if (!edit || targets.includes(edit.placementId)) return error('EDIT_TARGETS');
      const placement = next.placements.find(p => p.id === edit.placementId);
      if (!placement) return error('PLACEMENT_NOT_FOUND');
      if (!validId(edit.patternId) || next.patterns.some(p => p.id === edit.patternId)) return error('PATTERN_ID');
      const source = next.patterns.find(p => p.id === placement.patternId);
      if (familyId !== undefined && familyId !== source.familyId) return error('FAMILY_MISMATCH');
      familyId = source.familyId;
      const replacement = { ...structuredClone(source), id: edit.patternId, revision: (source.revision || 0) + 1, notes: structuredClone(edit.notes) };
      const invalidPattern = validateNotes(replacement);
      if (invalidPattern) return invalidPattern;
      next.patterns.push(replacement);
      placement.patternId = replacement.id;
      targets.push(placement.id);
    }
  } else return error('COMMAND_UNKNOWN');
  const invalidNext = validateComposition(next);
  return invalidNext || { baseRevision: draft.revision, base: snapshot(draft), next, targets };
}

export function commitSequence(draft, candidate) {
  if (!candidate || candidate.code) return candidate || error('CANDIDATE_INVALID');
  if (candidate.baseRevision !== draft.revision || JSON.stringify(candidate.base) !== JSON.stringify(snapshot(draft))) return error('STALE_CANDIDATE');
  const invalid = validateComposition(candidate.next);
  if (invalid) return invalid;
  return { ...snapshot(candidate.next), revision: draft.revision + 1, undoStack: [...(draft.undoStack || []), snapshot(draft)] };
}

export function undoSequence(draft) {
  if (!draft.undoStack?.length) return draft;
  const stack = [...draft.undoStack];
  return { ...structuredClone(stack.pop()), revision: draft.revision + 1, undoStack: stack };
}
