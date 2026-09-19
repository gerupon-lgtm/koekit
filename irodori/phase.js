// イロドリズム 音声入力（制作画面のみ）。既存2作品と同じ作法：
// createSpeechInput ファクトリで方式C(Vosk)を生成し、on('result'|'restart'|'error') を配線。
// マイクは「状態表示」（トグルではない）。音声ON中は ScreenAwake でスリープ回避。
import { createSpeechInput, METHODS } from '../src/speech/index.js';
import { ScreenAwake } from '../src/ui/screenawake.js';

export class VoiceInput {
  constructor({ onText, onState } = {}) {
    this._onText = onText || (() => {});
    this._onState = onState || (() => {});   // 'listening'|'idle'|'denied'|'restarting'
    this._adapter = null;
    this._active = false;
    this._denied = false;
    this._grammar = [];
    this._awake = new ScreenAwake();
  }
  get active() { return this._active; }
  setGrammar(words) { this._grammar = words || []; }

  _ensure() {
    if (this._adapter) return;
    this._adapter = createSpeechInput(METHODS.VOSK);
    this._adapter.on('result', (raw) => { if (raw) this._onText(raw); });
    this._adapter.on('restart', () => { this._onState('restarting'); });
    this._adapter.on('error', (code) => {
      if (/not-allowed|denied|service-not-allowed|not-supported|permission/i.test(String(code))) {
        this._denied = true; this._active = false; this._awake.setActive(false); this._onState('denied');
      }
    });
  }
  async isAvailable() {
    this._ensure();
    try { return await this._adapter.isAvailable(); } catch { return false; }
  }
  async enable() {
    if (this._active) return;
    this._ensure();
    this._active = true;
    this._onState('listening'); this._awake.setActive(true);   // 家族と同じく楽観的に受付表示
    try {
      await this._adapter.start(this._grammar);
    } catch (e) {
      this._active = false; this._denied = true;
      this._awake.setActive(false); this._onState('denied');
    }
  }
  disable() {
    this._active = false;
    this._awake.setActive(false);
    try { this._adapter?.stop(); } catch { /* 無視 */ }
    this._onState('idle');
  }
  dispose() {
    this._active = false;
    this._awake.setActive(false);
    try { this._adapter?.dispose(); } catch { /* 無視 */ }
  }
}
