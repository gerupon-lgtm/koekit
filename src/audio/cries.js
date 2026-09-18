// 鳴き声・効果音の合成（Web Audio API）。素材（実録音）が用意される前の仮の音、または採用してそのまま使う。
// デフォルメされた“それっぽい”音。オシレータ＋エンベロープ＋フィルタ＋ノイズ＋ビブラート/トレモロで作る。
// 実素材が届いたら、各所の呼び出しを録音再生へ差し替えられる。

let _ctx = null;
function ctx() {
  if (typeof window === 'undefined') return null;
  if (!_ctx) { try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
  return _ctx;
}
/** 最初のユーザー操作で呼ぶと以後鳴らせる。 */
export function primeCries() { ctx(); }

const MASTER = 0.28;

// 単一のオシレータ・ボイス（周波数エンベロープ＋音量エンベロープ＋任意のフィルタ/ビブラート/トレモロ）
function voice(ac, o) {
  const { type = 'sine', f0, f1 = null, t0 = 0, dur, gain = 1, filter, vibrato, trem } = o;
  const start = ac.currentTime + t0;
  const osc = ac.createOscillator(); osc.type = type;
  const g = ac.createGain();
  let node = osc;
  if (filter) {
    const bi = ac.createBiquadFilter();
    bi.type = filter.type || 'bandpass';
    bi.frequency.value = filter.freq || 1000;
    if (filter.Q) bi.Q.value = filter.Q;
    node.connect(bi); node = bi;
  }
  node.connect(g); g.connect(ac.destination);

  osc.frequency.setValueAtTime(f0, start);
  if (f1 != null) osc.frequency.linearRampToValueAtTime(f1, start + dur);
  if (vibrato) {
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = vibrato.rate; lg.gain.value = vibrato.depth;
    lfo.connect(lg); lg.connect(osc.frequency);
    lfo.start(start); lfo.stop(start + dur + 0.05);
  }
  const peak = gain * MASTER;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + Math.min(0.03, dur * 0.25));
  g.gain.setValueAtTime(peak, start + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  if (trem) { // 音量を揺らす（かえるのビリビリ等）
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.type = 'square'; lfo.frequency.value = trem.rate; lg.gain.value = peak * trem.depth;
    lfo.connect(lg); lg.connect(g.gain);
    lfo.start(start); lfo.stop(start + dur + 0.05);
  }
  osc.start(start); osc.stop(start + dur + 0.05);
}

function noise(ac, { t0 = 0, dur, gain = 1, filter }) {
  const start = ac.currentTime + t0;
  const buf = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * dur)), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(); src.buffer = buf;
  let node = src;
  if (filter) { const bi = ac.createBiquadFilter(); bi.type = filter.type; bi.frequency.value = filter.freq; node.connect(bi); node = bi; }
  const g = ac.createGain(); node.connect(g); g.connect(ac.destination);
  g.gain.setValueAtTime(gain * MASTER, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.start(start); src.stop(start + dur + 0.02);
}

