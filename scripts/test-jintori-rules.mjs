import assert from 'node:assert/strict';

import {
  analyzeMove,
  applyMove,
  countCells,
  createMatch,
  listLegalMoves,
  resolveTurn,
} from '../jintori/rules.js';
import { CONFIG } from '../jintori/config.js';

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function stateFromRows(rows, sideToMove = 1, inventory = { enhanced: 1, strongest: 1 }) {
  const size = rows.length;
  return {
    size,
    cells: rows.flat(),
    sideToMove,
    inventoryBySide: {
      1: { ...inventory },
      2: { enhanced: 1, strongest: 1 },
    },
    phase: 'playing',
    outcome: null,
  };
}

function emptyRows(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => error instanceof Error && error.code === code);
}

test('createMatch creates the agreed diagonal center setup', () => {
  const state = createMatch(6, 2);

  assert.equal(state.size, 6);
  assert.equal(state.sideToMove, 2);
  assert.equal(state.phase, 'playing');
  assert.equal(state.outcome, null);
  assert.deepEqual(countCells(state), { empty: 32, 1: 2, 2: 2 });
  assert.equal(state.cells[14], 1);
  assert.equal(state.cells[15], 2);
  assert.equal(state.cells[20], 2);
  assert.equal(state.cells[21], 1);
});

test('CONFIG exposes the agreed sizes and per-side supply presets', () => {
  assert.deepEqual(CONFIG.sizes, [4, 6, 8]);
  assert.deepEqual(CONFIG.specialItemSizes, [6, 8]);
  assert.deepEqual(CONFIG.supplies.refill, { enhanced: 1, strongest: 1 });
  assert.deepEqual(CONFIG.supplies.carry, { enhanced: 3, strongest: 1 });
});

test('basic analysis captures all eight directions from the placement snapshot', () => {
  const rows = emptyRows(8);
  const center = 3 * 8 + 3;
  for (const [dr, dc] of [
    [-1, 0], [-1, 1], [0, 1], [1, 1],
    [1, 0], [1, -1], [0, -1], [-1, -1],
  ]) {
    rows[3 + dr][3 + dc] = 2;
    rows[3 + 2 * dr][3 + 2 * dc] = 1;
  }

  const analysis = analyzeMove(stateFromRows(rows), center);

  assert.equal(analysis.legal, true);
  assert.equal(analysis.reason, null);
  assert.deepEqual(analysis.normal, [18, 19, 20, 26, 28, 34, 35, 36]);
  assert.deepEqual(analysis.extra, []);
  assert.deepEqual(analysis.directions, []);
  assert.equal(analysis.needsDirection, false);
});

test('corner capture stops at board edges and non-capturing cells are illegal', () => {
  const rows = emptyRows(8);
  rows[0][1] = 2;
  rows[0][2] = 1;
  rows[1][0] = 2;
  rows[2][0] = 1;
  rows[1][1] = 2;
  rows[2][2] = 1;
  const state = stateFromRows(rows);

  assert.deepEqual(analyzeMove(state, 0).normal, [1, 8, 9]);
  assert.deepEqual(analyzeMove(state, 63), {
    legal: false,
    reason: 'NO_CAPTURE',
    normal: [],
    extra: [],
    directions: [],
    needsDirection: false,
  });
  assert.equal(analyzeMove(state, 1).reason, 'CELL_OCCUPIED');
  assert.equal(analyzeMove(state, -1).reason, 'INVALID_CELL');
});

test('enhanced adds only orthogonally adjacent enemies and remains normally legal', () => {
  const rows = emptyRows(6);
  rows[2][3] = 2;
  rows[2][4] = 1;
  rows[1][2] = 2;
  rows[2][1] = 2;
  rows[3][2] = 2;
  rows[1][1] = 2;
  rows[1][3] = 2;
  const state = stateFromRows(rows);

  const analysis = analyzeMove(state, 14, 'enhanced');

  assert.equal(analysis.legal, true);
  assert.deepEqual(analysis.normal, [15]);
  assert.deepEqual(analysis.extra, [8, 13, 20]);
});

