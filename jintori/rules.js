import { CONFIG } from './config.js';

const DEFAULT_INVENTORY = Object.freeze({
  1: CONFIG.supplies.refill,
  2: CONFIG.supplies.refill,
});

const DIRECTIONS = Object.freeze([
  Object.freeze({ id: 'N', dr: -1, dc: 0 }),
  Object.freeze({ id: 'NE', dr: -1, dc: 1 }),
  Object.freeze({ id: 'E', dr: 0, dc: 1 }),
  Object.freeze({ id: 'SE', dr: 1, dc: 1 }),
  Object.freeze({ id: 'S', dr: 1, dc: 0 }),
  Object.freeze({ id: 'SW', dr: 1, dc: -1 }),
  Object.freeze({ id: 'W', dr: 0, dc: -1 }),
  Object.freeze({ id: 'NW', dr: -1, dc: -1 }),
]);

const ITEM_TYPES = new Set(['basic', 'enhanced', 'strongest']);

function rulesError(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function validInventory(inventoryBySide) {
  return [1, 2].every((side) => {
    const inventory = inventoryBySide?.[side];
    return inventory
      && Number.isInteger(inventory.enhanced)
      && inventory.enhanced >= 0
      && Number.isInteger(inventory.strongest)
      && inventory.strongest >= 0;
  });
}

function cloneInventory(inventoryBySide) {
  return {
    1: { ...inventoryBySide[1] },
    2: { ...inventoryBySide[2] },
  };
}

function isStateShapeValid(state) {
  return state
    && Number.isInteger(state.size)
    && CONFIG.sizes.includes(state.size)
    && Array.isArray(state.cells)
    && state.cells.length === state.size * state.size
    && state.cells.every((cell) => cell === 0 || cell === 1 || cell === 2)
    && (state.sideToMove === 1 || state.sideToMove === 2)
    && validInventory(state.inventoryBySide)
    && (state.phase === 'playing' || state.phase === 'result');
}

function blankAnalysis(reason) {
  return {
    legal: false,
    reason,
    normal: [],
    extra: [],
    directions: [],
    needsDirection: false,
  };
}

function opponentOf(side) {
  return side === 1 ? 2 : 1;
}

function indexAt(size, row, column) {
  if (row < 0 || row >= size || column < 0 || column >= size) return null;
  return row * size + column;
}

function normalInDirection(state, cell, direction) {
  const { size, cells, sideToMove } = state;
  const opponent = opponentOf(sideToMove);
  const originRow = Math.floor(cell / size);
  const originColumn = cell % size;
  const run = [];
  let row = originRow + direction.dr;
  let column = originColumn + direction.dc;

  while (true) {
    const index = indexAt(size, row, column);
    if (index === null) return [];
    if (cells[index] === opponent) {
      run.push(index);
      row += direction.dr;
      column += direction.dc;
      continue;
    }
    if (cells[index] === sideToMove && run.length > 0) return run;
    return [];
  }
}

function strongestExtraInDirection(state, cell, direction, normal) {
  const { size, cells, sideToMove } = state;
  const opponent = opponentOf(sideToMove);
  const normalSet = new Set(normal);
  const originRow = Math.floor(cell / size);
  const originColumn = cell % size;
  const enclosed = [];
  let run = [];
  let row = originRow + direction.dr;
  let column = originColumn + direction.dc;

  while (true) {
    const index = indexAt(size, row, column);
    if (index === null || cells[index] === 0) break;
    if (cells[index] === opponent) {
      run.push(index);
    } else if (cells[index] === sideToMove) {
      if (run.length > 0) enclosed.push(...run);
      run = [];
    }
    row += direction.dr;
    column += direction.dc;
  }

  return enclosed.filter((index) => !normalSet.has(index));
}

function sortedUnique(indexes) {
  return [...new Set(indexes)].sort((a, b) => a - b);
}

export function createMatch(
  size,
  firstSide = 1,
  inventoryBySide = DEFAULT_INVENTORY,
) {
  if (!CONFIG.sizes.includes(size)) {
    throw Object.assign(new Error('Unsupported board size'), { code: 'INVALID_SIZE' });
  }
  if (firstSide !== 1 && firstSide !== 2) {
    throw Object.assign(new Error('First side must be 1 or 2'), { code: 'INVALID_SIDE' });
  }
  if (!validInventory(inventoryBySide)) {
    throw rulesError('INVALID_INVENTORY', 'Inventory must contain non-negative item counts for both sides');
  }

  const cells = Array(size * size).fill(0);
  const upper = size / 2 - 1;
  const lower = size / 2;
  cells[upper * size + upper] = 1;
  cells[upper * size + lower] = 2;
  cells[lower * size + upper] = 2;
  cells[lower * size + lower] = 1;

  return {
    size,
    cells,
    sideToMove: firstSide,
    inventoryBySide: cloneInventory(inventoryBySide),
    phase: 'playing',
    outcome: null,
    turnInfo: { passedSides: [], terminal: false },
  };
}

export function countCells(state) {
  const counts = { empty: 0, 1: 0, 2: 0 };
  for (const cell of state.cells) {
    if (cell === 0) counts.empty += 1;
    else counts[cell] += 1;
  }
  return counts;
}

export function analyzeMove(state, cell, itemType = 'basic') {
  if (!isStateShapeValid(state)) return blankAnalysis('INVALID_STATE');
  if (state.phase !== 'playing') return blankAnalysis('MATCH_OVER');
  if (!ITEM_TYPES.has(itemType)) return blankAnalysis('INVALID_ITEM');
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.cells.length) {
    return blankAnalysis('INVALID_CELL');
  }
  if (state.cells[cell] !== 0) return blankAnalysis('CELL_OCCUPIED');
  if (itemType !== 'basic') {
    if (!CONFIG.specialItemSizes.includes(state.size)) {
      return blankAnalysis('ITEM_UNAVAILABLE');
    }
    if (state.inventoryBySide[state.sideToMove][itemType] <= 0) {
      return blankAnalysis('NO_ITEM');
    }
  }

  const normalByDirection = DIRECTIONS.map((direction) => ({
    ...direction,
    normal: normalInDirection(state, cell, direction),
  }));
  const normal = sortedUnique(normalByDirection.flatMap(({ normal: flips }) => flips));
  if (normal.length === 0) return blankAnalysis('NO_CAPTURE');

  if (itemType === 'basic') {
    return {
      legal: true,
      reason: null,
      normal,
      extra: [],
      directions: [],
      needsDirection: false,
    };
  }

  if (itemType === 'enhanced') {
    const row = Math.floor(cell / state.size);
    const column = cell % state.size;
    const normalSet = new Set(normal);
    const extra = [];
    for (const { dr, dc } of DIRECTIONS.filter(({ dr, dc }) => dr === 0 || dc === 0)) {
      const index = indexAt(state.size, row + dr, column + dc);
      if (
        index !== null
        && state.cells[index] === opponentOf(state.sideToMove)
        && !normalSet.has(index)
      ) {
        extra.push(index);
      }
    }
    return {
      legal: true,
      reason: null,
      normal,
      extra: sortedUnique(extra),
      directions: [],
      needsDirection: false,
    };
  }

  const evaluatedDirections = normalByDirection.map((direction) => {
    const directionNormal = sortedUnique(direction.normal);
    const extra = sortedUnique(
      strongestExtraInDirection(state, cell, direction, directionNormal),
    );
    return {
      id: direction.id,
      normal: directionNormal,
      extra,
      total: sortedUnique([...directionNormal, ...extra]).length,
    };
  });
  const maxTotal = Math.max(...evaluatedDirections.map(({ total }) => total));
  const directions = evaluatedDirections.filter(({ total }) => total === maxTotal);
  const needsDirection = directions.length > 1;
  const extra = directions.length === 1 ? directions[0].extra : [];

  return {
    legal: true,
    reason: null,
    normal,
    extra,
    directions,
    needsDirection,
  };
}

