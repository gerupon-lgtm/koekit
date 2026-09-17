// どうぶつめくり コントローラ（フェーズ0：レベル0 ルーレット）
//
// 音声入力層（差し替え可能）＋区間ステートマシン＋ルーレット＋ログ＋計測パネルを結線する。
// ゲーム側は方式名を知らない（createSpeechInput が返すインターフェースだけを使う）。
//
// 守っている設計:
// - 常時認識にしない。区間ごとに開始・停止（PhaseMachine 経由）
// - 2操作でレベル0に到達（要件5.1）。マイク未許可でもタッチで全操作可（C-2 / F-016）
// - 認識されなかった発話は失敗にせずカウント対象外（要件8.4）。ここでは metrics 用に区別して記録

import { createSpeechInput, METHODS } from '../src/speech/index.js';
import { wordsForKeys } from '../src/speech/vocabulary.js';
import { PhaseMachine, PHASES } from '../src/game/phase.js';
import { Roulette } from '../src/game/roulette.js';
import { Recorder } from '../src/log/recorder.js';
import { toCSV } from '../src/log/csv.js';
import { computeMetrics, judge, THRESHOLDS } from '../src/log/metrics.js';

const $ = sel => document.querySelector(sel);
const LEVEL = '0';
const METHOD_KEY = 'koekit.method';

// ---- 状態 ----
let method = resolveInitialMethod();
let adapter = null;
let phase = null;
let roulette = null;
const recorder = new Recorder();
let sessionRestart = 0;
let micDenied = false;

// ---- 画面遷移 ----
function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
  if (name === 'panel') renderPanel();
}

// ---- 方式の解決 ----
function resolveInitialMethod() {
  try {
    const q = new URLSearchParams(location.search).get('method');
    if (q) return q;
    const saved = localStorage.getItem(METHOD_KEY);
    if (saved) return saved;
  } catch { /* 無視 */ }
  return METHODS.VOSK; // 本命
}
function setMethod(m) {
  method = m;
  try { localStorage.setItem(METHOD_KEY, m); } catch { /* 無視 */ }
}

// ---- 受け付け状態の表示（F-003） ----
function setMicState(state) {
  const el = $('#mic-state');
  el.classList.remove('listening', 'denied', 'restarting');
  $('#stage').classList.remove('listening', 'restarting');
  if (state === 'listening') { el.classList.add('listening'); $('#stage').classList.add('listening'); }
  else if (state === 'restarting') { el.classList.add('restarting'); $('#stage').classList.add('restarting'); }
  else if (state === 'denied') { el.classList.add('denied'); }
}

// ---- 音声セッションの開始／終了 ----
function buildAdapter() {
  const a = createSpeechInput(method);
  a.on('result', (raw, elapsedMs) => { if (phase) phase.handleRaw(raw, elapsedMs); });
  a.on('restart', (n) => { sessionRestart = n; setMicState('restarting'); });
  a.on('error', (code) => onSpeechError(code));
  return a;
}

function onSpeechError(code) {
  // マイク拒否・未対応: タッチで遊べる状態を保つ（C-2 / E-01）
  if (/not-allowed|denied|service-not-allowed|not-supported/i.test(code)) {
    micDenied = true;
    setMicState('denied');
  }
  // モデル取得失敗など（方式C）: タッチ継続。方式切替は計測パネルから
  // （T-008 の異常系: フォールバックの明示。ここでは画面状態で示す）
}

// PhaseMachine のリスナ: 区間の語だけをアダプタへ渡して認識開始／停止
function startListening(keys) {
  if (!adapter || micDenied) return;
  adapter.start(wordsForKeys(keys));
  setMicState('listening');
}
function stopListening() {
  if (adapter) adapter.stop();
}

