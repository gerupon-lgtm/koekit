import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNotes, proposeNote, commitNote, undo, resizePattern, scoreEvents, tickSeconds } from '../saezuri/document.js';
import { detectPitch, analyzeFrames, quantizeSegments } from '../probe/saezuri/analyzer.js';

const pattern = (notes = [], gridStep = 2) => ({ bars: 4, gridStep, notes });
const note = (startTick, durationTick, midi = 60, id = 'n1') => ({ id, startTick, durationTick, midi });
test('adjacent half-open notes are valid; overlap and overflow are rejected', () => {
  assert.equal(validateNotes(pattern([note(0, 4), note(4, 60, 64, 'n2')])), null);
  assert.equal(validateNotes(pattern([note(0, 5)] )).code, 'NOTE_GRID');
  assert.equal(validateNotes(pattern([note(0, 6), note(4, 2, 64, 'n2')])).code, 'NOTE_OVERLAP');
  assert.equal(validateNotes(pattern([note(62, 4)])).code, 'NOTE_OVERFLOW');
  assert.equal(validateNotes(pattern([note(0, 2, 128)])).code, 'NOTE_PITCH');
  assert.equal(validateNotes(pattern([note(0, 2), note(2, 2)])).code, 'NOTE_ID');
});
test('candidate is immutable, revision-bound, two-step; rest and undo restore cursor', () => {
  const state = { pattern: pattern(), cursor: 0, revision: 0 };
  const candidate = proposeNote(state, { midi: 64, durationTick: 4 });
  assert.equal(state.pattern.notes.length, 0);
  const next = commitNote(state, candidate);
  assert.equal(next.cursor, 4);
  assert.equal(next.pattern.notes[0].midi, 64);
  assert.equal(commitNote(next, candidate).code, 'STALE_CANDIDATE');
  const rest = commitNote(next, proposeNote(next, { midi: null, durationTick: 2 }));
  assert.equal(rest.cursor, 6);
  assert.equal(rest.pattern.notes.length, 1);
  const restored = undo(rest);
  assert.equal(restored.cursor, 4);
  assert.equal(restored.revision, 3);
  assert.equal(proposeNote({ ...state, cursor: 62 }, { midi: 60, durationTick: 4 }).details.shortageBeats, 0.5);
});
test('imported sixteenths and out-of-normal-range pitches survive', () => {
  assert.equal(validateNotes(pattern([note(1, 1, 48), note(3, 1, 96, 'n2')], 1)), null);
  assert.equal(tickSeconds(2064, 60), 516);
  assert.equal(tickSeconds(2048, 120), 256);
  assert.equal(tickSeconds(4, 180), 1 / 3);
});
test('extension copies first four bars; shortening requires confirmation and is undoable', () => {
  const state = { pattern: pattern([note(0, 4)]), cursor: 4, revision: 0 };
  const large = resizePattern(state, 8, { copy: true });
  assert.equal(large.pattern.notes[1].startTick, 64);
  assert.notEqual(large.pattern.notes[1].id, large.pattern.notes[0].id);
  assert.equal(resizePattern(large, 4).code, 'SHORTEN_CONFIRM');
  const small = resizePattern(large, 4, { confirmed: true });
  assert.equal(small.pattern.notes.length, 1);
  assert.deepEqual(undo(small).pattern, large.pattern);
});
test('score splits at bar/beat boundaries, retains source id and fills rests', () => {
  const events = scoreEvents(pattern([note(14, 6)]));
  const tied = events.filter(e => e.noteId === 'n1');
  assert.deepEqual(tied.map(e => [e.startTick, e.durationTick, e.tieIn, e.tieOut]), [[14, 2, false, true], [16, 4, true, false]]);
  assert.equal(events.reduce((sum, e) => sum + e.durationTick, 0), 64);
  assert.equal(events.filter(e => e.midi !== null && !e.tieIn).length, 1);
});
for (const sampleRate of [44100, 48000]) {
  for (const midi of [48, 60, 69, 84, 96]) test(`pitch ${midi} at ${sampleRate} Hz (sine and harmonic)`, () => {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    for (const harmonic of [0, 0.6]) {
      const samples = Float32Array.from({ length: 4096 }, (_, i) => 0.2 * Math.sin(2 * Math.PI * frequency * i / sampleRate) + harmonic * 0.2 * Math.sin(4 * Math.PI * frequency * i / sampleRate));
      const result = detectPitch(samples, sampleRate);
      assert.equal(result.kind, 'pitched');
      assert.ok(Math.abs(result.midi - midi) < 0.15, `${result.midi} != ${midi}`);
    }
  });
}
test('silence and aperiodic energy are separate', () => {
  assert.equal(detectPitch(new Float32Array(4096), 48000).kind, 'silence');
  let seed = 42;
  const noise = Float32Array.from({ length: 4096 }, () => { seed = (1664525 * seed + 1013904223) >>> 0; return (seed / 2 ** 32 - 0.5) * 0.3; });
  assert.equal(detectPitch(noise, 48000).kind, 'unknown');
});
test('only bounded voiced-unknown gaps are proposed for completion; silence stays empty', () => {
  const frames = [
    { time: 0, kind: 'pitched', midi: 60 }, { time: 0.1, kind: 'unknown' },
    { time: 0.2, kind: 'pitched', midi: 60 }, { time: 0.3, kind: 'silence' },
    { time: 0.4, kind: 'pitched', midi: 60 }, { time: 0.5, kind: 'unknown' },
  ];
  const result = analyzeFrames(frames, { endSeconds: 0.6, maxGapSeconds: 0.15 });
  assert.ok(result.segments.some(s => s.origin === 'completed' && s.completedRanges.some(r => r.start === 0.1)));
  assert.ok(!result.segments.some(s => s.start === 0.3 || s.start === 0.5));
  assert.equal(analyzeFrames([{ time: 0, kind: 'unknown' }], { endSeconds: 1 }).empty, true);
});
test('quantization clips tail, avoids overlaps, preserves separated repeated notes', () => {
  const result = quantizeSegments([
    { start: 0, end: 0.49, midi: 48, origin: 'detected' },
    { start: 0.65, end: 1, midi: 48, origin: 'detected' },
    { start: 7.8, end: 9, midi: 90, origin: 'detected' },
  ], 120);
  assert.equal(result.length, 3);
  assert.equal(result[2].startTick + result[2].durationTick, 64);
  assert.equal(validateNotes(pattern(result, 1)), null);
});
test('completion within one held pitch must not create extra attacks', () => {
  const result = analyzeFrames([
    { time: 0, kind: 'pitched', midi: 60 },
    { time: 0.5, kind: 'unknown' },
    { time: 0.6, kind: 'pitched', midi: 60 },
  ], { endSeconds: 1 });
  const notes = quantizeSegments(result.segments, 120);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].durationTick, 8);
  assert.equal(notes[0].origin, 'completed');
  assert.deepEqual(result.segments[0].completedRanges, [{ start: 0.5, end: 0.6 }]);
});
