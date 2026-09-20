import { normalizeOptions, RULES_VERSION } from './run.js';
import { countCells, listLegalMoves } from './rules.js';

export const PREFIX = 'koekit.jintori.v1.';
export function slotKey(options) {
  const m = normalizeOptions(options);
  return PREFIX + [m.opponent, m.structure, m.supplyPolicy, m.difficultyId].join('.');
}
const integer = x => Number.isSafeInteger(x) && x >= 0;
const side = x => x === 1 || x === 2;
const outcome = x => x === null || x === 0 || side(x);
const inventory = x => x && [1, 2].every(s => x[s] && integer(x[s].enhanced) && integer(x[s].strongest));
const sameInventory = (a, b) => [1, 2].every(s => ['enhanced', 'strongest'].every(k => a[s][k] === b[s][k]));
const sameMode = (a, b) => ['opponent', 'structure', 'supplyPolicy', 'difficultyId', 'size', 'rounds'].every(k => a[k] === b[k]);
function validRun(r, options) {
  if (!r || r.rulesVersion !== RULES_VERSION || typeof r.runId !== 'string' || !r.runId || !r.mode ||
      !sameMode(r.mode, normalizeOptions(r.mode)) || slotKey(r.mode) !== slotKey(options) ||
      !['setup', 'dice', 'playing', 'result', 'seriesResult'].includes(r.phase) ||
      !integer(r.completedMatches) || !integer(r.currentStreak) || !integer(r.bestStreak) || r.currentStreak > r.bestStreak || !inventory(r.inventoryBySide)) return false;
  const supplies = r.configSnapshot?.supplies;
  if (!supplies || !['refill', 'carry'].every(k => supplies[k] && integer(supplies[k].enhanced) && integer(supplies[k].strongest))) return false;
  if (![1, 2].every(s => ['enhanced', 'strongest'].every(k => r.inventoryBySide[s][k] <= supplies[r.mode.supplyPolicy][k]))) return false;
  if (r.mode.structure === 'series') {
    const s = r.series;
    if (!s || s.plannedMatches !== r.mode.rounds || s.fixedSize !== r.mode.size ||
      !integer(s.completedMatches) || !integer(s.draws) || !s.winsBySide || ![1, 2].every(k => integer(s.winsBySide[k])) ||
      s.completedMatches !== s.draws + s.winsBySide[1] + s.winsBySide[2] || typeof s.extensionActive !== 'boolean' || !outcome(s.outcome) ||
      (!s.extensionActive && s.completedMatches > s.plannedMatches) || (s.extensionActive && s.completedMatches < s.plannedMatches) ||
      (r.phase === 'seriesResult') !== (s.outcome !== null)) return false;
    if (s.completedMatches !== r.completedMatches || r.currentStreak !== 0) return false;
    const winner = s.winsBySide[1] === s.winsBySide[2] ? 0 : s.winsBySide[1] > s.winsBySide[2] ? 1 : 2;
    if (s.outcome !== null && (s.completedMatches < s.plannedMatches || s.outcome !== winner)) return false;
    if (!s.extensionActive && s.completedMatches === s.plannedMatches && r.phase !== 'seriesResult') return false;
    if (s.extensionActive && (s.outcome === 0 || (s.outcome === null && winner !== 0))) return false;
  } else if (r.series !== null || r.phase === 'seriesResult') return false;
  if (['setup', 'dice'].includes(r.phase) && (r.completedMatches !== 0 || r.currentStreak !== 0 || r.series?.extensionActive)) return false;
  if (r.phase === 'setup') return r.match === null && r.initialDice === null && r.colorsBySide === null;
  if (!r.colorsBySide || ![1, 2].every(s => integer(r.colorsBySide[s]) && r.colorsBySide[s] < 12) || r.colorsBySide[1] === r.colorsBySide[2]) return false;
  if (r.phase === 'dice') return r.match === null && r.initialDice === null;
  const m = r.match;
  if (!m || !Number.isInteger(r.initialDice) || r.initialDice < 1 || r.initialDice > 6 ||
      ![4, 6, 8].includes(m.size) || (r.series && m.size !== r.series.fixedSize) || !Array.isArray(m.cells) ||
      m.cells.length !== m.size ** 2 || !m.cells.every(c => c === 0 || side(c)) || !side(m.sideToMove) || !side(m.firstSide) ||
      !integer(m.moveNumber) || typeof m.matchId !== 'string' || !m.matchId || !inventory(m.inventoryBySide) ||
      !sameInventory(r.inventoryBySide, m.inventoryBySide) || !outcome(m.outcome) || typeof m.resultApplied !== 'boolean') return false;
  const counts = countCells(m);
  const previousMatches = r.completedMatches - (m.resultApplied ? 1 : 0);
  const initialSide = r.initialDice % 2 ? 1 : 2;
  if (previousMatches < 0 || m.firstSide !== (previousMatches % 2 ? 3 - initialSide : initialSide) ||
      m.moveNumber !== m.size ** 2 - counts.empty - 4) return false;
  if (r.phase === 'playing') return m.phase === 'playing' && m.outcome === null && !m.resultApplied && listLegalMoves(m).length > 0;
  const winner = counts[1] === counts[2] ? 0 : counts[1] > counts[2] ? 1 : 2;
  return m.phase === 'result' && m.outcome === winner && m.resultApplied &&
    [1, 2].every(sideToMove => listLegalMoves({ ...m, phase: 'playing', sideToMove }).length === 0);
}
export function validateRecord(record, options) {
  const valid = Boolean(record && record.schemaVersion === 1 && integer(record.revision) && integer(record.bestStreak) &&
    typeof record.updatedAt === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(record.updatedAt) && Number.isFinite(Date.parse(record.updatedAt)) &&
    (record.active === null || validRun(record.active, options)));
  return { valid };
}
function emptyRecord(bestStreak = 0, revision = 0) {
  return { schemaVersion: 1, revision, bestStreak, active: null, updatedAt: new Date().toISOString() };
}
function error(code) { return Object.assign(new Error(code), { code }); }

