import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { CPU_SETTINGS } from '../jintori/config.js';
import { chooseMove } from '../jintori/cpu.js';
import {
  analyzeMove,
  applyMove,
  createMatch,
  listLegalMoves,
} from '../jintori/rules.js';

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function sequenceRandom(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function boardState(rows, sideToMove = 1, inventories = null) {
  return {
    size: rows.length,
    cells: rows.flat(),
    sideToMove,
    inventoryBySide: inventories ?? {
      1: { enhanced: 1, strongest: 1 },
      2: { enhanced: 1, strongest: 1 },
    },
    phase: 'playing',
    outcome: null,
  };
}

function assertLegalChoice(state, move) {
  assert.ok(move);
  const analysis = analyzeMove(state, move.cell, move.item);
  assert.equal(analysis.legal, true);
  if (analysis.needsDirection) {
    assert.ok(analysis.directions.some(({ id }) => id === move.directionId));
  }
  assert.doesNotThrow(() => applyMove(state, move.cell, move.item, move.directionId));
}

test('CPU settings expose three difficulties and cap every budget at 300ms', () => {
  assert.deepEqual(CPU_SETTINGS.difficulties, ['easy', 'normal', 'hard']);
  for (const difficulty of CPU_SETTINGS.difficulties) {
    assert.ok(CPU_SETTINGS.budgetMs[difficulty] > 0);
    assert.ok(CPU_SETTINGS.budgetMs[difficulty] <= 300);
  }
  assert.ok(CPU_SETTINGS.hard.maxDepth >= 2);
});

test('easy independently chooses a position and can spend strongest for zero extra benefit', () => {
  const state = createMatch(6);
  const move = chooseMove(state, 'easy', {
    random: sequenceRandom([0, 0.99]),
  });

  assert.equal(move.cell, listLegalMoves(state)[0]);
  assert.equal(move.item, 'strongest');
  assert.equal(analyzeMove(state, move.cell, move.item).extra.length, 0);
  const next = applyMove(state, move.cell, move.item, move.directionId);
  assert.equal(next.inventoryBySide[1].strongest, 0);
});

test('easy never invents inventory and never uses special items on 4x4', () => {
  const random = sequenceRandom([0, 0.99]);
  const four = createMatch(4, 1, {
    1: { enhanced: 9, strongest: 9 },
    2: { enhanced: 9, strongest: 9 },
  });
  assert.equal(chooseMove(four, 'easy', { random }).item, 'basic');

  const six = createMatch(6, 2, {
    1: { enhanced: 3, strongest: 1 },
    2: { enhanced: 0, strongest: 0 },
  });
  assert.equal(chooseMove(six, 'easy', {
    random: sequenceRandom([0, 0.99]),
  }).item, 'basic');
});

test('easy selects among tied strongest directions with the injected random source', () => {
  const rows = Array.from({ length: 6 }, () => Array(6).fill(1));
  rows[0][0] = 0;
  rows[0][1] = 2;
  rows[1][0] = 2;
  const state = boardState(rows);

  const move = chooseMove(state, 'easy', {
    random: sequenceRandom([0, 0.99, 0.99]),
  });

  assert.equal(move.cell, 0);
  assert.equal(move.item, 'strongest');
  assert.equal(move.directionId, 'S');
  assertLegalChoice(state, move);
});

test('normal prefers a legal corner over a non-corner with the same capture count', () => {
  const rows = Array.from({ length: 6 }, () => Array(6).fill(0));
  rows[0][1] = 2;
  rows[0][2] = 1;
  rows[1][3] = 2;
  rows[1][4] = 1;
  const state = boardState(rows, 1, {
    1: { enhanced: 0, strongest: 0 },
    2: { enhanced: 0, strongest: 0 },
  });
  assert.ok(listLegalMoves(state).includes(0));
  assert.ok(listLegalMoves(state).some((cell) => cell !== 0));

  const move = chooseMove(state, 'normal', { random: () => 0.5 });

  assert.equal(move.cell, 0);
  assertLegalChoice(state, move);
});

test('normal values a special item when its added flips improve the move', () => {
  const rows = Array.from({ length: 6 }, () => Array(6).fill(0));
  rows[2][3] = 2;
  rows[2][4] = 1;
  rows[1][2] = 2;
  rows[2][1] = 2;
  rows[3][2] = 2;
  const state = boardState(rows, 1, {
    1: { enhanced: 1, strongest: 0 },
    2: { enhanced: 0, strongest: 0 },
  });

  const move = chooseMove(state, 'normal', { random: () => 0 });

  assert.deepEqual(move, { cell: 14, item: 'enhanced', directionId: null });
  assert.equal(analyzeMove(state, move.cell, move.item).extra.length, 3);
  assertLegalChoice(state, move);
});

test('hard returns a legal fallback when its injected clock exhausts the budget', () => {
  let tick = 0;
  const state = createMatch(8);
  const move = chooseMove(state, 'hard', {
    budgetMs: 1,
    now: () => tick++,
    random: () => 0,
  });

  assertLegalChoice(state, move);
});

test('hard completes a legal 4x4 game while staying within practical time bounds', () => {
  let state = createMatch(4);
  let moves = 0;
  const started = performance.now();
  while (state.phase === 'playing') {
    const move = chooseMove(state, 'hard', { budgetMs: 8, random: () => 0 });
    assertLegalChoice(state, move);
    state = applyMove(state, move.cell, move.item, move.directionId);
    moves += 1;
    assert.ok(moves <= 12);
  }

  assert.ok(moves > 0);
  assert.ok(performance.now() - started < 1000);
  assert.ok([0, 1, 2].includes(state.outcome));
});

test('all difficulties finish legal 6x6 games with the shared rules and inventories', () => {
  for (const difficulty of CPU_SETTINGS.difficulties) {
    let state = createMatch(6);
    let moves = 0;
    while (state.phase === 'playing') {
      const move = chooseMove(state, difficulty, {
        budgetMs: 3,
        random: () => 0.99,
      });
      assertLegalChoice(state, move);
      state = applyMove(state, move.cell, move.item, move.directionId);
      moves += 1;
      assert.ok(moves <= 32);
    }
    assert.ok([0, 1, 2].includes(state.outcome));
  }
});

test('chooseMove returns null when the match has no move and rejects unknown difficulty', () => {
  assert.equal(chooseMove({ ...createMatch(4), phase: 'result', outcome: 1 }), null);
  assert.throws(
    () => chooseMove(createMatch(4), 'impossible'),
    (error) => error.code === 'INVALID_DIFFICULTY',
  );
});

test('module worker echoes tokens and returns a legal move', async () => {
  const posted = [];
  let listener;
  const previousSelf = globalThis.self;
  globalThis.self = {
    addEventListener(type, callback) {
      if (type === 'message') listener = callback;
    },
    postMessage(message) {
      posted.push(message);
    },
  };

  try {
    await import(`../jintori/cpu-worker.js?test=${Date.now()}`);
    assert.equal(typeof listener, 'function');
    const state = createMatch(4);
    listener({ data: { type: 'choose', token: 'turn-7', state, difficulty: 'easy' } });
    assert.equal(posted.length, 1);
    assert.equal(posted[0].token, 'turn-7');
    assertLegalChoice(state, posted[0].move);

    listener({ data: { type: 'choose', token: 'turn-8', state, difficulty: 'unknown' } });
    assert.equal(posted[1].token, 'turn-8');
    assert.equal(posted[1].error.code, 'INVALID_DIFFICULTY');
  } finally {
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
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

if (process.exitCode) console.error(`${passed}/${tests.length} tests passed`);
else console.log(`${passed}/${tests.length} tests passed`);
