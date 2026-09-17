// どうぶつめくり コントローラ（フェーズ0：レベル0 計測／フェーズ1：レベル1〜5・延長）
//
// 守っている設計:
// - 常時認識にしない（区間ごと開始/停止・PhaseMachine）／result で認識停止
// - 2段階確定（位置語→図示→確定語）を省略しない（C-3）／言い直しは失敗でない（要件8.4）
// - ゲームオーバーを緩和しない（5回中3回・確定6）／確定待ちの周囲音対策は入れない（確定7）
// - タッチのみで全操作可（マイク未許可でも遊べる・C-2/F-016）／文字を使わない（数字と版/©のみ）
// - 動物の絵/鳴き声は未用意のため仮置き（正解カード=赤丸、正解音=Web Audio）

import { createSpeechInput, METHODS } from '../src/speech/index.js';
import { wordsForKeys } from '../src/speech/vocabulary.js';
import { PhaseMachine, PHASES } from '../src/game/phase.js';
import { Roulette } from '../src/game/roulette.js';
import { Judge } from '../src/game/judge.js';
import { getLevel, LEVELS } from '../src/game/levels.js';
import { Recorder } from '../src/log/recorder.js';
import { toCSV } from '../src/log/csv.js';
import { computeMetrics, judge as judgeMetrics, THRESHOLDS } from '../src/log/metrics.js';
import * as sfx from '../src/audio/sfx.js';

const $ = s => document.querySelector(s);
const METHOD_KEY = 'koekit.method';
const FAKEOUT_LEVELS = new Set(['3', '4', '5', 'extra']); // フェイント停止を有効にするレベル

// 位置キー → 3×3グリッドのセル(r,c)と矢印回転(deg)。center は中点。
const POS = {
  up:        { r: 1, c: 2, deg: 0 },
  down:      { r: 3, c: 2, deg: 180 },
  left:      { r: 2, c: 1, deg: 270 },
  right:     { r: 2, c: 3, deg: 90 },
  center:    { r: 2, c: 2, deg: null },
  upleft:    { r: 1, c: 1, deg: 315 },
  upright:   { r: 1, c: 3, deg: 45 },
  downleft:  { r: 3, c: 1, deg: 225 },
  downright: { r: 3, c: 3, deg: 135 },
};

// ---- 状態 ----
let method = resolveInitialMethod();
let adapter = null;
let phase = null;
let roulette = null;
let judge = null;
let level = null;
let mode = 'roulette';        // 'roulette'(レベル0) | 'board'(レベル1+)
let orderedKeys = [];         // 盤面のフォーカス移動順（グリッド行優先）
const cardEls = new Map();    // key -> card要素
let targetKey = null;         // 止まった位置
let selectedKey = null;       // 言った/選んだ位置
let trialResolved = false;    // 確定の二重発火防止（E-07）
let lastPosRaw = '', lastPosElapsed = 0;
let sessionRestart = 0;
let micDenied = false;
const recorder = new Recorder();

// ---- 画面 ----
function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
  if (name === 'panel') renderPanel();
}

// ---- 方式 ----
function resolveInitialMethod() {
  try {
    const q = new URLSearchParams(location.search).get('method');
    if (q) return q;
    const saved = localStorage.getItem(METHOD_KEY);
    if (saved) return saved;
  } catch {}
  return METHODS.VOSK;
}
function setMethod(m) { method = m; try { localStorage.setItem(METHOD_KEY, m); } catch {} }

// ---- 受け付け状態（F-003） ----
function setMicState(state) {
  const el = $('#mic-state'), stage = $('#stage');
  el.classList.remove('listening', 'denied', 'restarting');
  stage.classList.remove('listening', 'restarting');
  if (state === 'listening') { el.classList.add('listening'); stage.classList.add('listening'); }
  else if (state === 'restarting') { el.classList.add('restarting'); stage.classList.add('restarting'); }
  else if (state === 'denied') { el.classList.add('denied'); }
}

// ---- 音声 ----
function buildAdapter() {
  const a = createSpeechInput(method);
  a.on('result', (raw, ms) => { if (phase) phase.handleRaw(raw, ms); });
  a.on('restart', n => { sessionRestart = n; setMicState('restarting'); });
  a.on('error', code => onSpeechError(code));
  return a;
}
function onSpeechError(code) {
  if (/not-allowed|denied|service-not-allowed|not-supported/i.test(code)) { micDenied = true; setMicState('denied'); }
  // モデル取得失敗等（方式C）はタッチ継続。方式切替は計測パネルから
}
function startListening(keys) {
  if (!adapter || micDenied) return;
  adapter.start(wordsForKeys(keys));
  setMicState('listening');
}
function stopListening() { if (adapter) adapter.stop(); }