// ---- ゲーム開始（はじめる） ----
async function beginSession() {
  micDenied = false;
  sessionRestart = 0;
  adapter = buildAdapter();
  roulette = new Roulette();
  phase = new PhaseMachine({ startListening, stopListening });
  phase.setLevelVocab([]); // レベル0 は位置語なし

  roulette.on('tick', v => { $('#roulette-num').textContent = v; });
  roulette.on('start', () => updateSpinIcon(true));
  roulette.on('stopping', () => updateSpinIcon(false));
  roulette.on('stop', () => {
    // 出目確定 → 少し置いて次の試行（スタート待ち）へ
    setTimeout(() => { if (phase) phase.to(PHASES.AWAIT_START); }, 700);
  });

  phase.on('match', onMatch);
  phase.on('ignored', onIgnored);

  show('game');
  // マイク許可はこのユーザー操作を起点に要求される（adapter.start 内の getUserMedia / SR.start）
  phase.to(PHASES.AWAIT_START);
}

function onMatch(key, raw, elapsedMs) {
  if (phase.phase === PHASES.AWAIT_START && key === 'start') {
    roulette.start();
    phase.to(PHASES.AWAIT_STOP);
  } else if (phase.phase === PHASES.AWAIT_STOP && key === 'stop') {
    // 認識された停止＝成功として記録（レベル0の認識成功率の分子）
    recorder.add({
      method: adapter.name, level: LEVEL, phase: PHASES.AWAIT_STOP,
      expected: 'stop', rawText: raw, matchedKey: key, elapsedMs,
      outcome: 'correct', sessionRestart,
    });
    phase.to(PHASES.RESULT);   // 認識停止
    setMicState('idle');
    roulette.stop();           // 惰性で止まる（'stop' で次のスタート待ちへ）
  }
}

function onIgnored(raw) {
  if (!raw) return; // 空（無音）は記録しない
  if (phase.phase === PHASES.AWAIT_STOP) {
    // 停止しようとして認識されなかった発話＝「認識されなかった発話」（metrics の分母）
    recorder.add({
      method: adapter.name, level: LEVEL, phase: PHASES.AWAIT_STOP,
      expected: 'stop', rawText: raw, matchedKey: '', elapsedMs: 0,
      outcome: 'ignored', sessionRestart,
    });
  } else if (phase.phase === PHASES.AWAIT_START) {
    // スタートの認識ゆれ。metrics には効かせず、表記揺れ把握のため rawText だけ残す
    recorder.add({
      method: adapter.name, level: LEVEL, phase: PHASES.AWAIT_START,
      expected: '', rawText: raw, matchedKey: '', elapsedMs: 0,
      outcome: 'ignored', sessionRestart,
    });
  }
}

// ---- タッチ操作（F-016：音声なしでも完結） ----
function onSpinTouch() {
  if (!roulette) return;
  if (!roulette.spinning) {
    // 手動スタート（音声を使わない経路）
    roulette.start();
    if (phase) phase.to(PHASES.AWAIT_STOP);
  } else if (roulette.state === 'spinning') {
    // 手動ストップ（発話ではないので認識ログには残さない）
    if (phase) { phase.to(PHASES.RESULT); }
    setMicState('idle');
    roulette.stop();
  }
}
function updateSpinIcon(spinning) {
  // ▶（スタート） / ■（ストップ）
  $('#spin-icon').innerHTML = spinning
    ? '<rect x="6" y="6" width="12" height="12" rx="2"/>'
    : '<path d="M8 5v14l11-7z"/>';
}

function endSession() {
  try { phase && phase.to(PHASES.RESULT); } catch { /* 無視 */ }
  try { adapter && (adapter.dispose ? adapter.dispose() : adapter.stop()); } catch { /* 無視 */ }
  adapter = null; roulette = null; phase = null;
  setMicState('idle');
  $('#roulette-num').textContent = '0';
}

