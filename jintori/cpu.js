import { CPU_SETTINGS, CONFIG } from './config.js';
import {
  analyzeMove,
  applyMove,
  countCells,
  listLegalMoves,
} from './rules.js';

const TIMEOUT = Symbol('CPU_TIMEOUT');
const ITEMS = Object.freeze(['basic', 'enhanced', 'strongest']);

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function cpuError(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function opponentOf(side) {
  return side === 1 ? 2 : 1;
}

function sample(items, random) {
  const value = Number(random());
  const normalized = Number.isFinite(value) ? value : 0;
  const index = Math.min(
    items.length - 1,
    Math.max(0, Math.floor(normalized * items.length)),
  );
  return items[index];
}

function availableItems(state) {
  const items = ['basic'];
  if (!CONFIG.specialItemSizes.includes(state.size)) return items;
  const inventory = state.inventoryBySide[state.sideToMove];
  if (inventory.enhanced > 0) items.push('enhanced');
  if (inventory.strongest > 0) items.push('strongest');
  return items;
}

function moveFromAnalysis(cell, item, analysis, direction = null) {
  return {
    cell,
    item,
    directionId: direction?.id ?? null,
    analysis,
    extra: direction?.extra ?? analysis.extra,
  };
}

function enumerateMoves(state) {
  const cells = listLegalMoves(state);
  if (cells.length === 0) return [];
  const candidates = [];
  for (const cell of cells) {
    for (const item of availableItems(state)) {
      const analysis = analyzeMove(state, cell, item);
      if (!analysis.legal) continue;
      if (item === 'strongest' && analysis.needsDirection) {
        for (const direction of analysis.directions) {
          candidates.push(moveFromAnalysis(cell, item, analysis, direction));
        }
      } else {
        candidates.push(moveFromAnalysis(cell, item, analysis));
      }
    }
  }
  return candidates;
}

function publicMove(candidate) {
  if (!candidate) return null;
  return {
    cell: candidate.cell,
    item: candidate.item,
    directionId: candidate.directionId,
  };
}

function isCorner(size, cell) {
  return cell === 0
    || cell === size - 1
    || cell === size * (size - 1)
    || cell === size * size - 1;
}

function immediateScore(state, candidate) {
  const weights = CPU_SETTINGS.weights;
  const flipped = new Set([...candidate.analysis.normal, ...candidate.extra]).size;
  const itemCost = candidate.item === 'enhanced'
    ? weights.enhancedCost
    : candidate.item === 'strongest'
      ? weights.strongestCost
      : 0;
  return flipped * weights.capture
    + candidate.extra.length * weights.extraEffect
    + (isCorner(state.size, candidate.cell) ? weights.corner : 0)
    - itemCost;
}

function chooseScoredCandidate(state, candidates, random) {
  let highest = -Infinity;
  let best = [];
  for (const candidate of candidates) {
    const score = immediateScore(state, candidate);
    if (score > highest) {
      highest = score;
      best = [candidate];
    } else if (score === highest) {
      best.push(candidate);
    }
  }
  return sample(best, random);
}

function chooseEasy(state, random) {
  const cells = listLegalMoves(state);
  if (cells.length === 0) return null;
  const cell = sample(cells, random);
  const item = sample(availableItems(state), random);
  const analysis = analyzeMove(state, cell, item);
  let directionId = null;
  if (item === 'strongest' && analysis.needsDirection) {
    directionId = sample(analysis.directions, random).id;
  }
  return { cell, item, directionId };
}

function checkTime(context) {
  if (context.now() >= context.deadline) throw TIMEOUT;
}

function applyCandidate(state, candidate) {
  return applyMove(
    state,
    candidate.cell,
    candidate.item,
    candidate.directionId,
  );
}

function cornerDifference(state, rootSide) {
  const last = state.size - 1;
  const corners = [0, last, last * state.size, state.size * state.size - 1];
  let difference = 0;
  for (const cell of corners) {
    if (state.cells[cell] === rootSide) difference += 1;
    else if (state.cells[cell] === opponentOf(rootSide)) difference -= 1;
  }
  return difference;
}

function mobilityFor(state, side) {
  if (state.phase !== 'playing') return 0;
  return listLegalMoves({ ...state, sideToMove: side }).length;
}

function evaluateState(state, rootSide) {
  const weights = CPU_SETTINGS.weights;
  if (state.phase === 'result') {
    if (state.outcome === 0) return 0;
    return state.outcome === rootSide ? weights.terminal : -weights.terminal;
  }

  const opponent = opponentOf(rootSide);
  const counts = countCells(state);
  const pieceDifference = counts[rootSide] - counts[opponent];
  const mobilityDifference = mobilityFor(state, rootSide) - mobilityFor(state, opponent);
  const rootInventory = state.inventoryBySide[rootSide];
  const opponentInventory = state.inventoryBySide[opponent];
  const inventoryDifference =
    (rootInventory.enhanced - opponentInventory.enhanced) * weights.enhancedInventory
    + (rootInventory.strongest - opponentInventory.strongest) * weights.strongestInventory;

  return pieceDifference * weights.piece
    + mobilityDifference * weights.mobility
    + cornerDifference(state, rootSide) * weights.ownedCorner
    + inventoryDifference;
}

function minimax(state, depth, alpha, beta, rootSide, context) {
  checkTime(context);
  if (depth === 0 || state.phase === 'result') return evaluateState(state, rootSide);

  const candidates = enumerateMoves(state)
    .sort((a, b) => immediateScore(state, b) - immediateScore(state, a));
  if (candidates.length === 0) return evaluateState(state, rootSide);

  const maximizing = state.sideToMove === rootSide;
  let value = maximizing ? -Infinity : Infinity;
  for (const candidate of candidates) {
    checkTime(context);
    const next = applyCandidate(state, candidate);
    const childValue = minimax(next, depth - 1, alpha, beta, rootSide, context);
    if (maximizing) {
      value = Math.max(value, childValue);
      alpha = Math.max(alpha, value);
    } else {
      value = Math.min(value, childValue);
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
  }
  return value;
}

function chooseHard(state, random, budgetMs, now) {
  const candidates = enumerateMoves(state);
  if (candidates.length === 0) return null;

  const fallback = chooseScoredCandidate(state, candidates, random);
  const boundedBudget = Math.max(0, Math.min(300, Number(budgetMs) || 0));
  if (boundedBudget === 0) return publicMove(fallback);

  const startedAt = now();
  const context = { now, deadline: startedAt + boundedBudget };
  const rootSide = state.sideToMove;
  let completedBest = fallback;

  for (let depth = 1; depth <= CPU_SETTINGS.hard.maxDepth; depth += 1) {
    try {
      checkTime(context);
      let depthBest = [];
      let depthBestValue = -Infinity;
      const ordered = [...candidates]
        .sort((a, b) => immediateScore(state, b) - immediateScore(state, a));
      for (const candidate of ordered) {
        checkTime(context);
        const next = applyCandidate(state, candidate);
        const value = minimax(
          next,
          depth - 1,
          -Infinity,
          Infinity,
          rootSide,
          context,
        );
        if (value > depthBestValue) {
          depthBestValue = value;
          depthBest = [candidate];
        } else if (value === depthBestValue) {
          depthBest.push(candidate);
        }
      }
      completedBest = sample(depthBest, random);
    } catch (error) {
      if (error !== TIMEOUT) throw error;
      break;
    }
  }

  return publicMove(completedBest);
}

export function chooseMove(state, difficulty = 'easy', options = {}) {
  if (!CPU_SETTINGS.difficulties.includes(difficulty)) {
    throw cpuError('INVALID_DIFFICULTY', `Unknown CPU difficulty: ${difficulty}`);
  }
  if (!state || state.phase !== 'playing') return null;

  const random = options.random ?? Math.random;
  const now = options.now ?? defaultNow;
  const budgetMs = options.budgetMs ?? CPU_SETTINGS.budgetMs[difficulty];

  if (difficulty === 'easy') return chooseEasy(state, random);

  const candidates = enumerateMoves(state);
  if (candidates.length === 0) return null;
  if (difficulty === 'normal') {
    return publicMove(chooseScoredCandidate(state, candidates, random));
  }
  return chooseHard(state, random, budgetMs, now);
}

export { ITEMS };
