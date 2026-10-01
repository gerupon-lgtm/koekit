// Agreed musical vocabulary only. Genre arrangements/voicings await trial listening.
export const CHORD_INTERVALS = Object.freeze(Object.fromEntries(Object.entries({
  major: [0, 4, 7], minor: [0, 3, 7], '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus4: [0, 5, 7],
  dim: [0, 3, 6], aug: [0, 4, 8], '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9], add9: [0, 4, 7, 14], 'm(add9)': [0, 3, 7, 14], 'm7♭5': [0,3,6,10],
}).map(([id, intervals]) => [id, Object.freeze(intervals)])));
export const GENRES = Object.freeze([
  { id: 'nursery', label: 'どうよう' }, { id: 'pop', label: 'ポップ' },
  { id: 'ballad', label: 'バラード' }, { id: 'rock', label: 'ロック' },
].map(Object.freeze));

const pitchClass = value => Number.isInteger(value) && value >= 0 && value <= 11;
export function chordTones(chord) {
  if (!chord || !pitchClass(chord.root) || !pitchClass(chord.bass) || !Object.hasOwn(CHORD_INTERVALS, chord.quality)) return { code: 'CHORD_INVALID' };
  // Reference root-position pitches for tests/comparison, not genre-specific voicing.
  return { notes: CHORD_INTERVALS[chord.quality].map(interval => 60 + chord.root + interval), bass: 36 + chord.bass };
}

export function validateCatalog(catalog) {
  if (!catalog || !Number.isSafeInteger(catalog.version) || catalog.version < 1 || !Array.isArray(catalog.progressions) || !Array.isArray(catalog.rhythms)) return { code: 'CATALOG_INVALID' };
  for (const entries of [catalog.progressions, catalog.rhythms]) {
    const ids = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) return { code: 'CATALOG_ID' };
      ids.add(entry.id);
    }
  }
  for (const progression of catalog.progressions) {
    if (!progression.key || !pitchClass(progression.key.tonicPitchClass) || !['major', 'minor'].includes(progression.key.mode) || !Array.isArray(progression.chords) || !progression.chords.length) return { code: 'PROGRESSION_INVALID' };
    for (const chord of progression.chords) if (chordTones(chord).code) return { code: 'CHORD_INVALID' };
  }
  for (const rhythm of catalog.rhythms) {
    if (![4, 8].includes(rhythm.bars) || !Array.isArray(rhythm.events)) return { code: 'RHYTHM_INVALID' };
    // Accompaniment may be polyphonic; only its timeline bounds are constrained here.
    for (const event of rhythm.events) if (!event || !Number.isInteger(event.startTick) || event.startTick < 0 || !Number.isInteger(event.durationTick) || event.durationTick < 1 || event.startTick + event.durationTick > rhythm.bars * 16) return { code: 'RHYTHM_EVENT_INVALID' };
  }
  return null;
}