export function applyMove(state, cell, itemType = 'basic', directionId = null) {
  const analysis = analyzeMove(state, cell, itemType);
  if (!analysis.legal) {
    throw rulesError(analysis.reason);
  }

  let extra = analysis.extra;
  if (itemType === 'strongest') {
    if (analysis.needsDirection && directionId === null) {
      throw rulesError('DIRECTION_REQUIRED');
    }
    const chosen = directionId === null
      ? analysis.directions[0]
      : analysis.directions.find(({ id }) => id === directionId);
    if (!chosen) throw rulesError('INVALID_DIRECTION');
    extra = chosen.extra;
  } else if (directionId !== null) {
    throw rulesError('INVALID_DIRECTION');
  }

  const side = state.sideToMove;
  const cells = [...state.cells];
  cells[cell] = side;
  for (const index of sortedUnique([...analysis.normal, ...extra])) {
    cells[index] = side;
  }

  const inventoryBySide = cloneInventory(state.inventoryBySide);
  if (itemType !== 'basic') inventoryBySide[side][itemType] -= 1;

  return resolveTurn({
    ...state,
    cells,
    sideToMove: opponentOf(side),
    inventoryBySide,
    phase: 'playing',
    outcome: null,
    turnInfo: { passedSides: [], terminal: false },
  });
}

export function listLegalMoves(state, itemType = 'basic') {
  if (!isStateShapeValid(state) || state.phase !== 'playing') return [];
  const moves = [];
  for (let cell = 0; cell < state.cells.length; cell += 1) {
    if (state.cells[cell] === 0 && analyzeMove(state, cell, itemType).legal) {
      moves.push(cell);
    }
  }
  return moves;
}

export function resolveTurn(state) {
  if (!isStateShapeValid(state)) throw rulesError('INVALID_STATE');
  if (state.phase === 'result') {
    return {
      ...state,
      turnInfo: { passedSides: [], terminal: true },
    };
  }

  const emptyCount = countCells(state).empty;
  if (emptyCount === 0) {
    return finishMatch(state, []);
  }

  if (listLegalMoves(state).length > 0) {
    return {
      ...state,
      turnInfo: { passedSides: [], terminal: false },
    };
  }

  const passedSide = state.sideToMove;
  const otherSide = opponentOf(passedSide);
  const otherState = { ...state, sideToMove: otherSide };
  if (listLegalMoves(otherState).length > 0) {
    return {
      ...state,
      sideToMove: otherSide,
      turnInfo: { passedSides: [passedSide], terminal: false },
    };
  }

  return finishMatch(state, [passedSide, otherSide]);
}

function finishMatch(state, passedSides) {
  const counts = countCells(state);
  const outcome = counts[1] === counts[2] ? 0 : counts[1] > counts[2] ? 1 : 2;
  return {
    ...state,
    phase: 'result',
    outcome,
    turnInfo: { passedSides, terminal: true },
  };
}
