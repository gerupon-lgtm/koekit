// 受け付け区間のステートマシン（要件8.3 / F-002 / F-003）
//
// 変更禁止（implementation-guide 5節・変更禁止5）:
//   常時認識にしない。区間ごとに認識を開始・停止し、その区間で必要な語だけを受け付ける。
//   この区間設計が「鳴き声を認識器が拾う問題」と「区間外の語の誤認識」を同時に解決している。
//   result 状態では認識を停止する。
//
// このクラスは音声アダプタや DOM を直接には持たず、リスナ経由で結合する（Nodeで単体検証可能）。
// - startListening(keys): その区間で受け付けるキー配列だけをアダプタへ渡して認識開始
// - stopListening(): 認識停止
// アプリ側は 'match'(key) / 'ignored'(raw) / 'enter'(state) を購読して遷移を決める。

import { Emitter } from '../util/emitter.js';
import { match as matchVocab } from '../speech/vocabulary.js';

/** 区間の識別子（data-model.md 2節 phase と一致） */
export const PHASES = Object.freeze({
  AWAIT_START:    'await_start',
  AWAIT_STOP:     'await_stop',
  AWAIT_POSITION: 'await_position',
  AWAIT_CONFIRM:  'await_confirm',
  RESULT:         'result',
});

/**
 * その区間で受け付けるキー配列を返す（要件8.3 の表）。
 * @param {string} phase
 * @param {string[]} levelVocab そのレベルの位置語キー配列（例: ['left','right']）
 * @returns {string[]}
 */
export function vocabForPhase(phase, levelVocab = []) {
  switch (phase) {
    case PHASES.AWAIT_START:    return ['start'];
    case PHASES.AWAIT_STOP:     return ['stop'];
    case PHASES.AWAIT_POSITION: return [...levelVocab];
    // 確定待ちは確定語＋位置語（言い直し用）。要件8.3
    case PHASES.AWAIT_CONFIRM:  return ['confirm', ...levelVocab];
    case PHASES.RESULT:         return []; // 認識停止
    default:                    return [];
  }
}

export class PhaseMachine extends Emitter {
  /**
   * @param {object} opts
   * @param {(keys: string[]) => void} opts.startListening 区間の語だけで認識開始
   * @param {() => void} opts.stopListening 認識停止
   */
  constructor({ startListening, stopListening }) {
    super();
    this._startListening = startListening;
    this._stopListening = stopListening;
    this._phase = null;
    this._levelVocab = [];
  }

  get phase() { return this._phase; }
  get allowed() { return vocabForPhase(this._phase, this._levelVocab); }

  /** そのレベルの位置語を設定する（await_position / await_confirm で使う） */
  setLevelVocab(keys) { this._levelVocab = Array.isArray(keys) ? [...keys] : []; }

  /** 区間へ遷移する。result では認識を停止し、それ以外では区間の語で認識を開始する。
   *  前区間の認識を必ず止めてから開始する（アダプタの二重起動を防ぐ）。 */
  to(phase) {
    this._phase = phase;
    const keys = this.allowed;
    this._stopListening();
    if (phase !== PHASES.RESULT) {
      this._startListening(keys);
    }
    this.emit('enter', phase, keys);
    return this;
  }

  /**
   * アダプタから来た認識文字列を、現区間の語彙で照合して振り分ける。
   * 区間外・登録外・雑音は 'ignored'（＝何もしない。要件8.4 カウント対象外）。
   * @param {string} raw
   * @param {number} [elapsedMs]
   */
  handleRaw(raw, elapsedMs = 0) {
    // result 区間は認識停止中のため、来たものは無視する
    if (this._phase === PHASES.RESULT) {
      this.emit('ignored', raw, elapsedMs);
      return '';
    }
    const key = matchVocab(raw, this.allowed);
    if (key) this.emit('match', key, raw, elapsedMs);
    else this.emit('ignored', raw, elapsedMs);
    return key;
  }
}
