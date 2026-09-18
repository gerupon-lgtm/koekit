// 効果音（Web Audio API で合成）— 画像/音声素材が未用意の間の仮実装。
//
// - 正解音（鳴き声の代わり）: 結果表示中＝認識停止中に鳴らすため発話に干渉しない
// - フォーカス移動音（tick）: 移動中は認識アクティブなので、短く・小さく。
//   実機で認識に影響したら tickGain を下げる/enabledTick=false にする（A/B区分・フィールド調整）
// - 認識に使う 16kHz キャプチャ用 AudioContext とは別に、出力専用の AudioContext を持つ。

const CFG = {
  masterGain: 0.22,  // 全体音量
  tickGain: 0.05,    // 移動tickは控えめ（発話に影響しないレベル）
  enabledTick: true, // 実機で干渉したら false に
};

let _ctx = null;
function ctx() {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  // ユーザー操作後に resume（自動再生ポリシー対策）
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
  return _ctx;
}

/** 出力専用 AudioContext を起こす。最初のユーザー操作（はじめる等）で呼ぶと以後鳴らせる。 */
export function primeAudio() { ctx(); }

/** 単発トーン。env で音量エンベロープをかける。 */
function tone(freq, start, dur, gain, type = 'sine') {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  const peak = gain * CFG.masterGain;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(ac.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

/**
 * フォーカス移動の tick（短く小さいクリック）。認識に干渉しない前提。
 * 送り間隔 intervalMs を渡すと、速い（間隔小）ほど高音・遅い（間隔大）ほど低音にする。
 * ステップごとに鳴らすので、cadence（鳴る速さ）は移動の加減速・フェイントに自然に追従する。
 * @param {number} [intervalMs] ルーレットが tick で渡す現在の送り間隔
 */
export function playTick(intervalMs = 100) {
  if (!CFG.enabledTick) return;
  const lo = 40, hi = 340; // 想定する間隔レンジ
  const t = Math.max(0, Math.min(1, (intervalMs - lo) / (hi - lo)));
  const freq = 1000 - t * (1000 - 420); // 速い→約1000Hz / 遅い→約420Hz
  tone(freq, 0, 0.03, CFG.tickGain, 'triangle');
}

/** 正解音（鳴き声の代わり・結果表示中＝認識停止中に鳴らす）。明るい上行 3 音。 */
export function playCorrect() {
  tone(523.25, 0.00, 0.14, 0.9, 'sine');  // C5
  tone(659.25, 0.10, 0.14, 0.9, 'sine');  // E5
  tone(783.99, 0.20, 0.22, 0.9, 'sine');  // G5
}

/** レベルクリアのファンファーレ。 */
export function playClear() {
  tone(523.25, 0.00, 0.14, 0.9);          // C5
  tone(659.25, 0.12, 0.14, 0.9);          // E5
  tone(783.99, 0.24, 0.14, 0.9);          // G5
  tone(1046.5, 0.36, 0.30, 0.9);          // C6
}

/** ゲームオーバー（下行 2 音）。 */
export function playGameover() {
  tone(392.00, 0.00, 0.22, 0.8, 'sine');  // G4
  tone(261.63, 0.18, 0.34, 0.8, 'sine');  // C4
}

/** スタート/ストップの軽い合図（任意）。 */
export function playBlip(freq = 440) { tone(freq, 0, 0.06, 0.5, 'square'); }

/** カウントダウンの1秒ごとのビープ（きおくめくりの記憶提示）。はっきり聞こえる「ピッ」。 */
export function playCountdownTick() {
  tone(1000, 0, 0.14, 1.6, 'triangle');
}

/** タイムアップの効果音。目覚まし時計のベルのような「ジリリリリ」（金属音＋速いトレモロ）。 */
export function playTimeUp() {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const dur = 0.9;
  // 音量エンベロープ（マスター）
  const master = ac.createGain(); master.connect(ac.destination);
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.linearRampToValueAtTime(0.9 * CFG.masterGain, t0 + 0.02);
  master.gain.setValueAtTime(0.9 * CFG.masterGain, t0 + dur - 0.12);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  // 速いトレモロ（クラッパーの連打＝ジリリリ）
  const trem = ac.createGain(); trem.connect(master);
  trem.gain.setValueAtTime(0.5, t0);
  const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 44;
  const lfoGain = ac.createGain(); lfoGain.gain.value = 0.5;
  lfo.connect(lfoGain); lfoGain.connect(trem.gain);
  lfo.start(t0); lfo.stop(t0 + dur);
  // 明るい金属音（複数倍音）
  for (const [f, g] of [[1200, 0.5], [1500, 0.4], [2400, 0.2]]) {
    const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const og = ac.createGain(); og.gain.value = g;
    o.connect(og); og.connect(trem);
    o.start(t0); o.stop(t0 + dur);
  }
}

/** 実機調整用: tick 音量や有効/無効を後から変える。 */
export function configureSfx(opts = {}) { Object.assign(CFG, opts); }