// ---- 盤面描画（T-015） ----
function renderBoard() {
  const board = $('#board');
  board.innerHTML = '';
  cardEls.clear();
  // フォーカス移動順：グリッド行優先（左上→右下に自然に流れる）
  orderedKeys = [...level.vocab].sort((a, b) => (POS[a].r - POS[b].r) || (POS[a].c - POS[b].c));
  for (const key of level.vocab) {
    const el = document.createElement('div');
    el.className = 'card';
    el.style.gridRow = POS[key].r;
    el.style.gridColumn = POS[key].c;
    el.dataset.key = key;
    el.innerHTML = '<div class="animal"></div>';
    el.addEventListener('click', () => onCardTap(key));
    board.appendChild(el);
    cardEls.set(key, el);
  }
}
function setFocus(key) {
  cardEls.forEach((el, k) => el.classList.toggle('focus', k === key));
}
function clearBoardMarks() {
  cardEls.forEach(el => { el.classList.remove('focus', 'selected', 'flipped', 'correct'); });
  showFigure(null);
}

// ---- 図示（矢印/中点・T-017） ----
function showFigure(key) {
  const fig = $('#figure'), svg = fig.querySelector('svg');
  const arrow = fig.querySelector('.arrow'), dot = fig.querySelector('.dot');
  if (!key) { fig.classList.remove('show'); return; }
  if (POS[key].deg === null) { arrow.style.display = 'none'; dot.style.display = 'block'; svg.style.transform = 'none'; }
  else { arrow.style.display = 'block'; dot.style.display = 'none'; svg.style.transform = `rotate(${POS[key].deg}deg)`; }
  fig.classList.add('show');
}

// ---- コントロール表示（区間で出し分け） ----
function updateControls(ph) {
  const spin = $('#spin-btn'), confirm = $('#confirm-btn');
  const isSpin = (ph === PHASES.AWAIT_START || ph === PHASES.AWAIT_STOP);
  spin.classList.toggle('hidden', !isSpin);
  confirm.classList.toggle('hidden', ph !== PHASES.AWAIT_CONFIRM);
  if (!micDenied) setMicState(ph === PHASES.RESULT ? 'idle' : 'listening');
}
function updateSpinIcon(spinning) {
  $('#spin-icon').innerHTML = spinning
    ? '<rect x="6" y="6" width="12" height="12" rx="2"/>'
    : '<path d="M8 5v14l11-7z"/>';
}

// ---- レベル開始 ----
function startLevel(id) {
  sfx.primeAudio();
  level = getLevel(id);
  if (!level) return;
  mode = id === '0' ? 'roulette' : 'board';
  micDenied = false; sessionRestart = 0;

  if (!adapter) adapter = buildAdapter();
  else { adapter.stop?.(); } // 方式が変わっていれば作り直し
  if (adapter.name !== method) { try { adapter.dispose?.(); } catch {} adapter = buildAdapter(); }

  // ルーレット構成（盤面では faces=札数、レベル3以降でフェイント、延長で高速）
  const cfg = mode === 'board'
    ? { faces: level.vocab.length, speedFactor: level.speedFactor || 1,
        fakeoutProb: FAKEOUT_LEVELS.has(id) ? 0.5 : 0, fakeoutMax: FAKEOUT_LEVELS.has(id) ? 2 : 0 }
    : {};
  roulette = new Roulette(cfg);
  roulette.on('tick', (v, interval) => onTick(v, interval));
  roulette.on('start', () => updateSpinIcon(true));
  roulette.on('stopping', () => updateSpinIcon(false));
  roulette.on('stop', v => onRouletteStop(v));

  judge = new Judge();
  phase = new PhaseMachine({ startListening, stopListening });
  phase.setLevelVocab(level.vocab);
  phase.on('match', onMatch);
  phase.on('ignored', onIgnored);
  phase.on('enter', ph => updateControls(ph));

  // 表示切替
  $('#roulette-num').classList.toggle('hidden', mode !== 'roulette');
  $('#board').classList.toggle('hidden', mode !== 'board');
  if (mode === 'roulette') $('#roulette-num').textContent = '0';
  else renderBoard();

  show('game');
  beginTrial();
}

