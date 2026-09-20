import { Emitter } from '../util/emitter.js';
import { microphoneEnabled, onMicrophoneChange } from './microphone.js';

// OFFはstopだけでなく破棄して入力ストリームを解放する。
// ONに戻した時は、現在要求されている受付区間だけ再開する。
export class SwitchableSpeech extends Emitter {
  constructor(name, factory) {
    super(); Object.assign(this, { name, factory, adapter: null, words: null, token: 0, disposed: false });
    this.unsubscribe = onMicrophoneChange(enabled => {
      if (!enabled) this.release();
      else if (this.words && !this.disposed) void this.start(this.words);
    });
  }
  ensure() {
    if (this.adapter) return this.adapter;
    const adapter = this.adapter = this.factory();
    for (const event of ['result','error','end','restart']) adapter.on(event, (...args) => {
      if (microphoneEnabled() && this.words && this.adapter === adapter && !this.disposed) this.emit(event, ...args);
    });
    return adapter;
  }
  async isAvailable() { return this.ensure().isAvailable(); }
  async start(words) {
    if (this.disposed) return;
    this.words = [...words];
    const token = ++this.token;
    if (!microphoneEnabled()) return;
    try { await this.ensure().start(this.words); }
    catch (error) {
      if (this.token === token && microphoneEnabled() && !this.disposed) this.emit('error', error?.message || 'init-failed');
    }
  }
  stop() { this.words = null; this.token++; this.adapter?.stop(); }
  release() {
    this.token++;
    const adapter = this.adapter; this.adapter = null;
    try { adapter?.dispose ? adapter.dispose() : adapter?.stop(); } catch { /* タッチで継続 */ }
  }
  dispose() { this.words = null; this.disposed = true; this.unsubscribe(); this.release(); }
}