// ---- 動物（デフォルメ）----
export function cat() { const ac = ctx(); if (!ac) return; // ニャー
  voice(ac, { type: 'sawtooth', f0: 540, f1: 900, t0: 0, dur: 0.15, gain: 0.5, filter: { type: 'bandpass', freq: 1200, Q: 6 }, vibrato: { rate: 14, depth: 18 } });
  voice(ac, { type: 'sawtooth', f0: 900, f1: 440, t0: 0.15, dur: 0.33, gain: 0.5, filter: { type: 'bandpass', freq: 1000, Q: 6 }, vibrato: { rate: 12, depth: 24 } });
}
export function dog() { const ac = ctx(); if (!ac) return; // ワン
  noise(ac, { t0: 0, dur: 0.05, gain: 0.4, filter: { type: 'highpass', freq: 700 } });
  voice(ac, { type: 'sawtooth', f0: 330, f1: 150, t0: 0, dur: 0.17, gain: 0.75, filter: { type: 'lowpass', freq: 1300 } });
}
export function cow() { const ac = ctx(); if (!ac) return; // モー
  voice(ac, { type: 'sawtooth', f0: 175, f1: 120, t0: 0, dur: 0.7, gain: 0.75, filter: { type: 'lowpass', freq: 700 }, vibrato: { rate: 6, depth: 6 } });
}
export function bird() { const ac = ctx(); if (!ac) return; // ピヨピヨ
  for (let k = 0; k < 3; k++) {
    const t = k * 0.14;
    voice(ac, { type: 'sine', f0: 2600, f1: 3400, t0: t, dur: 0.06, gain: 0.35 });
    voice(ac, { type: 'sine', f0: 3400, f1: 2500, t0: t + 0.06, dur: 0.05, gain: 0.3 });
  }
}
export function frog() { const ac = ctx(); if (!ac) return; // ケロケロ
  for (let k = 0; k < 2; k++) {
    voice(ac, { type: 'square', f0: 150, f1: 120, t0: k * 0.24, dur: 0.18, gain: 0.5, filter: { type: 'lowpass', freq: 900 }, trem: { rate: 28, depth: 0.9 } });
  }
}
export function sheep() { const ac = ctx(); if (!ac) return; // メェ
  voice(ac, { type: 'sawtooth', f0: 380, f1: 340, t0: 0, dur: 0.5, gain: 0.55, filter: { type: 'bandpass', freq: 1100, Q: 5 }, vibrato: { rate: 9, depth: 30 } });
}

// ---- 乗り物・物（合成が得意）----
export function carHorn() { const ac = ctx(); if (!ac) return; // プッ プー（2回のクラクション）
  const honk = (t, dur) => {
    voice(ac, { type: 'square', f0: 440, t0: t, dur, gain: 0.45, filter: { type: 'lowpass', freq: 2200 } });
    voice(ac, { type: 'square', f0: 554, t0: t, dur, gain: 0.4, filter: { type: 'lowpass', freq: 2200 } });
  };
  honk(0.00, 0.14);   // プッ
  honk(0.24, 0.30);   // プー（長め）
}
export function siren() { const ac = ctx(); if (!ac) return; // ピーポー
  const seq = [980, 760, 980, 760];
  seq.forEach((f, i) => voice(ac, { type: 'sine', f0: f, t0: i * 0.34, dur: 0.33, gain: 0.4 }));
}
// 日本の踏切の「カンカンカン」。単一の鐘を叩く音を一定間隔で繰り返す。
const CROSSING_BASE = 1150; // 鐘の音の高さ
function bellHit(ac, t) {
  // 明るい金属音＋非整数の上部倍音＋打撃のカチッ。速い減衰で「カン」。
  voice(ac, { type: 'square', f0: CROSSING_BASE, t0: t, dur: 0.13, gain: 0.32, filter: { type: 'bandpass', freq: CROSSING_BASE, Q: 8 } });
  voice(ac, { type: 'sine', f0: CROSSING_BASE * 2.6, t0: t, dur: 0.09, gain: 0.13 });
  noise(ac, { t0: t, dur: 0.012, gain: 0.12, filter: { type: 'highpass', freq: 2800 } });
}
export function crossingBell() { const ac = ctx(); if (!ac) return; // カン カン カン（同じ音の繰り返し）
  for (let k = 0; k < 7; k++) bellHit(ac, k * 0.15);
}

/** デモ・割当用の一覧（ラベルと関数）。 */
export const CRIES = [
  { key: 'cat', label: 'ねこ', fn: cat },
  { key: 'dog', label: 'いぬ', fn: dog },
  { key: 'cow', label: 'うし', fn: cow },
  { key: 'bird', label: 'とり', fn: bird },
  { key: 'frog', label: 'かえる', fn: frog },
  { key: 'sheep', label: 'ひつじ', fn: sheep },
  { key: 'carHorn', label: 'じどうしゃ', fn: carHorn },
  { key: 'siren', label: 'きゅうきゅうしゃ', fn: siren },
  { key: 'crossing', label: 'ふみきり', fn: crossingBell },
];
