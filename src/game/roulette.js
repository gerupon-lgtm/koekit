// レベル0 ルーレット（F-004 / T-011）
//
// 「スタート」で数字が切り替わり徐々に加速。「ストップ」で惰性後に停止して出目が確定する。
// 音声でもタッチでも同じAPI（start()/stop()）を叩く。ゲーム側は入力手段を意識しない。
//
// 二重送信の防止（E-07）: spinning 中の start()、stopping 中の stop() は無視する。
// 表示や時間に依存する部分は rAF/now を注入可能にして、ロジックを差し替えできるようにする。

import { Emitter } from '../util/emitter.js';

const DEFAULT = {
  faces: 10,          // 出目 0..9（盤面では札の枚数）
  startInterval: 120, // 開始時の桁送り間隔(ms)
  minInterval: 45,    // 加速の下限(ms)
  accel: 0.94,        // 1ステップごとに間隔へ掛ける係数（<1で加速）
  decel: 1.18,        // 停止時に間隔へ掛ける係数（>1で減速）
  stopInterval: 320,  // これを超えたら停止確定(ms)
  // フェイント停止（要件0章A区分・T-016異常系「単調にならない速度カーブ」）:
  // 止まりそうになった瞬間、確率で再加速してから改めて止まる。正解の先読みを防ぐ。
  // 既定は無効。レベル3以降で有効化する（呼び出し側でパラメータ指定）。
  fakeoutProb: 0,     // 各「止まりそう」判定での再加速確率
  fakeoutMax: 0,      // 1停止あたりの再加速の上限回数（必ず有限回で止まる）
  fakeoutNear: 0.6,   // stopInterval に対しこの割合を超えたら「止まりそう」域
};

export class Roulette extends Emitter {
  /**
   * @param {object} [opts]
   * @param {number} [opts.faces]
   * @param {number} [opts.speedFactor] 1より大で高速（延長ステージ用）
   * @param {() => number} [opts.now] 時刻源（既定 performance.now）
   * @param {(cb:Function)=>number} [opts.raf] フレーム源（既定 requestAnimationFrame）
   */
  constructor(opts = {}) {
    super();
    this._c = { ...DEFAULT, ...opts };
    const sf = opts.speedFactor || 1;
    this._c.startInterval /= sf;
    this._c.minInterval /= sf;
    this._now = opts.now || (() => performance.now());
    this._raf = opts.raf || ((cb) => requestAnimationFrame(cb));
    this._state = 'idle';       // idle | spinning | stopping
    this._value = 0;
    this._interval = this._c.startInterval;
    this._nextAt = 0;
    this._running = false;
  }

  get value() { return this._value; }
  get state() { return this._state; }
  get spinning() { return this._state !== 'idle'; }

  /** 抽選開始。spinning/stopping 中は二重に走らせない（E-07）。 */
  start() {
    if (this._state !== 'idle') return false;
    this._state = 'spinning';
    this._interval = this._c.startInterval;
    this._fakeoutsLeft = this._c.fakeoutMax; // この停止で使えるフェイント回数
    this._nextAt = this._now() + this._interval;
    if (!this._running) { this._running = true; this._raf(this._loop); }
    this.emit('start');
    return true;
  }

  /** 停止指示。惰性（減速）に入る。stopping/idle 中は無視（E-07）。 */
  stop() {
    if (this._state !== 'spinning') return false;
    this._state = 'stopping';
    this.emit('stopping');
    return true;
  }

  reset() {
    this._state = 'idle';
    this._running = false;
    this._interval = this._c.startInterval;
  }

  _loop = () => {
    if (this._state === 'idle') { this._running = false; return; }
    const t = this._now();
    if (t >= this._nextAt) {
      this._value = (this._value + 1) % this._c.faces;
      // 現在の送り間隔も渡す（音のピッチ・cadenceを速さに追従させるため）
      this.emit('tick', this._value, this._interval);
      if (this._state === 'spinning') {
        // 加速（間隔を下限まで詰める）
        this._interval = Math.max(this._c.minInterval, this._interval * this._c.accel);
      } else if (this._state === 'stopping') {
        // 減速（間隔を広げ、しきい値を超えたら確定）
        this._interval *= this._c.decel;
        // フェイント: 「止まりそう」域に入った瞬間、確率で再加速してから改めて止まる
        if (this._fakeoutsLeft > 0 &&
            this._interval >= this._c.stopInterval * this._c.fakeoutNear &&
            Math.random() < this._c.fakeoutProb) {
          this._fakeoutsLeft--;
          this._interval = this._c.minInterval * 2.2; // 再加速（速くなる）
          this.emit('fakeout');
        } else if (this._interval >= this._c.stopInterval) {
          this._state = 'idle';
          this._running = false;
          this.emit('stop', this._value);
          return;
        }
      }
      this._nextAt = t + this._interval;
    }
    this._raf(this._loop);
  };
}
