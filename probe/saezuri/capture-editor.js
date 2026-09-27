import { proposeEdit, validateNotes } from '../../saezuri/document.js';
export { commitNote, undo } from '../../saezuri/document.js';

const error = code => ({code, details:{}});

export function createCaptureEditor(pattern) {
  const invalid = validateNotes(pattern);
  return invalid || {pattern:structuredClone(pattern), cursor:0, revision:0, undoStack:[]};
}

function inputNote(id, midi, startTick, durationTick) {
  return {id, midi, startTick, durationTick, origin:'input', completedRanges:[]};
}

function proposePattern(state, pattern, cursor) {
  const invalid = validateNotes(pattern);
  return invalid || {
    baseRevision:state.revision,
    basePattern:structuredClone(state.pattern),
    baseCursor:state.cursor,
    pattern,
    cursor,
  };
}

// Capture-specific split/merge proposals use the same two-step commit and
// stale-candidate checks as ordinary document edits. Nothing changes here
// until the caller confirms with commitNote; undo retains the capture metadata.
export function proposeCaptureEdit(state, command) {
  const invalid = validateNotes(state?.pattern);
  if (invalid) return invalid;
  if (!command || !['replace','delete','split','merge-next'].includes(command.type)) return error('COMMAND_UNKNOWN');
  if (command.type === 'replace' || command.type === 'delete') return proposeEdit(state, command);

  const pattern = structuredClone(state.pattern);
  const index = pattern.notes.findIndex(note => note.id === command.noteId);
  if (index < 0) return error('NOTE_NOT_FOUND');
  const note = pattern.notes[index];
  if (command.type === 'split') {
    const offset = command.offsetTick;
    if (!Number.isInteger(offset) || offset % pattern.gridStep) return error('NOTE_GRID');
    if (offset <= 0 || offset >= note.durationTick) return error('NOTE_SPLIT');
    const ids = new Set(pattern.notes.map(item => item.id));
    const baseId = `${note.id}-split-${state.revision}`;
    let rightId = baseId, suffix = 1;
    while (ids.has(rightId)) rightId = `${baseId}-${suffix++}`;
    pattern.notes.splice(index, 1,
      inputNote(note.id, note.midi, note.startTick, offset),
      inputNote(rightId, note.midi, note.startTick + offset, note.durationTick - offset));
    return proposePattern(state, pattern, note.startTick + offset);
  }

  const ordered = [...pattern.notes].sort((a,b) => a.startTick - b.startTick);
  const next = ordered[ordered.findIndex(item => item.id === note.id) + 1];
  if (!next) return error('NOTE_NEXT_NOT_FOUND');
  if (note.startTick + note.durationTick !== next.startTick) return error('NOTE_GAP');
  const midi = command.midi === undefined ? note.midi : command.midi;
  const end = next.startTick + next.durationTick;
  pattern.notes[index] = inputNote(note.id, midi, note.startTick, end - note.startTick);
  pattern.notes = pattern.notes.filter(item => item.id !== next.id);
  return proposePattern(state, pattern, end);
}
