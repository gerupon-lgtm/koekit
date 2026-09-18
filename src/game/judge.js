// 成否判定と回数管理（F-012 / 要件8.4 / T-020）
//
// - 動物が表示されたら正解、違うカードをめくったら失敗
// - 認識されなかった場合はカウントしない（ignored）。言い直しは失敗ではない（確定前）
// - 同一レベル最大5回。3回正解で即クリア（4・5回目を待たない）。5回で3回に届かなければゲームオーバー
//
// 変更禁止（implementation-guide 5節・変更禁止6）:
//   ゲームオーバーを廃止・緩和しない。「やり直せたほうが親切では」という善意の緩和を行わない。

export const MAX_ATTEMPTS = 5;
export const CLEAR_HITS = 3;

export class Judge {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxAttempts]
   * @param {number} [opts.clearHits]
   * @param {boolean} [opts.continueAfterClear] true なら規定回数に達しても即クリアにせず、
   *   5回まで続行できる（`cleared` フラグが立つ／決着は5回到達時）。きおくめくり用。
   */
  constructor({ maxAttempts = MAX_ATTEMPTS, clearHits = CLEAR_HITS, continueAfterClear = false } = {}) {
    this._max = maxAttempts;
    this._need = clearHits;
    this._continue = continueAfterClear;
    this.reset();
  }

  /** 規定回数の正解に達しているか（continueAfterClear 時に「クリア済だが続行中」を判定） */
  get cleared() { return this._correct >= this._need; }

  reset() {
    this._correct = 0;
    this._attempts = 0;     // カウント対象（correct + wrong）。ignored は含めない
    this._status = 'playing'; // 'playing' | 'clear' | 'gameover'
  }

  get correct() { return this._correct; }
  get attempts() { return this._attempts; }
  get status() { return this._status; }
  get remaining() { return Math.max(0, this._max - this._attempts); }

  /**
   * 1試行の結果を反映して現在の状態を返す。
   * @param {'correct'|'wrong'|'ignored'} outcome
   * @returns {'playing'|'clear'|'gameover'}
   */
  record(outcome) {
    // 既に決した後は二重遷移しない（3回目正解と5回目が同時に成立する境界対策・T-020異常系）
    if (this._status !== 'playing') return this._status;

    if (outcome === 'ignored') return this._status; // カウントしない（要件8.4）

    if (outcome === 'correct') this._correct++;
    if (outcome === 'correct' || outcome === 'wrong') this._attempts++;

    if (this._continue) {
      // クリア到達後も続行可（自動遷移しない）。決着は最大回数到達時。
      if (this._attempts >= this._max) this._status = this.cleared ? 'clear' : 'gameover';
    } else {
      // 規定回数の正解で即クリア（残り回数を待たない）
      if (this._correct >= this._need) this._status = 'clear';
      // 最大回数で規定回数に届かなければゲームオーバー
      else if (this._attempts >= this._max) this._status = 'gameover';
    }
    return this._status;
  }
}