function beginTrial() {
  targetKey = null; selectedKey = null; trialResolved = false;
  lastPosRaw = ''; lastPosElapsed = 0;
  if (mode === 'board') clearBoardMarks();
  updateSpinIcon(false);
  phase.to(PHASES.AWAIT_START); // マイク許可はこの区間の start で要求される
}

// ---- ルーレット イベント ----
function onTick(v, interval) {
  if (mode === 'roulette') {
    $('#roulette-num').textContent = v;   // レベル0は計測保護のため移動音を鳴らさない
  } else {
    setFocus(orderedKeys[v]);
    sfx.playTick(interval);               // 盤面は移動音（速さでピッチ・cadence追従）
  }
}
function onRouletteStop(v) {
  if (mode === 'roulette') {
    // レベル0（練習）：少し置いて次の抽選へ
    setTimeout(() => { if (phase && level && level.id === '0') phase.to(PHASES.AWAIT_START); }, 700);
  } else {
    targetKey = orderedKeys[v];
    setFocus(targetKey);                  // 止まった位置を残す
    phase.to(PHASES.AWAIT_POSITION);      // 位置語を待つ
  }
}

// ---- 認識マッチ ----
function onMatch(key, raw, elapsedMs) {
  const ph = phase.phase;
  if (ph === PHASES.AWAIT_START && key === 'start') {
    roulette.start(); phase.to(PHASES.AWAIT_STOP);
    return;
  }
  if (ph === PHASES.AWAIT_STOP && key === 'stop') {
    if (mode === 'roulette') {
      recorder.add({ method: adapter.name, level: level.id, phase: PHASES.AWAIT_STOP,
        expected: 'stop', rawText: raw, matchedKey: key, elapsedMs, outcome: 'correct', sessionRestart });
      phase.to(PHASES.RESULT); roulette.stop();
    } else {
      phase.to(PHASES.RESULT);  // 惰性の間は認識を止める
      roulette.stop();          // 'stop' で AWAIT_POSITION へ
    }
    return;
  }
  // 盤面: 位置語（言い直し含む）
  if (mode === 'board' && (ph === PHASES.AWAIT_POSITION || ph === PHASES.AWAIT_CONFIRM) && POS[key]) {
    lastPosRaw = raw; lastPosElapsed = elapsedMs;
    selectPosition(key);
    return;
  }
  // 盤面: 確定
  if (mode === 'board' && ph === PHASES.AWAIT_CONFIRM && key === 'confirm') {
    doConfirm();
  }
}

function onIgnored(raw) {
  if (!raw) return;
  if (mode === 'roulette' && phase.phase === PHASES.AWAIT_STOP) {
    recorder.add({ method: adapter.name, level: level.id, phase: PHASES.AWAIT_STOP,
      expected: 'stop', rawText: raw, matchedKey: '', elapsedMs: 0, outcome: 'ignored', sessionRestart });
  } else if (mode === 'roulette' && phase.phase === PHASES.AWAIT_START) {
    recorder.add({ method: adapter.name, level: level.id, phase: PHASES.AWAIT_START,
      expected: '', rawText: raw, matchedKey: '', elapsedMs: 0, outcome: 'ignored', sessionRestart });
  } else if (mode === 'board' && (phase.phase === PHASES.AWAIT_POSITION || phase.phase === PHASES.AWAIT_CONFIRM)) {
    // 認識されなかった発話＝カウントしない（要件8.4）。rawTextは補強用に残す
    recorder.add({ method: adapter.name, level: level.id, phase: phase.phase,
      expected: targetKey || '', rawText: raw, matchedKey: '', elapsedMs: 0, outcome: 'ignored', sessionRestart });
  }
}

// ---- 位置の選択（図示）／確定 ----
function selectPosition(key) {
  selectedKey = key;
  cardEls.forEach((el, k) => el.classList.toggle('selected', k === key));
  showFigure(key);
  if (phase.phase === PHASES.AWAIT_POSITION) phase.to(PHASES.AWAIT_CONFIRM); // 確定語＋言い直しを待つ
  else updateControls(PHASES.AWAIT_CONFIRM); // 言い直し時は区間そのまま、確定ボタンは出したまま
}

