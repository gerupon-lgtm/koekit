import { createSpeechInput } from '../src/speech/index.js';
import { publicMethod } from '../src/speech/public-method.js';

// A session is an input interval, not a game-long open microphone recognizer.
export class SpeechSession {
  constructor({ method, factory = () => createSpeechInput(publicMethod(method)), onText = () => {}, onState = () => {}, restartMs = 300 } = {}) {
    Object.assign(this, { factory, onText, onState, restartMs });
    this.adapter = null;
    this.generation = 0;
    this.handlers = {};
    this.active = false;
    this.disposed = false;
  }
  async open(words, context) {
    if (this.disposed) return;
    this.close();
    if (!words.length) return;
    const generation = this.generation;
    const valid = () => this.active && this.generation === generation && !this.disposed;
    try {
      this.adapter ||= this.factory();
      this.active = true;
      const fail = () => {
        if (!valid()) return;
        this.close();
        this.onState('denied');
      };
      this.handlers = {
        result: raw => { if (valid() && raw) this.onText(raw, context); },
        error: fail,
        restart: () => { if (valid()) this.onState('restarting'); },
        end: () => {
          if (!valid()) return;
          clearTimeout(this.restartTimer);
          this.onState('restarting');
          this.restartTimer = setTimeout(() => { if (valid()) void this.open(words, context); }, this.restartMs);
        },
      };
      for (const [event, fn] of Object.entries(this.handlers)) this.adapter.on(event, fn);
      // Set before start: synchronous init/recognizer errors must stay denied.
      this.onState('listening');
      await this.adapter.start(words);
    } catch {
      if (this.generation === generation) {
        this.close();
        this.onState('denied');
      }
    }
  }
  close() {
    this.active = false;
    this.generation++;
    clearTimeout(this.restartTimer);
    for (const [event, fn] of Object.entries(this.handlers)) this.adapter?.off?.(event, fn);
    this.handlers = {};
    try { this.adapter?.stop(); } catch { /* Touch remains available. */ }
    this.onState('idle');
  }
  dispose() {
    this.close();
    this.disposed = true;
    try { this.adapter?.dispose?.(); } catch { /* Navigating away still works. */ }
    this.adapter = null;
  }
}