// A Web Lock is held for the active slot, not merely a non-atomic revision check.
// In environments without locking/storage, controllers may still run in memory.
export class SlotStore {
  constructor({ storage, locks, onConflict = () => {}, eventTarget = globalThis.window } = {}) {
    try { this.storage = storage ?? globalThis.localStorage; } catch { this.storage = null; }
    this.locks = locks ?? globalThis.navigator?.locks;
    this.onConflict = onConflict;
    this.eventTarget = eventTarget;
    this.generation = 0;
    this.finished = false;
    this.held = false;
    this.onStorage = event => {
      if (this.held && (event.key === this.key || event.key === null)) {
        this.close();
        this.onConflict();
      }
    };
    eventTarget?.addEventListener('storage', this.onStorage);
  }
  load(options) {
    let raw;
    try {
      if (!this.storage) throw error('SAVE_FAILED');
      raw = this.storage.getItem(slotKey(options));
    } catch { return { record: emptyRecord(), error: 'SAVE_FAILED', raw: null }; }
    if (raw === null) return { record: emptyRecord(), error: null, raw };
    try {
      const record = JSON.parse(raw);
      if (validateRecord(record, options).valid) return { record, error: null, raw };
      return { record: emptyRecord(integer(record?.bestStreak) ? record.bestStreak : 0, integer(record?.revision) ? record.revision : 0), error: 'SAVE_INVALID', raw };
    } catch { return { record: emptyRecord(), error: 'SAVE_INVALID', raw }; }
  }
  async begin(options) {
    const closing = this.close();
    const generation = this.generation;
    await closing;
    if (generation !== this.generation) throw error('STALE_ACTION');
    this.options = normalizeOptions(options);
    this.key = slotKey(options);
    this.finished = false;
    if (!this.locks || !this.storage) throw error('SAVE_UNAVAILABLE');
    return new Promise((resolve, reject) => {
      this.lockTask = this.locks.request(this.key, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) { reject(error('SAVE_CONFLICT')); return; }
        if (generation !== this.generation) { reject(error('STALE_ACTION')); return; }
        this.held = true;
        this.lease = Symbol('active slot');
        const loaded = this.load(options);
        this.record = loaded.record; this.baseRaw = loaded.raw;
        await new Promise(release => {
          this.release = release;
          resolve({ ...loaded, lease: this.lease });
        });
      }).catch(reject);
    });
  }
  write(active, lease, latestRun = active) {
    if (!this.held || this.finished || !lease || lease !== this.lease) throw error('STALE_ACTION');
    if (latestRun !== null && !validRun(latestRun, this.options)) throw error('SAVE_INVALID');
    let current;
    try { current = this.storage.getItem(this.key); } catch { throw error('SAVE_FAILED'); }
    if (current !== this.baseRaw) { this.close(); throw error('SAVE_CONFLICT'); }
    const next = {
      schemaVersion: 1, revision: this.record.revision + 1,
      bestStreak: Math.max(this.record.bestStreak, latestRun?.mode.structure === 'streak' ? latestRun.bestStreak : 0),
      active: active === null ? null : structuredClone(active), updatedAt: new Date().toISOString(),
    };
    if (!validateRecord(next, this.options).valid) throw error('SAVE_INVALID');
    const raw = JSON.stringify(next);
    try { this.storage.setItem(this.key, raw); } catch { throw error('SAVE_FAILED'); }
    this.record = next; this.baseRaw = raw;
    return next;
  }
  save(run, lease) { return this.write(run, lease); }
  finish(lease, latestRun = null) {
    const next = this.write(null, lease, latestRun);
    this.finished = true;
    return Promise.resolve(this.close()).then(() => next);
  }
  close() {
    this.generation++;
    this.held = false;
    this.lease = null;
    this.release?.();
    this.release = null;
    return this.lockTask;
  }
  dispose() {
    this.close();
    this.eventTarget?.removeEventListener('storage', this.onStorage);
  }
}