test('special items reject 4x4 boards and exhausted inventory', () => {
  const four = createMatch(4);
  assert.equal(analyzeMove(four, 2, 'enhanced').reason, 'ITEM_UNAVAILABLE');
  assertCode(() => applyMove(four, 2, 'enhanced'), 'ITEM_UNAVAILABLE');

  const six = createMatch(6, 1, {
    1: { enhanced: 0, strongest: 0 },
    2: { enhanced: 1, strongest: 1 },
  });
  assert.equal(analyzeMove(six, 9, 'strongest').reason, 'NO_ITEM');
  assertCode(() => applyMove(six, 9, 'strongest'), 'NO_ITEM');
  assertCode(() => createMatch(6, 1, {
    1: { enhanced: -1, strongest: 1 },
    2: { enhanced: 1, strongest: 1 },
  }), 'INVALID_INVENTORY');
});

test('strongest fixed example 1 crosses own cells and flips an enclosed later run', () => {
  const rows = emptyRows(8);
  rows[0] = [1, 2, 1, 1, 2, 2, 2, 0];

  const analysis = analyzeMove(stateFromRows(rows), 7, 'strongest');

  assert.deepEqual(analysis.normal, [4, 5, 6]);
  assert.deepEqual(analysis.extra, [1]);
  assert.deepEqual(analysis.directions, [
    { id: 'W', normal: [4, 5, 6], extra: [1], total: 4 },
  ]);
  assert.equal(analysis.needsDirection, false);
});

