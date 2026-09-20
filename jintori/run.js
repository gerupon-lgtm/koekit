import { CONFIG } from './config.js';
import { createMatch, applyMove } from './rules.js';

export const RULES_VERSION = 1;
const id = () => globalThis.crypto.randomUUID();
const copy = value => structuredClone(value);
function requireState(condition, code = 'INVALID_STATE') {
  if (!condition) throw Object.assign(new Error(code), { code });
}
export function normalizeOptions(options = {}) {
  const opponent = options.opponent === 'human' ? 'human' : 'cpu';
  return {
    opponent,
    structure: opponent === 'cpu' && options.structure === 'streak' ? 'streak' : 'series',
    supplyPolicy: options.supplyPolicy === 'carry' ? 'carry' : 'refill',
    difficultyId: opponent === 'human' ? 'none' : ['easy', 'normal', 'hard'].includes(options.difficultyId) ? options.difficultyId : 'easy',
    size: CONFIG.sizes.includes(Number(options.size)) ? Number(options.size) : 4,
    rounds: [1, 3, 5].includes(Number(options.rounds)) ? Number(options.rounds) : 1,
  };
}
export function resolveColors(selected = [null, null]) {
  let [one, two] = selected;
  for (const color of [one, two]) requireState(color == null || Number.isInteger(color) && color >= 0 && color < 12, 'INVALID_COLOR');
  requireState(one == null || two == null || one !== two, 'COLOR_CONFLICT');
  if (one == null) one = two === 10 ? 11 : 10;
  if (two == null) two = one === 11 ? 10 : 11;
  return { 1: one, 2: two };
}
export function createRun(options = {}) {
  requireState(!(options.opponent === 'human' && options.structure === 'streak'), 'INVALID_MODE');
  const mode = normalizeOptions(options);
  const supplies = copy(CONFIG.supplies);
  return {
    runId: id(), rulesVersion: RULES_VERSION, mode,
    configSnapshot: { supplies }, phase: 'setup', colorsBySide: null,
    initialDice: null, completedMatches: 0, currentStreak: 0, bestStreak: 0,
    inventoryBySide: { 1: { ...supplies[mode.supplyPolicy] }, 2: { ...supplies[mode.supplyPolicy] } },
    series: mode.structure === 'series' ? {
      plannedMatches: mode.rounds, fixedSize: mode.size, completedMatches: 0,
      winsBySide: { 1: 0, 2: 0 }, draws: 0, extensionActive: false, outcome: null,
    } : null,
    match: null,
  };
}
export function startRun(run, selected) {
  requireState(run.phase === 'setup');
  return { ...run, phase: 'dice', colorsBySide: resolveColors(selected) };
}
function beginMatch(run, size, firstSide) {
  const inventory = run.mode.supplyPolicy === 'refill'
    ? { 1: { ...run.configSnapshot.supplies.refill }, 2: { ...run.configSnapshot.supplies.refill } }
    : copy(run.inventoryBySide);
  const match = { ...createMatch(size, firstSide, inventory), firstSide, matchId: id(), resultApplied: false, moveNumber: 0 };
  return { ...run, phase: 'playing', inventoryBySide: copy(inventory), match };
}
export function rollRun(run, value) {
  requireState(run.phase === 'dice' && run.initialDice === null);
  requireState(Number.isInteger(value) && value >= 1 && value <= 6, 'INVALID_DICE');
  return beginMatch({ ...run, initialDice: value }, run.mode.structure === 'streak' ? 4 : run.mode.size, value % 2 ? 1 : 2);
}
export function playMove(run, cell, item = 'basic', directionId = null) {
  requireState(run.phase === 'playing');
  const match = applyMove(run.match, cell, item, directionId);
  const next = { ...run, match: { ...match, moveNumber: run.match.moveNumber + 1 }, inventoryBySide: copy(match.inventoryBySide) };
  return match.phase === 'result' ? recordResult(next) : next;
}
export function recordResult(run) {
  requireState(run.match?.phase === 'result');
  if (run.match.resultApplied) return run;
  const outcome = run.match.outcome;
  requireState([0, 1, 2].includes(outcome));
  const next = { ...run, completedMatches: run.completedMatches + 1, phase: 'result', inventoryBySide: copy(run.match.inventoryBySide), match: { ...run.match, resultApplied: true } };
  if (run.mode.structure === 'streak') {
    next.currentStreak = outcome === 1 ? run.currentStreak + 1 : outcome === 2 ? 0 : run.currentStreak;
    next.bestStreak = Math.max(run.bestStreak, next.currentStreak);
  } else {
    next.series = copy(run.series);
    next.series.completedMatches++;
    if (outcome === 0) next.series.draws++;
    else next.series.winsBySide[outcome]++;
    const done = next.series.extensionActive ? outcome !== 0 : next.series.completedMatches >= next.series.plannedMatches;
    if (done) {
      next.phase = 'seriesResult';
      const { 1: one, 2: two } = next.series.winsBySide;
      next.series.outcome = one === two ? 0 : one > two ? 1 : 2;
    }
  }
  return next;
}
export function nextMatch(run) {
  requireState(run.phase === 'result' && run.match.resultApplied);
  const size = run.mode.structure === 'streak'
    ? run.match.outcome === 1 ? Math.min(8, run.match.size + 2) : run.match.size
    : run.series.fixedSize;
  return beginMatch(run, size, 3 - run.match.firstSide);
}
export function extendRun(run) {
  requireState(run.phase === 'seriesResult' && run.series?.outcome === 0);
  return nextMatch({ ...run, phase: 'result', series: { ...run.series, extensionActive: true, outcome: null } });
}
