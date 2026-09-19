// イロドリズム 音声入力（制作画面のみ）。本番の音声入力層 VoskAdapter を流用（C-1）。
// 制作区間の制限文法で常時聞き（画面を離れると停止）。結果テキストを onText に渡す。
import { VoskAdapter } from '../src/speech/vosk.js';
import { ScreenAwake } from '../src/ui/screenawake.js';

export class VoiceInput {
  constructor({ onText, onStatus } = {}) {
    this._onText = onText || (() => {});
    this._onStatus = onStatus || (() => {});
    this._adapter = null;
    this._wired = false;
    this._active = false;
    this._grammar = [];
    this._awake = new ScreenAwake();   // 音声ON中はスリープ回避（可視復帰時に再取得）
  }
  get active() { return this._active; }
  setGrammar(words) { this._grammar = words || []; }

  async isAvailable() {
    if (!this._adapter) this._adapter = new VoskAdapter();
    try { return await this._adapter.isAvailable(); } catch { return false; }
  }
  _wire() {
    if (this._wired) return;
    this._adapter.on('status', (c, d) => this._onStatus(c, d));
    this._adapter.on('error', (e) => this._onStatus('error', e));
    this._adapter.on('result', (text) => { if (text) this._onText(text); });
    this._wired = true;
  }
  async enable() {
    if (this._active) return;
    if (!this._adapter) this._adapter = new VoskAdapter();
    this._wire();
    this._active = true;
    this._onStatus('starting');
    try {
      await this._adapter.start(this._grammar);
      if (this._active) { this._onStatus('listening'); this._awake.setActive(true); }
    } catch (e) {
      this._active = false;
      this._awake.setActive(false);
      this._onStatus('error', e && e.message);
    }
  }
  disable() {
    if (!this._active && !this._adapter) return;
    this._active = false;
    this._awake.setActive(false);
    try { this._adapter?.stop(); } catch { /* 無視 */ }
    this._onStatus('off');
  }
  dispose() {
    this._active = false;
    this._awake.setActive(false);
    try { this._adapter?.dispose(); } catch { /* 無視 */ }
  }
}