function doConfirm() {
  if (trialResolved || !selectedKey) return;
  trialResolved = true;
  phase.to(PHASES.RESULT); // 認識停止（結果表示中）

  const correct = (selectedKey === targetKey);
  const card = cardEls.get(selectedKey);
  card.classList.add('flipped');
  if (correct) { card.classList.add('correct'); sfx.playCorrect(); }
  else { sfx.playBlip(220); }

  recorder.add({ method: adapter.name, level: level.id, phase: PHASES.AWAIT_CONFIRM,
    expected: targetKey, rawText: lastPosRaw, matchedKey: selectedKey,
    elapsedMs: lastPosElapsed, outcome: correct ? 'correct' : 'wrong', sessionRestart });

  const status = judge.record(correct ? 'correct' : 'wrong');
  $('#confirm-btn').classList.add('hidden');

  setTimeout(() => {
    if (status === 'clear') showCertificate('clear', level.id);
    else if (status === 'gameover') showCertificate('gameover', level.id);
    else beginTrial();
  }, 1200);
}

// ---- タッチ操作（F-016） ----
function onSpinTouch() {
  if (!roulette) return;
  if (!roulette.spinning) { roulette.start(); phase.to(PHASES.AWAIT_STOP); }
  else if (roulette.state === 'spinning') {
    if (mode === 'roulette') { phase.to(PHASES.RESULT); roulette.stop(); }
    else { phase.to(PHASES.RESULT); roulette.stop(); }
  }
}
function onCardTap(key) {
  // 停止後（位置選択/確定中）だけタップで位置を選べる。2段階確定はタッチでも維持
  if (mode !== 'board' || !targetKey || trialResolved) return;
  if (phase.phase !== PHASES.AWAIT_POSITION && phase.phase !== PHASES.AWAIT_CONFIRM) return;
  lastPosRaw = ''; lastPosElapsed = 0;
  selectPosition(key);
}

// ---- 認定書（S-06 / T-023）文字を使わずメダル＋星 ----
function showCertificate(kind, levelId) {
  const idx = LEVELS.findIndex(l => l.id === levelId);
  const stars = levelId === 'extra' ? 6 : Math.max(1, idx); // レベル番号ぶんの星（延長は最大）
  if (kind === 'clear') sfx.playClear(); else sfx.playGameover();
  const medal = $('#medal');
  medal.className = 'medal ' + (kind === 'clear' ? 'clear' : 'over');
  const starsEl = $('#cert-stars');
  starsEl.innerHTML = '';
  const litColor = kind === 'clear' ? '#ffb300' : '#bbb';
  for (let i = 0; i < 6; i++) {
    const lit = i < stars;
    starsEl.insertAdjacentHTML('beforeend',
      `<svg viewBox="0 0 24 24" fill="${lit ? litColor : '#eee'}"><path d="M12 2l3 6 6 .5-4.5 4 1.5 6-6-3.5L6 18.5 7.5 12.5 3 8.5 9 8z"/></svg>`);
  }
  $('#cert').dataset.kind = kind;
  $('#cert').dataset.level = levelId;
  show('cert');
}
function onCertNext() {
  const kind = $('#cert').dataset.kind, id = $('#cert').dataset.level;
  if (kind === 'gameover') { goTitle(); return; }
  // クリア: 次のレベルへ。5クリアで延長へ自動突入。延長クリアでタイトル（エンディング）
  if (id === '5') startLevel('extra');
  else if (id === 'extra') goTitle();
  else {
    const idx = LEVELS.findIndex(l => l.id === id);
    const next = LEVELS[idx + 1];
    startLevel(next ? next.id : '1');
  }
}

// ---- レベル選択（S-02 / T-025） ----
function buildLevelSelect() {
  const wrap = $('#level-select');
  wrap.innerHTML = '';
  for (const l of LEVELS) {
    const b = document.createElement('button');
    b.className = 'lv-btn';
    if (l.id === 'extra') b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2l3 6 6 .5-4.5 4 1.5 6-6-3.5L6 18.5 7.5 12.5 3 8.5 9 8z"/></svg>';
    else b.textContent = l.id;
    b.addEventListener('click', () => startLevel(l.id));
    wrap.appendChild(b);
  }
}

