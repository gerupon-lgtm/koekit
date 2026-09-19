import { ALL_POSITIONS } from './positions.js';

// 設定画面は後続。範囲拡張・速度調整をコントローラから分離する。
export const SEQUENCE_SETTINGS = Object.freeze({ maxSteps: 6, normalOnMs: 800, normalOffMs: 400, speedOnMs: 600, speedOffMs: 300 });
export function sequenceLevels(settings = SEQUENCE_SETTINGS) {
  const max = Math.max(2, Math.min(9, Math.round(settings.maxSteps)));
  return [false, true].flatMap(speed => Array.from({ length: max - 1 }, (_, i) => ({
    id: (speed ? 's' : '') + (i + 1), steps: i + 2, speed,
    label: `${speed ? 'スピード ' : ''}${i + 2}手`, vocab: [...ALL_POSITIONS],
    onMs: speed ? settings.speedOnMs : settings.normalOnMs,
    offMs: speed ? settings.speedOffMs : settings.normalOffMs,
  })));
}
export function makeSequence(length, random = Math.random) {
  return Array.from({ length }, () => ALL_POSITIONS[Math.floor(random() * ALL_POSITIONS.length)]);
}
export class SequenceAnswer {
  constructor(target) { this.target = [...target]; this.values = []; this.submitted = false; }
  get ready() { return this.values.length === this.target.length; }
  add(key) { if (!this.submitted && !this.ready && ALL_POSITIONS.includes(key)) this.values.push(key); }
  undo() { if (!this.submitted) this.values.pop(); }
  clear() { if (!this.submitted) this.values = []; }
  submit() {
    if (this.submitted || !this.ready) return null;
    this.submitted = true;
    return this.values.every((key, i) => key === this.target[i]);
  }
}
