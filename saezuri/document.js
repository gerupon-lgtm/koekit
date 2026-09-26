// Pure timing/editing foundation. Persistence and Q1/Q2 lifecycle are not implemented.
const error = (code, details = {}) => ({ code, details });
export const tickSeconds = (tick, tempo) => tick * 60 / (tempo * 4);

export function validateNotes(pattern) {
  if (!pattern || ![4, 8].includes(pattern.bars) || ![1, 2].includes(pattern.gridStep) || !Array.isArray(pattern.notes)) return error('PATTERN_INVALID');
  if (pattern.notes.some(note => !note || typeof note !== 'object')) return error('NOTE_INVALID');
  const ids = new Set();
  let end = 0;
  for (const note of [...pattern.notes].sort((a, b) => a.startTick - b.startTick)) {
    if (!note.id || ids.has(note.id)) return error('NOTE_ID');
    ids.add(note.id);
    if (!Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127) return error('NOTE_PITCH');
    if (!Number.isInteger(note.startTick) || note.startTick < 0 || !Number.isInteger(note.durationTick) || note.durationTick <= 0 || note.startTick % pattern.gridStep || note.durationTick % pattern.gridStep) return error('NOTE_GRID');
    if (note.startTick + note.durationTick > pattern.bars * 16) return error('NOTE_OVERFLOW');
    if (note.startTick < end) return error('NOTE_OVERLAP');
    end = note.startTick + note.durationTick;
  }
  return null;
}

export function proposeNote(state, { midi, durationTick }) {
  const { pattern, cursor } = state;
  if (!Number.isInteger(cursor) || cursor < 0 || cursor % pattern.gridStep || !Number.isInteger(durationTick) || durationTick <= 0 || durationTick % pattern.gridStep) return error('NOTE_GRID');
  if (cursor + durationTick > pattern.bars * 16) return error('NOTE_OVERFLOW', { shortageBeats: (cursor + durationTick - pattern.bars * 16) / 4 });
  const next = structuredClone(pattern);
  if (midi !== null) next.notes.push({ id: `input-${state.revision}-${cursor}`, startTick: cursor, durationTick, midi, origin: 'input' });
  const invalid = validateNotes(next);
  if (invalid) return invalid;
  return { baseRevision: state.revision, basePattern: structuredClone(pattern), baseCursor: cursor, pattern: next, cursor: cursor + durationTick };
}

function changed(state, pattern, cursor) {
  const previous = { pattern: structuredClone(state.pattern), cursor: state.cursor };
  if ('selectedNoteId' in state) previous.selectedNoteId = state.selectedNoteId;
  const next = { ...state, pattern, cursor, revision: state.revision + 1, undoStack: [...(state.undoStack || []), previous] };
  if (next.selectedNoteId && !pattern.notes.some(note => note.id === next.selectedNoteId)) next.selectedNoteId = null;
  return next;
}

// Pure edit proposal only. Voice/delete/selection UI policy remains Q2.
export function proposeEdit(state, command) {
  const index = state.pattern.notes.findIndex(note => note.id === command.noteId);
  if (index < 0) return error('NOTE_NOT_FOUND');
  const pattern = structuredClone(state.pattern), note = pattern.notes[index];
  let cursor;
  if (command.type === 'delete') {
    pattern.notes.splice(index, 1);
    cursor = note.startTick;
  } else if (command.type === 'replace') {
    const { midi, startTick, durationTick } = command;
    pattern.notes[index] = { id: note.id, midi, startTick, durationTick, origin: 'input' };
    cursor = startTick + durationTick;
  } else return error('COMMAND_UNKNOWN');
  const invalid = validateNotes(pattern);
  if (invalid) return invalid;
  return { baseRevision: state.revision, basePattern: structuredClone(state.pattern), baseCursor: state.cursor, pattern, cursor };
}
export function commitNote(state, candidate) {
  if (!candidate || candidate.code) return candidate || error('CANDIDATE_INVALID');
  if (candidate.baseRevision !== state.revision || candidate.baseCursor !== state.cursor || JSON.stringify(candidate.basePattern) !== JSON.stringify(state.pattern)) return error('STALE_CANDIDATE');
  const invalid = validateNotes(candidate.pattern);
  if (invalid) return invalid;
  return changed(state, structuredClone(candidate.pattern), candidate.cursor);
}
export function undo(state) {
  if (!state.undoStack?.length) return state;
  const stack = [...state.undoStack];
  return { ...structuredClone(stack.pop()), revision: state.revision + 1, undoStack: stack };
}
export function resizePattern(state, bars, { copy = false, confirmed = false } = {}) {
  if (![4, 8].includes(bars)) return error('PATTERN_INVALID');
  if (bars === state.pattern.bars) return state;
  const next = structuredClone(state.pattern);
  if (bars === 4 && next.notes.some(n => n.startTick + n.durationTick > 64) && !confirmed) return error('SHORTEN_CONFIRM');
  if (bars === 8 && copy) next.notes.push(...next.notes.map(n => ({ ...n, id: `${n.id}-copy-${state.revision}`, startTick: n.startTick + 64 })));
  if (bars === 4) next.notes = next.notes.filter(n => n.startTick < 64).map(n => ({ ...n, durationTick: Math.min(n.durationTick, 64 - n.startTick) }));
  next.bars = bars;
  const invalid = validateNotes(next);
  return invalid || changed(state, next, Math.min(state.cursor, bars * 16));
}

// Read-only engraving intermediate form. Splits are NOT extra playback events.
export function scoreEvents(pattern) {
  const invalid = validateNotes(pattern);
  if (invalid) throw new Error(invalid.code);
  const events = [];
  let cursor = 0;
  const split = (start, end, note) => {
    for (let tick = start; tick < end;) {
      const boundary = Math.min(end, (Math.floor(tick / 4) + 1) * 4);
      const length = [4, 2, 1].find(n => n <= boundary - tick && tick % n === 0);
      events.push({ startTick: tick, durationTick: length, midi: note?.midi ?? null, noteId: note?.id ?? null, tieIn: !!note && tick > note.startTick, tieOut: !!note && tick + length < note.startTick + note.durationTick, origin: note?.origin });
      tick += length;
    }
  };
  for (const note of [...pattern.notes].sort((a, b) => a.startTick - b.startTick)) {
    split(cursor, note.startTick, null);
    split(note.startTick, note.startTick + note.durationTick, note);
    cursor = note.startTick + note.durationTick;
  }
  split(cursor, pattern.bars * 16, null);
  return events;
}