// ---- 終了/タイトル ----
function goTitle() {
  try { phase && phase.to(PHASES.RESULT); } catch {}
  try { adapter && (adapter.dispose ? adapter.dispose() : adapter.stop()); } catch {}
  adapter = null; roulette = null; phase = null; judge = null; level = null;
  setMicState('idle');
  show('title');
}

// ---- 計測パネル（S-07・レベル0のログで判定） ----
function renderPanel() {
  document.querySelectorAll('input[name="method"]').forEach(r => { r.checked = (r.value === method); });
  $('#method-note').textContent = method === METHODS.WEBSPEECH
    ? '※方式Aは検証専用。公開版では使わない（要件C-1）'
    : (method === METHODS.WEBSPEECH_LOCAL ? '※端末内WebSpeech。実機検証では ja-JP 非対応だった' : '');

  const all = recorder.getAll();
  const entries = all.filter(e => e.level === '0'); // 合格ラインはレベル0の計測で判定
  const m = computeMetrics(entries);
  const j = judgeMetrics(m);
  const fmt = (v, u = '') => v == null ? '—' : (Math.round(v * 100) / 100) + u;
  const badge = p => p === null ? '<span class="badge na">データなし</span>'
    : (p ? '<span class="badge pass">合格</span>' : '<span class="badge fail">未達</span>');
  const rows = [
    ['認識成功率', m.successRate == null ? '—' : Math.round(m.successRate * 100) + '%', '≥ ' + THRESHOLDS.successRateMin * 100 + '%', j.items.successRate],
    ['誤発動率', m.spuriousRate == null ? '—' : Math.round(m.spuriousRate * 100) + '% (' + m.spuriousCount + '件)', '≤ ' + THRESHOLDS.spuriousRateMax * 100 + '%', j.items.spurious],
    ['反映 中央値', fmt(m.elapsedMedian, 'ms'), '≤ ' + THRESHOLDS.elapsedMedianMaxMs + 'ms', j.items.elapsedMedian],
    ['反映 最大', fmt(m.elapsedMax, 'ms'), '≤ ' + THRESHOLDS.elapsedMaxMs + 'ms', j.items.elapsedMax],
    ['連続使用', m.maxRunWithoutDrop + '回', '≥ ' + THRESHOLDS.minRunWithoutDrop + '回', j.items.run],
  ];
  $('#metrics-body').innerHTML = rows.map(([n, v, t, p]) => `<tr><td>${n}</td><td>${v}</td><td>${t}</td><td>${badge(p)}</td></tr>`).join('');
  const ov = $('#overall');
  ov.className = 'badge ' + (!j.hasData ? 'na' : (j.overall ? 'pass' : 'fail'));
  ov.textContent = !j.hasData ? '—' : (j.overall ? '合格' : '未達');
  $('#log-count').textContent = String(all.length);
}
async function copyCSV() {
  const csv = toCSV(recorder.getAll());
  try { await navigator.clipboard.writeText(csv); $('#copy-area').style.display = 'none'; flash('#copy-csv', 'コピーしました'); }
  catch { const ta = $('#copy-area'); ta.style.display = 'block'; ta.value = csv; ta.focus(); ta.select(); }
}
function flash(sel, text) { const b = $(sel), old = b.textContent; b.textContent = text; setTimeout(() => { b.textContent = old; }, 1200); }

// ---- 配線 ----
buildLevelSelect();
$('#start-play').addEventListener('click', () => startLevel('0')); // はじめる＝練習（レベル0）
$('#spin-btn').addEventListener('click', onSpinTouch);
$('#confirm-btn').addEventListener('click', doConfirm);
$('#to-title').addEventListener('click', goTitle);
$('#to-panel').addEventListener('click', () => show('panel'));
$('#panel-back').addEventListener('click', () => show('title'));
$('#cert-next').addEventListener('click', onCertNext);
document.querySelectorAll('input[name="method"]').forEach(r => r.addEventListener('change', () => { setMethod(r.value); renderPanel(); }));
$('#copy-csv').addEventListener('click', copyCSV);
$('#clear-log').addEventListener('click', () => { recorder.clear(); renderPanel(); });
$('#mark-spurious').addEventListener('click', () => {
  recorder.add({ method, level: '0', phase: PHASES.AWAIT_STOP, expected: '', rawText: '', matchedKey: '', elapsedMs: 0, outcome: 'spurious', sessionRestart });
  renderPanel();
});
window.addEventListener('pagehide', goTitle);
