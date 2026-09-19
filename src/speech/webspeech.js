// 方式A / B アダプタ（Web Speech API）— F-002 / 要件10.1 / T-006 / T-007
//
// - 方式A 'webspeech'      : 既定モード。端末内/外部処理はブラウザ裁量。検証専用（C-1・公開版で使わない）
// - 方式B 'webspeech-local': processLocally:true で端末内処理を要求。ja-JP可否は端末依存
//   実機検証（2026-09-16 Pixel6a/Chrome153）では ja-JP は language-not-supported で不可。
//   将来Chromeが対応すれば有利になる予備（docs/field-check-results.md）。
//
// インターフェースは implementation-guide 6節に準拠。認識セッションが落ちたら自動再開する
// （Android Chrome は連続認識が途中で終わる）。再開回数は 'restart' で通知しログに残す。

import { Emitter } from '../util/emitter.js';
import { METHODS } from './config.js';

const SR = (typeof window !== 'undefined')
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export class WebSpeechAdapter extends Emitter {
  /** @param {{ local?: boolean }} [opts] local=true で方式B（端末内） */
  constructor({ local = false } = {}) {
    super();
    this.name = local ? METHODS.WEBSPEECH_LOCAL : METHODS.WEBSPEECH;
    this._local = local;
    this._rec = null;
    this._active = false;       // 呼び出し側が start 中か（stop で false）
    this._restartCount = 0;
    this._speechEndAt = 0;
    this._startAt = 0;
  }

  get restartCount() { return this._restartCount; }

  /** 方式が使えるか。B は ja-JP の端末内可否まで確認する。 */
  async isAvailable() {
    if (!SR) return false;
    if (!this._local) return true; // 方式Aは存在すれば可
    // 方式B: 端末内モードの可否確認API
    if (typeof SR.available !== 'function') return false;
    try {
      const r = await SR.available({ langs: ['ja-JP'], processLocally: true });
      return r != null && r !== 'unavailable';
    } catch {
      return false;
    }
  }

  /** @param {string[]} [_words] WebSpeechは文法指定不可のため受け取るが使わない。 */
  start(_words) {
    if (!SR) { this.emit('error', 'not-supported'); return; }
    this._active = true;
    this._launch();
  }

  _launch() {
    let rec;
    try {
      rec = new SR();
    } catch (e) {
      this.emit('error', 'init-failed');
      return;
    }
    rec.lang = 'ja-JP';
    rec.continuous = false;
    rec.interimResults = false;
    if (this._local) {
      // 未対応オブジェクトへ同名プロパティを追加しても端末内処理にはならない。
      // 要求できないときは開始せず、タッチ操作へ戻す（C-1）。
      try {
        if (!('processLocally' in rec)) throw new Error('unsupported');
        rec.processLocally = true;
        if (rec.processLocally !== true) throw new Error('unsupported');
      } catch {
        this._active = false;
        this.emit('error', 'not-supported');
        return;
      }
    }
    this._startAt = performance.now();
    this._speechEndAt = 0;

    rec.onspeechend = () => { this._speechEndAt = performance.now(); };
    rec.onresult = (ev) => {
      const raw = ev.results?.[0]?.[0]?.transcript ?? '';
      const base = this._speechEndAt || this._startAt;
      const elapsed = Math.max(0, Math.round(performance.now() - base));
      this.emit('result', raw, elapsed);
    };
    rec.onerror = (ev) => {
      // no-speech / aborted は通常の区間終了に近い。致命的でないものは 'end' の自動再開に委ねる
      this.emit('error', ev.error || 'error');
    };
    rec.onend = () => {
      this.emit('end');
      // 呼び出し側がまだ受け付け中なら自動再開（セッションが落ちても復帰する）
      if (this._active) {
        this._restartCount++;
        this.emit('restart', this._restartCount);
        // 直後の再start例外を避けるため微小遅延
        setTimeout(() => { if (this._active) this._launch(); }, 60);
      }
    };
    this._rec = rec;
    try { rec.start(); } catch (e) { /* 二重start等は無視（onendで拾う） */ }
  }

  stop() {
    this._active = false;
    if (this._rec) {
      try { this._rec.onend = null; this._rec.stop(); } catch { /* 無視 */ }
      this._rec = null;
    }
  }
}
