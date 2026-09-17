// 方式C アダプタ（Vosk / WebAssembly）— 本命。F-002 / 要件10.1 / T-008
//
// 実機検証で確定した実装（docs/field-check-results.md / probe/vosk6.html）:
// - クロスオリジン分離は不要（crossOriginIsolated=false でも動く）。mini-coi・CORS設定を入れない
// - モデルは `model/` を一段かませた tar.gz。R2公開URLから CORS設定なしで取得できた
// - 音声は AudioWorklet(vosk-capture) で 16kHz Float32 を取り込み、AudioBuffer(16kHz) にして
//   acceptWaveform へ渡す
// - vosk-browser はモデルを Cache Storage にキャッシュする（2回目以降は再取得しない＝オフライン利点）
//
// オフライン対応のため vosk-browser は lib/vosk/ に自前配置し、UMD を script で読み込む（CDN読みにしない）。

import { Emitter } from '../util/emitter.js';
import { METHODS, resolveModelUrl } from './config.js';

const LIB_URL = new URL('../../lib/vosk/vosk.js', import.meta.url).href;
const WORKLET_URL = new URL('./vosk-worklet.js', import.meta.url).href;

let _voskLibPromise = null;
function loadVoskLib() {
  if (typeof window !== 'undefined' && window.Vosk) return Promise.resolve(window.Vosk);
  if (_voskLibPromise) return _voskLibPromise;
  _voskLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LIB_URL;
    s.onload = () => window.Vosk ? resolve(window.Vosk) : reject(new Error('Vosk グローバル未定義'));
    s.onerror = () => reject(new Error('vosk.js の読み込み失敗'));
    document.head.appendChild(s);
  });
  return _voskLibPromise;
}

export class VoskAdapter extends Emitter {
  constructor({ modelUrl } = {}) {
    super();
    this.name = METHODS.VOSK;
    this._modelUrl = modelUrl || resolveModelUrl();
    this._model = null;
    this._rec = null;
    this._ac = null;
    this._node = null;
    this._src = null;
    this._stream = null;
    this._listening = false;
    this._inited = false;
    this._restartCount = 0;
    this._lastPartialAt = 0;
    this._lastPartial = '';
  }

  get restartCount() { return this._restartCount; }

  /** 方式Cを動かせる環境か（マイク・AudioWorklet・WASM）。モデル取得可否は start 時に判明する。 */
  async isAvailable() {
    return !!(
      typeof window !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia &&
      window.AudioContext &&
      window.WebAssembly &&
      // AudioWorklet 対応
      window.AudioContext.prototype && 'audioWorklet' in AudioContext.prototype
    );
  }

  /** モデル・マイク・音声グラフを1度だけ用意する（重い処理）。 */
  async _init() {
    if (this._inited) return;
    const Vosk = await loadVoskLib();
    // モデル読込（Cache Storage に載れば2回目以降は高速）
    this._model = await Vosk.createModel(this._modelUrl);

    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      video: false,
    });
    this._ac = new AudioContext({ sampleRate: 16000 });
    if (this._ac.state === 'suspended') await this._ac.resume();
    await this._ac.audioWorklet.addModule(WORKLET_URL);
    this._src = this._ac.createMediaStreamSource(this._stream);
    this._node = new AudioWorkletNode(this._ac, 'vosk-capture');
    this._node.port.onmessage = (ev) => this._onAudio(ev.data);
    this._src.connect(this._node);
    this._node.connect(this._ac.destination);

    // 画面が戻ったら AudioContext を再開（バックグラウンドで suspend されることがある）
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this._ac && this._ac.state === 'suspended') {
        this._ac.resume().catch(() => {});
      }
    });
    this._inited = true;
  }

  _onAudio(f32) {
    if (!this._listening || !this._rec || !f32 || !f32.length) return;
    try {
      const buf = this._ac.createBuffer(1, f32.length, 16000);
      if (buf.copyToChannel) buf.copyToChannel(f32, 0);
      else buf.getChannelData(0).set(f32);
      this._rec.acceptWaveform(buf);
    } catch (e) {
      this.emit('error', 'accept-waveform-failed');
    }
  }

  /**
   * 区間の語だけで認識を開始する。words で文法を絞り、雑音・区間外を拾いにくくする。
   * @param {string[]} words この区間で受け付ける表記の配列
   */
  async start(words) {
    this._listening = true;
    try {
      await this._init();
    } catch (e) {
      this._listening = false;
      // モデル取得やマイクの失敗。フォールバックは呼び出し側（コントローラ）が判断する
      this.emit('error', 'init-failed:' + (e && e.message ? e.message : 'unknown'));
      return;
    }
    // 語彙を絞った文法つき Recognizer を作り直す
    try {
      const grammar = (words && words.length) ? JSON.stringify(words) : undefined;
      this._rec = grammar
        ? new this._model.KaldiRecognizer(16000, grammar)
        : new this._model.KaldiRecognizer(16000);
    } catch (e) {
      this.emit('error', 'recognizer-failed');
      return;
    }
    this._lastPartial = '';
    this._lastPartialAt = performance.now();
    this._rec.on('partialresult', (m) => {
      const p = m?.result?.partial;
      if (p && p !== this._lastPartial) { this._lastPartial = p; this._lastPartialAt = performance.now(); }
    });
    this._rec.on('result', (m) => {
      const text = m?.result?.text || '';
      if (!text) return;
      // 所要ms: 発話終了の代理として最後に partial が動いた時刻からの経過を使う
      const elapsed = Math.max(0, Math.round(performance.now() - this._lastPartialAt));
      this.emit('result', text, elapsed);
    });
    this._rec.on('error', () => this.emit('error', 'recognizer-error'));
  }

  /** 認識を停止する（音声グラフ・モデルは保持し、次の start を速くする）。 */
  stop() {
    this._listening = false;
    if (this._rec) {
      try { this._rec.remove?.(); } catch { /* 無視 */ }
      this._rec = null;
    }
    this.emit('end');
  }

  /** 完全に破棄する（画面を離れるとき）。 */
  dispose() {
    this.stop();
    try { this._node?.disconnect(); this._src?.disconnect(); } catch { /* 無視 */ }
    try { this._stream?.getTracks().forEach(t => t.stop()); } catch { /* 無視 */ }
    try { this._ac?.close(); } catch { /* 無視 */ }
    this._inited = false;
  }
}
