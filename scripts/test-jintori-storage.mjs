import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SlotStore, slotKey, validateRecord } from '../jintori/storage.js';
import { createRun, startRun, rollRun } from '../jintori/run.js';
const run = opts => rollRun(startRun(createRun(opts), [6, 0]), 1);
function fixture() {
  const values = new Map(), held = new Set();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const locks = { async request(name, options, callback) {
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name }); } finally { held.delete(name); }
  } };
  return { storage, locks, values };
}
test('same mode has latest one save regardless of size/rounds; difficulty and policy are separate', () => {
  assert.equal(slotKey({ size: 4, rounds: 1 }), slotKey({ size: 8, rounds: 5 }));
  assert.notEqual(slotKey({ difficultyId: 'easy' }), slotKey({ difficultyId: 'hard' }));
  assert.notEqual(slotKey({ supplyPolicy: 'carry' }), slotKey({ supplyPolicy: 'refill' }));
});
test('save atomically preserves state and best; finish retains best and rejects late saves', async () => {
  const f = fixture(), store = new SlotStore(f);
  const { lease } = await store.begin({ structure: 'streak' });
  const game = run({ structure: 'streak' }); game.bestStreak = 3;
  const saved = store.save(game, lease);
  assert.equal(saved.bestStreak, 3);
  assert.deepEqual(store.load(game.mode).record.active.colorsBySide, { 1: 6, 2: 0 });
  await store.finish(lease);
  assert.equal(store.load(game.mode).record.active, null);
  assert.equal(store.load(game.mode).record.bestStreak, 3);
  assert.throws(() => store.save(game, lease), /STALE_ACTION/);
  store.close();
});
test('exclusive active-slot lease rejects another tab; revision also catches outside writers', async () => {
  const f = fixture(), a = new SlotStore(f), b = new SlotStore(f);
  const { lease } = await a.begin({});
  await assert.rejects(b.begin({}), /SAVE_CONFLICT/);
  a.save(run({}), lease);
  const key = slotKey({}); const changed = JSON.parse(f.storage.getItem(key));
  changed.revision++; f.storage.setItem(key, JSON.stringify(changed));
  assert.throws(() => a.save(run({}), lease), /SAVE_CONFLICT/);
  a.close(); b.close();
});
test('corrupt run is refused but valid best can be recovered; write failure does not pretend success', async () => {
  const f = fixture(), store = new SlotStore(f);
  const { lease } = await store.begin({});
  const saved = store.save(run({}), lease);
  for (const mutate of [r => r.active.match.cells.pop(), r => r.active.inventoryBySide[1].enhanced = -1,
    r => r.active.colorsBySide[2] = 6, r => r.active.series.completedMatches = 10,
    r => r.active.rulesVersion = 99, r => r.active.match.sideToMove = 9]) {
    const broken = structuredClone(saved); mutate(broken);
    assert.equal(validateRecord(broken, {}).valid, false);
  }
  f.storage.setItem(slotKey({}), JSON.stringify({ ...saved, bestStreak: 7, active: { bad: true } }));
  const loaded = store.load({});
  assert.equal(loaded.error, 'SAVE_INVALID'); assert.equal(loaded.record.bestStreak, 7);
  await store.close();
  const good = new SlotStore(f); const goodSession = await good.begin({});
  f.storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => good.finish(goodSession.lease), /SAVE_FAILED/);
  assert.equal(good.finished, false);
  good.close();
});

test('old session cannot overwrite or finish a replacement run, even in the same slot', async () => {
  const f = fixture(), store = new SlotStore(f);
  const a = await store.begin({});
  const old = run({}); store.save(old, a.lease);
  const b = await store.begin({});
  const fresh = run({}); store.save(fresh, b.lease);
  assert.throws(() => store.save(old, a.lease), /STALE_ACTION/);
  assert.throws(() => store.finish(a.lease), /STALE_ACTION/);
  assert.equal(store.load({}).record.active.runId, fresh.runId);
  await store.finish(b.lease);
  const other = new SlotStore(f);
  await other.begin({});
  await other.close();
});

test('rejects contradictory series progress and dice parity', async () => {
  const f = fixture(), store = new SlotStore(f);
  const session = await store.begin({ rounds: 3 });
  const saved = store.save(run({ rounds: 3 }), session.lease);
  for (const mutate of [
    r => r.active.match.firstSide = 2,
    r => { r.active.series.completedMatches = 1; r.active.series.winsBySide[1] = 1; r.active.series.outcome = 1; r.active.phase = 'seriesResult'; r.active.match.phase = 'result'; r.active.match.outcome = 1; r.active.match.resultApplied = true; },
    r => { r.active.phase = 'setup'; r.active.match = null; r.active.initialDice = null; r.active.colorsBySide = null; r.active.series.completedMatches = 1; r.active.series.draws = 1; },
  ]) {
    const broken = structuredClone(saved); mutate(broken);
    assert.equal(validateRecord(broken, {}).valid, false);
  }
  await store.close();
});


test('every reachable move, round boundary and extension remains resumable', async () => {
  const { playMove, nextMatch, extendRun } = await import('../jintori/run.js');
  const { chooseMove } = await import('../jintori/cpu.js');
  for (const structure of ['series', 'streak']) for (const size of [4,6,8]) for (const supplyPolicy of ['refill','carry']) {
    const f=fixture(),store=new SlotStore(f), options={structure,size,supplyPolicy,rounds:3};
    const {lease}=await store.begin(options);let game=run(options), moves=0;
    for(let round=0;round<5;round++) {
      store.save(game,lease);
      while(game.phase==='playing') {
        const move=chooseMove(game.match,'normal');
        game=playMove(game,move.cell,move.item,move.directionId);
        store.save(game,lease); moves++;
      }
      const restored=store.load(options);assert.equal(restored.error,null);assert.deepEqual(restored.record.active,game);
      if(game.phase==='seriesResult') {
        if(game.series.outcome===0)game=extendRun(game);else break;
      } else game=nextMatch(game);
    }
    assert.ok(moves>0);await store.finish(lease);
  }
});

test('finishing after a failed peak save preserves the latest best streak atomically', async () => {
  const f=fixture(),store=new SlotStore(f),options={structure:'streak'};
  const {lease}=await store.begin(options);const game=run(options);game.bestStreak=2;store.save(game,lease);
  const setItem=f.storage.setItem;f.storage.setItem=()=>{throw Error('quota')};
  const latest={...game,bestStreak:3};assert.throws(()=>store.save(latest,lease),/SAVE_FAILED/);
  f.storage.setItem=setItem;await store.finish(lease,latest);
  const saved=store.load(options).record;assert.equal(saved.active,null);assert.equal(saved.bestStreak,3);
});