// ---- 計測パネル（S-07） ----
function renderPanel() {
  // 方式ラジオ
  document.querySelectorAll('input[name="method"]').forEach(r => { r.checked = (r.value === method); });
  $('#method-note').textContent = method === METHODS.WEBSPEECH
    ? '※方式Aは検証専用。公開版では使わない（要件C-1）'
    : (method === METHODS.WEBSPEECH_LOCAL ? '※端末内WebSpeech。実機検証では ja-JP 非対応だった（field-check-results.md）' : '');

  const entries = recorder.getAll();
  const m = computeMetrics(entries);
  const j = judge(m);
  const fmt = (v, unit = '') => v == null ? '—' : (Math.round(v * 100) / 100) + unit;
  const badge = p => p === null ? '<span class="badge na">データなし</span>'
    : (p ? '<span class="badge pass">合格</span>' : '<span class="badge fail">未達</span>');

  const rows = [
    ['認識成功率', m.successRate == null ? '—' : Math.round(m.successRate * 100) + '%', '≥ ' + THRESHOLDS.successRateMin * 100 + '%', j.items.successRate],
    ['誤発動率', m.spuriousRate == null ? '—' : Math.round(m.spuriousRate * 100) + '% (' + m.spuriousCount + '件)', '≤ ' + THRESHOLDS.spuriousRateMax * 100 + '%', j.items.spurious],
    ['反映 中央値', fmt(m.elapsedMedian, 'ms'), '≤ ' + THRESHOLDS.elapsedMedianMaxMs + 'ms', j.items.elapsedMedian],
    ['反映 最大', fmt(m.elapsedMax, 'ms'), '≤ ' + THRESHOLDS.elapsedMaxMs + 'ms', j.items.elapsedMax],
    ['連続使用', m.maxRunWithoutDrop + '回', '≥ ' + THRESHOLDS.minRunWithoutDrop + '回', j.items.run],
  ];
  $('#metrics-body').innerHTML = rows.map(
    ([name, val, th, pass]) => `<tr><td>${name}</td><td>${val}</td><td>${th}</td><td>${badge(pass)}</td></tr>`
  ).join('');

  const ov = $('#overall');
  ov.className = 'badge ' + (!j.hasData ? 'na' : (j.overall ? 'pass' : 'fail'));
  ov.textContent = !j.hasData ? '—' : (j.overall ? '合格' : '未達');
  $('#log-count').textContent = String(entries.length);
}

async function copyCSV() {
  const csv = toCSV(recorder.getAll());
  try {
    await navigator.clipboard.writeText(csv);
    $('#copy-area').style.display = 'none';
    flash('#copy-csv', 'コピーしました');
  } catch {
    // クリップボード不可 → テキストエリアへ出して手動コピー（E-05）
    const ta = $('#copy-area');
    ta.style.display = 'block';
    ta.value = csv;
    ta.focus(); ta.select();
  }
}
function flash(sel, text) {
  const b = $(sel); const old = b.textContent; b.textContent = text;
  setTimeout(() => { b.textContent = old; }, 1200);
}

// ---- 配線 ----
$('#start-play').addEventListener('click', beginSession);
$('#spin-btn').addEventListener('click', onSpinTouch);
$('#to-title').addEventListener('click', () => { endSession(); show('title'); });
$('#to-panel').addEventListener('click', () => show('panel'));
$('#panel-back').addEventListener('click', () => show('title'));
document.querySelectorAll('input[name="method"]').forEach(r => {
  r.addEventListener('change', () => { setMethod(r.value); renderPanel(); });
});
$('#copy-csv').addEventListener('click', copyCSV);
$('#clear-log').addEventListener('click', () => { recorder.clear(); renderPanel(); });
$('#mark-spurious').addEventListener('click', () => {
  // 検証者が「発話していないのに反応した」を手動で記録する（誤発動＝要件11.1）
  recorder.add({
    method, level: LEVEL, phase: PHASES.AWAIT_STOP, expected: '',
    rawText: '', matchedKey: '', elapsedMs: 0, outcome: 'spurious', sessionRestart,
  });
  renderPanel();
});

// 画面を離れる時に音声セッションを片付ける
window.addEventListener('pagehide', endSession);
