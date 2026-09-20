import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRun, startRun, rollRun, recordResult, nextMatch, extendRun, resolveColors, normalizeOptions } from '../jintori/run.js';

const game = (options = {}) => rollRun(startRun(createRun(options), [null, null]), 1);
function result(run, outcome) {
  return recordResult({ ...run, match: { ...run.match, phase: 'result', outcome } });
}
test('first die fixes the first side; next rounds alternate independently of the final side', () => {
  const run = game({ opponent: 'human', size: 6, rounds: 3 });
  assert.equal(run.match.firstSide, 1);
  assert.deepEqual(run.colorsBySide, { 1: 10, 2: 11 });
  assert.equal(game({ size: 8 }).match.size, 8);
  const even = rollRun(startRun(createRun(), [6, null]), 2);
  assert.equal(even.match.firstSide, 2);
  assert.equal(even.colorsBySide[1], 6);
  assert.notEqual(even.colorsBySide[2], 6);
  const done = result({ ...run, match: { ...run.match, sideToMove: 2 } }, 0);
  const next = nextMatch(done);
  assert.equal(next.match.firstSide, 2);
  assert.equal(next.match.size, 6);
  assert.throws(() => rollRun(run, 2));
});
test('series counts draws and all planned rounds, then optional sudden death', () => {
  let run = game({ rounds: 3 });
  run = nextMatch(result(run, 1));
  run = nextMatch(result(run, 2));
  run = result(run, 0);
  assert.equal(run.phase, 'seriesResult');
  assert.equal(run.series.completedMatches, 3);
  assert.deepEqual(run.series.winsBySide, { 1: 1, 2: 1 });
  assert.equal(run.series.outcome, 0);
  assert.deepEqual(recordResult(run), run, 'result cannot be counted twice');
  assert.throws(() => nextMatch(run));
  run = extendRun(run);
  assert.equal(run.match.firstSide, 2);
  run = result(run, 0);
  assert.equal(run.phase, 'result');
  run = nextMatch(run);
  assert.equal(run.match.firstSide, 1);
  run = result(run, 2);
  assert.equal(run.phase, 'seriesResult');
  assert.equal(run.series.outcome, 2);
  assert.throws(() => extendRun(run));
});
test('challenge progresses only on wins, preserves draws, resets a loss, preserves inventory', () => {
  let run = game({ structure: 'streak', supplyPolicy: 'carry', size: 8 });
  assert.equal(run.match.size, 4);
  assert.deepEqual(run.inventoryBySide[1], { enhanced: 3, strongest: 1 });
  run = nextMatch(result(run, 1));
  assert.equal(run.match.size, 6); assert.equal(run.currentStreak, 1);
  run.match.inventoryBySide[1].enhanced = 2;
  run = nextMatch(result(run, 0));
  assert.equal(run.currentStreak, 1); assert.equal(run.match.size, 6);
  assert.equal(run.inventoryBySide[1].enhanced, 2);
  run = nextMatch(result(run, 1));
  assert.equal(run.currentStreak, 2); assert.equal(run.match.size, 8);
  run = nextMatch(result(run, 2));
  assert.equal(run.currentStreak, 0); assert.equal(run.bestStreak, 2);
  assert.equal(run.match.size, 8);
});
test('refill restores the agreed quantities; carry also survives sudden-death extension', () => {
  for (const supplyPolicy of ['refill', 'carry']) {
    let run = game({ supplyPolicy, size: 6, rounds: 1 });
    run.match.inventoryBySide[1] = { enhanced: 0, strongest: 0 };
    run = extendRun(result(run, 0));
    assert.deepEqual(run.inventoryBySide[1], supplyPolicy === 'refill' ? { enhanced: 1, strongest: 1 } : { enhanced: 0, strongest: 0 });
  }
});
test('colors preserve the explicit side, exclude duplicates, and human mode has no challenge', () => {
  assert.deepEqual(resolveColors([null, null]), { 1: 10, 2: 11 });
  assert.deepEqual(resolveColors([11, null]), { 1: 11, 2: 10 });
  assert.deepEqual(resolveColors([null, 10]), { 1: 11, 2: 10 });
  assert.deepEqual(resolveColors([6, 0]), { 1: 6, 2: 0 });
  assert.throws(() => resolveColors([6, 6]));
  assert.throws(() => resolveColors([20, null]));
  assert.equal(normalizeOptions({ opponent: 'human', structure: 'streak' }).structure, 'series');
  assert.equal(normalizeOptions({ opponent: 'human' }).difficultyId, 'none');
});

test('a new human challenge is rejected instead of silently changing its rules', () => {
  assert.throws(() => createRun({opponent:'human',structure:'streak'}), /INVALID_MODE/);
});
