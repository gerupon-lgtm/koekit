// 最小のイベントエミッタ。音声入力層・区間ステートマシンで共有する。
export class Emitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
  }

  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return this;
  }

  off(event, fn) {
    this._handlers.get(event)?.delete(fn);
    return this;
  }

  emit(event, ...args) {
    const set = this._handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(...args); } catch (e) { /* ハンドラの例外で他を止めない */ }
    }
  }
}
