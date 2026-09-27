// 読み上げ制御（基本設計 MG-T03）
// - 端末の読み上げ機能（speechSynthesis）で1文ずつ読む
// - 開始しない／終わらない場合は打ち切って次へ（オフライン時など）
// - 読み上げ中かどうかを外へ知らせる（聞き取りを止めるため）
import { splitSentences } from './story.js';

const START_TIMEOUT_MS = 5000; // 【想定】開始しなければ打ち切る
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

export class Reader {
  constructor({ log = () => {} } = {}) {
    this.enabled = true;
    this.rate = 1;
    this.voiceURI = '';
    this.voices = [];
    this.log = log;
    this.token = 0;
    this.keep = [];
    this.listeners = new Set();
    this.busy = false;
    if (synth) {
      this.loadVoices();
      synth.addEventListener?.('voiceschanged', () => this.loadVoices());
      let tries = 0;
      const t = setInterval(() => { this.loadVoices(); if (this.voices.length || ++tries > 10) clearInterval(t); }, 500);
    }
  }

  get available() { return !!synth; }

  loadVoices() {
    const all = synth.getVoices();
    this.allVoiceCount = all.length;
    this.voices = all.filter(v => /^ja/i.test(v.lang));
    if (!this.voices.find(v => v.voiceURI === this.voiceURI)) {
      const best = this.voices.find(v => v.localService) || this.voices[0];
      this.voiceURI = best ? best.voiceURI : '';
    }
    this.listeners.forEach(fn => fn({ type: 'voices' }));
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  setBusy(b) { if (this.busy !== b) { this.busy = b; this.listeners.forEach(fn => fn({ type: 'busy', busy: b })); } }

  stop() {
    this.token++;
    this.keep = [];
    if (synth) synth.cancel();
    this.setBusy(false);
  }

  // items: [{ text, onStart }] を順に読む。読み終わり／中断で resolve（中断なら false）
  async speak(items) {
    this.stop();
    if (!this.enabled || !synth) return true;
    const my = ++this.token;
    this.setBusy(true);
    for (const item of items) {
      for (const s of splitSentences(item.text)) {
        if (my !== this.token) return false;
        item.onStart?.();
        await this.speakOne(s, my);
      }
    }
    if (my !== this.token) return false;
    this.setBusy(false);
    return true;
  }

  speakOne(text, my) {
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      const v = this.voices.find(x => x.voiceURI === this.voiceURI);
      if (v) u.voice = v;
      u.lang = 'ja-JP';
      u.rate = this.rate;
      const t0 = performance.now();
      let done = false;
      const finish = () => { if (done) return; done = true; clearTimeout(guard); this.keep = this.keep.filter(x => x !== u); resolve(); };
      const guard = setTimeout(() => {
        if (my !== this.token) return finish();
        this.log(`⚠ ${START_TIMEOUT_MS / 1000}秒たっても開始しないので打ち切り「${text.slice(0, 10)}…」`);
        synth.cancel();
        finish();
      }, START_TIMEOUT_MS);
      u.onstart = () => {
        clearTimeout(guard);
        this.log(`開始 ${Math.round(performance.now() - t0)}ms 声=${v ? v.name : '既定'}`);
        // 終わりの合図が来ない端末への保険（文の長さに応じた上限）
        setTimeout(() => { if (!done) { this.log('⚠ 終わりの合図がないので次へ'); finish(); } }, 8000 + text.length * 400 / this.rate);
      };
      u.onend = finish;
      u.onerror = e => { if (e.error !== 'interrupted' && e.error !== 'canceled') this.log(`✕ エラー ${e.error}`); finish(); };
      this.keep.push(u); // 途中で止まる不具合の回避（参照を保持）
      synth.speak(u);
    });
  }
}
