export const counts = [1, 2, 4, 6, 8, 12, 16];
export const velocity = 70;
export const ids = { melody: 'dx7ii-dx7iifdvoice32-s09', chord: 'dx7ii-dx7iifdvoice32-s15', bass: 'dx7ii-dx7iifdvoice32b-s02' };
export function partsFor(scenario, count, voices) {
  if (!counts.includes(count) || !['single', 'mixed'].includes(scenario)) throw Error('Invalid test condition');
  const pitches = length => Array.from({ length }, (_, index) => 48 + Math.floor(index / 3) * 12 + [0, 4, 7][index % 3]);
  if (scenario === 'single') return [{ role: 'chord', voice: voices[ids.melody], notes: pitches(count) }];
  const parts = [{ role: 'melody', voice: voices[ids.melody], notes: [72] }];
  if (count >= 2) parts.push({ role: 'bass', voice: voices[ids.bass], notes: [48] });
  if (count >= 4) parts.push({ role: 'chord', voice: voices[ids.chord], notes: pitches(count - 2) });
  return parts;
}
export function frameEvents(parts, sampleRate, durationSeconds, mode) {
  if (!['held', 'repeat'].includes(mode)) throw Error('Invalid mode');
  const events = [];
  const step = mode === 'repeat' ? 0.5 : durationSeconds;
  for (let at = 0, repetition = 0; at < durationSeconds; at += step, repetition++) {
    const transpose = mode === 'repeat' && repetition % 2 ? 12 : 0;
    parts.forEach((part, index) => {
      const notes = part.notes.map(note => note + transpose);
      events.push({ frame: Math.round(at * sampleRate), part: index, intents: notes.map(note => ({ type: 'noteOn', note, velocity })) });
      if (mode === 'repeat') events.push({ frame: Math.round((at + 0.35) * sampleRate), part: index, intents: notes.map(note => ({ type: 'noteOff', note })) });
    });
  }
  return events.sort((a, b) => a.frame - b.frame);
}
