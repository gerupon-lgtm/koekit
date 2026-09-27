// 音声の受付区間（MG-T04）
// 共通の音声入力層（端末内Vosk）を使う。区間ごとに開始・停止し、常時認識にしない（実装ガイド5節の5）。
// 形はデリバリズム（delivery/phase.js）の受付区間と同じ。作品間の依存を作らないよう本作用に置く。
import { createSpeechInput } from '../src/speech/index.js';
import { publicMethod } from '../src/speech/public-method.js';

export class StorySpeech {
  constructor({ onText, onState, method, factory, startupTimeoutMs = 60000 } = {}) {
    Object.assign(this, { onText, onState, method, startupTimeoutMs });
    this.factory = factory || (() => createSpeechInput(publicMethod(this.method)));
    this.generation = 0; this.adapter = null; this.handlers = {}; this.key = null;
    this.disposed = false; this.failed = false;
  }
  open(words, context, key) {
    if (this.disposed) return;
    if (this.failed) { this.onState('denied'); return; }
    if (key === this.key) return;
    this.close();
    if (!words.length) return;
    this.key = key;
    const generation = this.generation;
    const valid = () => this.generation === generation && !this.disposed;
    try {
      this.adapter ||= this.factory();
      const fail = () => {
        if (!valid()) return;
        this.close(); this.failed = true;
        try { this.adapter?.dispose?.(); } catch { /* タッチで継続 */ }
        this.adapter = null; this.onState('denied');
      };
      this.handlers = {
        result: (raw, elapsed, eventId) => {
          if (!valid() || !raw) return;
          if (eventId != null && eventId === this.lastEvent) return;
          this.lastEvent = eventId; this.onText(raw, context);
        },
        error: fail,
        restart: () => { if (valid()) this.onState('restarting'); },
        end: () => {
          if (!valid()) return;
          this.onState('restarting'); clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => { if (valid()) { this.key = null; this.open(words, context, key); } }, 300);
        },
      };
      for (const [event, fn] of Object.entries(this.handlers)) this.adapter.on(event, fn);
      this.onState('restarting');
      this.startupTimer = setTimeout(fail, this.startupTimeoutMs);
      Promise.resolve(this.adapter.start(words))
        .then(() => { if (valid()) { clearTimeout(this.startupTimer); this.onState('listening'); } })
        .catch(fail);
    } catch { if (valid()) { this.close(); this.failed = true; this.onState('denied'); } }
  }
  retry() { this.failed = false; this.key = null; }
  close() {
    this.generation++; this.key = null; this.lastEvent = undefined;
    clearTimeout(this.restartTimer); clearTimeout(this.startupTimer);
    for (const [e, f] of Object.entries(this.handlers)) this.adapter?.off?.(e, f);
    this.handlers = {};
    try { this.adapter?.stop(); } catch { /* タッチで継続 */ }
    this.onState('idle');
  }
  dispose() { this.close(); this.disposed = true; try { this.adapter?.dispose?.(); } catch { /* 無視 */ } this.adapter = null; }
}
