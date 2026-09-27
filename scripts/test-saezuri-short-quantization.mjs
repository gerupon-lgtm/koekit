import test from 'node:test';
import assert from 'node:assert/strict';
import { quantizeSegments } from '../probe/saezuri/capture-quantization.js';

const rows = notes => notes.map(n => [n.startTick, n.durationTick, n.midi]);
const segment = (start, end, midi = 60) => ({ start, end, midi, origin: 'detected' });
const ticks = (start, end, tempo, midi = 60) => segment(start * 60 / (tempo * 4), end * 60 / (tempo * 4), midi);

test('retain the logged 106.7ms note whose endpoints both round to tick 31', () => {
  const original = [segment(3.8186667, 3.9253333, 54)];
  const before = structuredClone(original);
  assert.deepEqual(rows(quantizeSegments(original, 120)), [[31, 1, 54]]);
  assert.deepEqual(original, before);
});

for (const tempo of [60, 120, 180]) {
  test(`credible collapsed intervals survive at ${tempo} BPM without growing tiny fragments`, () => {
    assert.deepEqual(rows(quantizeSegments([ticks(3.6, 4.4, tempo)], tempo)), [[4, 1, 60]]);
    assert.deepEqual(quantizeSegments([ticks(3.8, 4.2, tempo)], tempo), []);
    assert.deepEqual(quantizeSegments([segment(.01, .04)], tempo), []);
  });
}

test('preserve the rounded start and drop a rescue that collides with either neighbor', () => {
  const cases = [
    [[ticks(0, 3, 120, 48), ticks(3.6, 4.4, 120, 60), ticks(4.4, 8, 120, 72)], [[0, 3, 48], [4, 4, 72]]],
    [[ticks(0, 3.6, 120, 48), ticks(3.6, 4.4, 120, 60), ticks(5, 8, 120, 72)], [[0, 4, 48], [4, 1, 60], [5, 3, 72]]],
    [[ticks(0, 3.6, 120, 48), ticks(3.6, 4.4, 120, 60), ticks(4.4, 8, 120, 72)], [[0, 4, 48], [4, 4, 72]]],
    [[ticks(0, 5, 120, 48), ticks(3.6, 4.4, 120, 60), ticks(6, 8, 120, 72)], [[0, 5, 48], [6, 2, 72]]],
  ];
  for (const [source, expected] of cases) assert.deepEqual(rows(quantizeSegments(source, 120)), expected);
});

test('earlier rescues keep their slot and never move a later collided rescue', () => {
  const source = [ticks(3.6, 4.2, 120, 60), ticks(3.8, 4.4, 120, 62), ticks(4.6, 5.4, 120, 64)];
  assert.deepEqual(rows(quantizeSegments(source, 120)), [[4, 1, 60], [5, 1, 64]]);
});

test('capture boundaries neither create negative starts nor extend beyond tick 64', () => {
  assert.deepEqual(rows(quantizeSegments([ticks(62.6, 63.4, 120)], 120)), [[63, 1, 60]]);
  assert.deepEqual(quantizeSegments([ticks(63.6, 64.2, 120)], 120), []);
  assert.deepEqual(quantizeSegments([ticks(64.6, 65.4, 120)], 120), []);
  assert.deepEqual(rows(quantizeSegments([ticks(-.4, .4, 120)], 120)), [[0, 1, 60]]);
  assert.deepEqual(rows(quantizeSegments([ticks(6.6, 7.4, 120)], 120, 8)), [[7, 1, 60]]);
  assert.deepEqual(quantizeSegments([ticks(7.6, 8.2, 120)], 120, 8), []);
});

test('positive-length notes retain existing rounding, collision clipping and provenance', () => {
  const source = [segment(0, .03, 59), segment(.03, .49, 60), segment(.50, 1, 62), segment(.99, 1.51, 64), segment(7.8, 9, 90)];
  source[1].completedRanges = [{ start: .2, end: .25 }];
  const result = quantizeSegments(source, 120);
  assert.deepEqual(rows(result), [[0, 4, 60], [4, 4, 62], [8, 4, 64], [62, 2, 90]]);
  assert.deepEqual(result[0].completedRanges, source[1].completedRanges);
  assert.deepEqual(result.map(n => n.id), ['capture-0', 'capture-1', 'capture-2', 'capture-3']);
});

test('diagnostics identify only short intervals actually retained', () => {
  const diagnostics=[];
  const source=[segment(3.8186667,3.9253333,55),segment(4.001,4.01,56)];
  const notes=quantizeSegments(source,120,64,diagnostics);
  assert.equal(diagnostics.length,1);
  assert.equal(diagnostics[0].start,source[0].start);
  assert.equal(diagnostics[0].startTick,31);
  assert.equal(diagnostics[0].durationTick,1);
  assert.equal(diagnostics[0].reason,'retain-short-note');
  assert.equal(notes.length,1);
});
