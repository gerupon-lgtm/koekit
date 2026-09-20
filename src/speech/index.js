// 音声入力層のファクトリ（F-002 / 要件10.3 / T-005）
//
// 方式A・B・Cを同じインターフェースで扱い、ゲーム側のコードを変えずに切り替えられるようにする。
// これはコエキットの後続試作へ引き継ぐ共通部品。このアプリ専用の実装にしない（要件10.3）。
//
// 返すインターフェース（implementation-guide 6節）:
//   { name, isAvailable(), start(words), stop(), on('result'|'error'|'end'|'restart', fn) }
//   - start(words): その区間で受け付ける表記の配列（Voskは文法として利用、WebSpeech系は参考）
//   - on('result', (raw, elapsedMs) => void)
//   - on('error',  (code) => void)
//   - on('end',    () => void)          セッション終了。再開判断は呼び出し側／アダプタ内の自動再開
//   - on('restart',(count) => void)     自動再開が起きた（再開回数をログに残す）

import { METHODS } from './config.js';
import { WebSpeechAdapter } from './webspeech.js';
import { VoskAdapter } from './vosk.js';
import { SwitchableSpeech } from './switchable.js';

export { METHODS } from './config.js';

/**
 * 方式名からアダプタを生成する。ゲーム側は返り値のインターフェースだけを使う。
 * @param {string} method METHODS のいずれか
 * @param {object} [opts] VoskAdapter への modelUrl など
 */
export function createSpeechInput(method, opts = {}) {
  switch (method) {
    case METHODS.WEBSPEECH:       throw new Error('公開ゲームでは方式Aを使用できません');
    case METHODS.WEBSPEECH_LOCAL: return new SwitchableSpeech(method, () => new WebSpeechAdapter({ local: true }));
    case METHODS.VOSK:            return new SwitchableSpeech(method, () => new VoskAdapter(opts));
    default:
      throw new Error('未知の音声認識方式: ' + method);
  }
}

/**
 * その方式が現環境で使えるか（生成せずに軽く確認したい場合）。
 * @param {string} method
 * @returns {Promise<boolean>}
 */
export async function isMethodAvailable(method, opts = {}) {
  const a = createSpeechInput(method, opts);
  const ok = await a.isAvailable();
  if (a.dispose) { try { a.dispose(); } catch { /* 無視 */ } }
  return ok;
}
