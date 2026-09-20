const refill = Object.freeze({ enhanced: 1, strongest: 1 });
const carry = Object.freeze({ enhanced: 3, strongest: 1 });

export const CONFIG = Object.freeze({
  sizes: Object.freeze([4, 6, 8]),
  specialItemSizes: Object.freeze([6, 8]),
  supplies: Object.freeze({ refill, carry }),
  timing: Object.freeze({ toast: 3200, diceResult: 700, move: 650, pass: 1200, invalid: 180, cpuThink: 600, workerTimeout: 2500 }),
  dice: Object.freeze({ faces: 6, startInterval: 120, minInterval: 55, accel: .94, decel: 1.22, stopInterval: 440 }),
});

export const CPU_SETTINGS = Object.freeze({
  difficulties: Object.freeze(['easy', 'normal', 'hard']),
  budgetMs: Object.freeze({ easy: 20, normal: 80, hard: 250 }),
  hard: Object.freeze({ maxDepth: 4 }),
  weights: Object.freeze({
    capture: 10,
    corner: 200,
    extraEffect: 5,
    enhancedCost: 2,
    strongestCost: 4,
    piece: 10,
    mobility: 4,
    ownedCorner: 60,
    enhancedInventory: 7,
    strongestInventory: 12,
    terminal: 100000,
  }),
});
