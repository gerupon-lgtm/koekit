// 生ログの記録（要件9.1 / F-005 / data-model.md 2節）
//
// - 1試行ごとの生ログをメモリにのみ保持する。永続保存しない（画面を閉じたら破棄）
// - at は UTC の Date で保持し、出力時に JST へ変換する（csv.js）
// - rawText は認識器が返した文字列そのものを残す（表記揺れの補強に使う。要件8.7）

/**
 * @typedef {Object} LogEntry
 * @property {Date}   at              発話を検知した時刻（UTC）
 * @property {string} method          'webspeech' | 'webspeech-local' | 'vosk'
 * @property {string} level           '0' | '1'..'5' | 'extra'
 * @property {string} phase           'await_start'|'await_stop'|'await_position'|'await_confirm'
 * @property {string} expected        その時点で正解となる語のキー。なければ ''
 * @property {string} rawText         認識器が返した文字列そのもの
 * @property {string} matchedKey      照合結果のキー。一致なしは ''
 * @property {number} elapsedMs       発話終了検知から処理までの経過ミリ秒
 * @property {string} outcome         'correct' | 'wrong' | 'ignored' | 'spurious'
 * @property {number} sessionRestart  このエントリまでの認識セッション再開回数
 */

export class Recorder {
  constructor() {
    /** @type {LogEntry[]} */
    this._entries = [];
  }

  /**
   * 1件記録する。未指定項目は既定値で埋める。
   * @param {Partial<LogEntry>} e
   * @returns {LogEntry}
   */
  add(e = {}) {
    /** @type {LogEntry} */
    const entry = {
      at:             e.at instanceof Date ? e.at : new Date(),
      method:         e.method ?? '',
      level:          e.level ?? '',
      phase:          e.phase ?? '',
      expected:       e.expected ?? '',
      rawText:        e.rawText ?? '',
      matchedKey:     e.matchedKey ?? '',
      elapsedMs:      Number.isFinite(e.elapsedMs) ? e.elapsedMs : 0,
      outcome:        e.outcome ?? 'ignored',
      sessionRestart: Number.isFinite(e.sessionRestart) ? e.sessionRestart : 0,
    };
    this._entries.push(entry);
    return entry;
  }

  /** @returns {LogEntry[]} 記録の複製（外部からの破壊を防ぐ） */
  getAll() {
    return this._entries.map(x => ({ ...x }));
  }

  get length() { return this._entries.length; }

  /** その回のログを破棄する（永続保存しないため、リセットは単なる配列クリア） */
  clear() { this._entries = []; }
}