test('strongest fixed example 2 is legal and consumes with no added benefit', () => {
  const rows = emptyRows(8);
  rows[0] = [1, 2, 2, 2, 2, 2, 2, 0];
  const state = stateFromRows(rows);

  const analysis = analyzeMove(state, 7, 'strongest');
  const next = applyMove(state, 7, 'strongest');

  assert.deepEqual(analysis.normal, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(analysis.extra, []);
  assert.deepEqual(next.cells.slice(0, 8), [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(next.inventoryBySide[1].strongest, 0);
});

test('strongest fixed example 3 does not flip enemies left open at the edge', () => {
  const rows = emptyRows(8);
  rows[0] = [2, 2, 1, 1, 2, 2, 2, 0];

  const analysis = analyzeMove(stateFromRows(rows), 7, 'strongest');

  assert.deepEqual(analysis.normal, [4, 5, 6]);
  assert.deepEqual(analysis.extra, []);
});

test('strongest never crosses a blank cell', () => {
  const rows = emptyRows(8);
  rows[0] = [1, 2, 0, 1, 2, 2, 2, 0];

  const analysis = analyzeMove(stateFromRows(rows), 7, 'strongest');

  assert.deepEqual(analysis.normal, [4, 5, 6]);
  assert.deepEqual(analysis.extra, []);
});

test('strongest selects total 6 over total 5 even when the latter has more extras', () => {
  const rows = emptyRows(8);
  rows[0] = [0, 2, 2, 2, 2, 2, 2, 1];
  rows[1][0] = 2;
  rows[2][0] = 2;
  rows[3][0] = 1;
  rows[4][0] = 2;
  rows[5][0] = 2;
  rows[6][0] = 2;
  rows[7][0] = 1;

  const analysis = analyzeMove(stateFromRows(rows), 0, 'strongest');

  assert.deepEqual(analysis.directions, [
    { id: 'E', normal: [1, 2, 3, 4, 5, 6], extra: [], total: 6 },
  ]);
  assert.deepEqual(analysis.extra, []);
});

test('strongest tied maxima require an explicit applicable direction', () => {
  const rows = emptyRows(8);
  rows[0] = [0, 2, 1, 2, 2, 1, 0, 0];
  rows[1][0] = 2;
  rows[2][0] = 2;
  rows[3][0] = 1;
  rows[4][0] = 2;
  rows[5][0] = 1;
  const state = stateFromRows(rows);

  const analysis = analyzeMove(state, 0, 'strongest');

  assert.equal(analysis.needsDirection, true);
  assert.deepEqual(analysis.extra, []);
  assert.deepEqual(analysis.directions, [
    { id: 'E', normal: [1], extra: [3, 4], total: 3 },
    { id: 'S', normal: [8, 16], extra: [32], total: 3 },
  ]);
  assertCode(() => applyMove(state, 0, 'strongest'), 'DIRECTION_REQUIRED');
  const next = applyMove(state, 0, 'strongest', 'E');
  assert.equal(next.cells[3], 1);
  assert.equal(next.cells[4], 1);
  assert.equal(next.cells[32], 2);
});

test('strongest tied maxima require a direction even when every extra set is empty', () => {
  const rows = emptyRows(6);
  rows[0][1] = 2;
  rows[0][2] = 1;
  rows[1][0] = 2;
  rows[2][0] = 1;
  const state = stateFromRows(rows);

  const analysis = analyzeMove(state, 0, 'strongest');

  assert.equal(analysis.needsDirection, true);
  assert.deepEqual(analysis.directions.map(({ id }) => id), ['E', 'S']);
  assertCode(() => applyMove(state, 0, 'strongest'), 'DIRECTION_REQUIRED');
  assert.doesNotThrow(() => applyMove(state, 0, 'strongest', 'E'));
});

test('applyMove exposes stable error codes for invalid public input', () => {
  const state = createMatch(6);
  assertCode(() => applyMove(state, 9, 'unknown'), 'INVALID_ITEM');
  assertCode(() => applyMove(state, 14), 'CELL_OCCUPIED');
  assertCode(() => applyMove(state, 0), 'NO_CAPTURE');
  assertCode(() => applyMove({ ...state, phase: 'result', outcome: 1 }, 9), 'MATCH_OVER');
});

test('analysis and application are pure and application preserves match metadata', () => {
  const state = { ...createMatch(6), matchId: 'm-1', custom: { round: 3 } };
  const before = structuredClone(state);

  analyzeMove(state, 9);
  const next = applyMove(state, 9);

  assert.deepEqual(state, before);
  assert.notEqual(next, state);
  assert.notEqual(next.cells, state.cells);
  assert.notEqual(next.inventoryBySide, state.inventoryBySide);
  assert.equal(next.matchId, 'm-1');
  assert.deepEqual(next.custom, { round: 3 });
});

test('listLegalMoves returns flat indexes for the side to move', () => {
  assert.deepEqual(listLegalMoves(createMatch(4)), [2, 7, 8, 13]);
});

test('resolveTurn automatically passes and reports the passed side', () => {
  const state = stateFromRows([
    [0, 2, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ], 2);

  const resolved = resolveTurn(state);

  assert.equal(resolved.phase, 'playing');
  assert.equal(resolved.sideToMove, 1);
  assert.deepEqual(resolved.turnInfo, { passedSides: [2], terminal: false });
});

test('resolveTurn ends with blanks remaining when neither side has a move', () => {
  const state = stateFromRows([
    [0, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ], 2);

  const resolved = resolveTurn(state);

  assert.equal(resolved.phase, 'result');
  assert.equal(resolved.outcome, 1);
  assert.deepEqual(resolved.turnInfo, { passedSides: [2, 1], terminal: true });
});

test('resolveTurn ends a full tied board with outcome 0', () => {
  const state = stateFromRows([
    [1, 2, 1, 2],
    [2, 1, 2, 1],
    [1, 2, 1, 2],
    [2, 1, 2, 1],
  ]);

  const resolved = resolveTurn(state);

  assert.equal(resolved.phase, 'result');
  assert.equal(resolved.outcome, 0);
  assert.deepEqual(resolved.turnInfo, { passedSides: [], terminal: true });
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

if (process.exitCode) {
  console.error(`${passed}/${tests.length} tests passed`);
} else {
  console.log(`${passed}/${tests.length} tests passed`);
}
