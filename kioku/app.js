import { Progress } from '../src/game/progress.js';
import { renderHighest, renderAward, medalMarkup } from '../src/ui/achievement.js';
// メモリズム コントローラ（コエキット2本目）
//
// フロー（1試行）: 記憶提示(全札を表・カウントダウン) → 一斉裏返し(タイムアップSE) →
//   対象提示(探す絵を一瞬) → 位置語で回答(2段階確定) → 正解/失敗(失敗は全開示) → 次試行 or クリア/GO
//
// 共有部品を流用（要件10.3）。抽選(スタート/ストップ)は無い。
// 守る設計: 常時認識にしない／2段階確定(C-3)／タッチのみでも可(C-2)／文字を使わない(数字・版/©除く)。
// 素材未用意のため絵は A〜I の文字で仮置き。正解/不正解音はピタリズムと共通。

import { createSpeechInput, METHODS } from '../src/speech/index.js';
import { wordsForKeys } from '../src/speech/vocabulary.js';
import { PhaseMachine, PHASES } from '../src/game/phase.js';
import { Judge } from '../src/game/judge.js';
import { getLevel, LEVELS } from '../src/game/levels.js';
import { deal } from '../src/game/deal.js';
import { ANIMAL_FILES, animalImg } from '../src/game/animals.js';
import { openLevelIntro, closeLevelIntro } from '../src/ui/levelintro.js';
import { ScreenAwake } from '../src/ui/screenawake.js';
import { LevelNavigation } from '../src/ui/levelnavigation.js';
import { CardReveal } from '../src/ui/cardreveal.js';
import { BoardView } from '../src/ui/board.js';
import { renderCertificate } from '../src/ui/certificate.js';
import { buildLevelSelect } from '../src/ui/levelselect.js';
import { setMicState as setMicStateUI } from '../src/ui/micstate.js';
import * as sfx from '../src/audio/sfx.js';

const $ = s => document.querySelector(s);
const progress = new Progress('kioku-place');
const reveal = new CardReveal($('#stage'));
const navigation = new LevelNavigation();
const screenAwake = new ScreenAwake();
const METHOD_KEY = 'koekit.method';

// 難易度パラメータ（requirements-kioku 8.5・【想定】B区分）。記憶秒はカウントダウン用に整数。
const MEMORY_SEC = { '1': 3, '2': 3, '3': 4, '4': 3, '5': 4, 'extra': 2 };
const TARGET_MS  = { '1': 1200, '2': 1200, '3': 1000, '4': 1000, '5': 800, 'extra': 500 };
const CLEAR_HITS = { '1': 1, '2': 1, '3': 2, '4': 2, '5': 3, 'extra': 3 };


// ---- 状態 ----
let method = resolveInitialMethod();
let adapter = null;
let phase = null;
let judge = null;
let level = null;
let dealt = null;             // { map, targetKey, targetLetter }
let selectedKey = null;
let trialResolved = false;
let pendingStatus = null;     // 結果表示後に進む先の判定結果
let pendingAdvance = false;   // 自動送り待ち中か（タイマーとボタンの二重発火を防ぐ）
let micDenied = false;
let sessionRestart = 0;
let cdTimer = null, seqTimer = null; // カウントダウン / シーケンス用タイマー
const board = new BoardView($('#board'), $('#figure'), { onCardTap });

// ---- 画面 ----
function show(name) {
  screenAwake.setActive(name === 'game' || name === 'cert');
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
}
function resolveInitialMethod() {
  try {
    const q = new URLSearchParams(location.search).get('method');
    if (q) return q;
    const saved = localStorage.getItem(METHOD_KEY);
    if (saved) return saved;
  } catch {}
  return METHODS.VOSK;
}
function setMicState(state) {
  setMicStateUI($('#mic-state'), $('#stage'), state);
  document.querySelectorAll('.navigation-mic').forEach(el => setMicStateUI(el, null, state));
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
}
function startListening(keys) {
  if (!adapter || micDenied) return;
  adapter.start(wordsForKeys(keys));
  setMicState('listening');
}
function stopListening() { if (adapter) adapter.stop(); }

// ---- レベル開始 ----
function startLevel(id) {
  if (id === 'extra' && !progress.unlocked()) return;
  $('#level-status').textContent = id === 'extra' ? '⚡' : id;
  $('#level-status').setAttribute('aria-label', id === 'extra' ? 'スピード' : 'レベル ' + id);
  reveal.clear();
  navigation.cancel();
  phase?.to(PHASES.RESULT);
  sfx.primeAudio();
  level = getLevel(id);
  if (!level || id === '0') { level = getLevel('1'); } // レベル0(練習ルーレット)は本アプリに無い
  micDenied = false; sessionRestart = 0;

  if (!adapter) adapter = buildAdapter();
  if (adapter.name !== method) { try { adapter.dispose?.(); } catch {} adapter = buildAdapter(); }

  judge = new Judge({ clearHits: CLEAR_HITS[level.id] || 3 }); // 規定回数正解で即クリア演出→次へ
  phase = new PhaseMachine({ startListening, stopListening });
  phase.setLevelVocab(level.vocab);
  phase.on('match', onMatch);
  phase.on('ignored', () => {}); // 認識されなかった発話は何もしない（カウントしない・要件8.4）
  phase.on('enter', ph => updateControls(ph));

  board.render(level.vocab);
  show('game');
  showLevelIntro(level.id); // 各レベルの最初に保護者向けの概要→とじたら開始
}

// ---- レベル紹介（保護者向け） ----
function showLevelIntro(id) {
  openLevelIntro(getLevel(id), 'kioku');
  navigation.listen(phase, PHASES.AWAIT_INTRO);
}
function beginFromIntro() {
  if (!$('#level-intro').open) return;
  navigation.cancel();
  hideLevelIntro();
  beginTrial();
}
function hideLevelIntro() { closeLevelIntro(); }

function clearTimers() { clearTimeout(cdTimer); clearTimeout(seqTimer); }

function beginTrial() {
  reveal.clear();
  clearTimers();
  selectedKey = null; trialResolved = false; pendingStatus = null;
  board.clearMarks(); board.clearContent();
  $('#confirm-btn').classList.add('hidden');

  // 配置（毎試行ランダム）。各セルに動物画像を仕込み、裏向きで置く。
  dealt = deal(level.vocab, { letters: ANIMAL_FILES });
  for (const key of level.vocab) board.setContent(key, animalImg(dealt.map[key]));

  navigation.listen(phase, PHASES.AWAIT_START); // 「スタート」発話 or ▶ボタンで記憶提示が始まる
}

// スタート → 記憶提示（券面表示＋カウントダウン）を開始
function startReveal() {
  if (!phase || phase.phase !== PHASES.AWAIT_START) return;
  phase.to(PHASES.RESULT); // 記憶提示中は認識停止
  revealMemory();
}

function letterEl(ch) {
  const d = document.createElement('div'); d.className = 'card-letter'; d.textContent = ch; return d;
}

// ---- 記憶提示（カウントダウン）→ 一斉裏返し ----
function revealMemory() {
  board.flipAll(true);          // 全札を表にして絵を見せる
  runCountdown(MEMORY_SEC[level.id] || 3, () => {
    sfx.playTimeUp();
    board.flipAll(false);       // 一斉裏返し
    seqTimer = setTimeout(showTarget, 800);
  });
}
function runCountdown(sec, onDone) {
  const el = $('#countdown');
  let n = sec;
  el.classList.remove('hidden');
  const step = () => {
    if (n <= 0) { el.classList.add('hidden'); onDone(); return; }
    el.textContent = n;
    sfx.playCountdownTick();
    n--;
    cdTimer = setTimeout(step, 1000);
  };
  step();
}

// ---- 対象提示（探す絵を一瞬）→ 回答受付 ----
function showTarget() {
  const tp = $('#target-prompt');
  const holder = tp.querySelector('.tp-letter');
  holder.innerHTML = '';
  holder.appendChild(animalImg(dealt.targetLetter)); // 探す動物を大きく提示
  tp.classList.remove('hidden');
  seqTimer = setTimeout(() => {
    tp.classList.add('hidden');
    phase.to(PHASES.AWAIT_POSITION); // ここから認識開始（位置語）
  }, TARGET_MS[level.id] || 1000);
}

// ---- コントロール表示 ----
function updateControls(ph) {
  $('#next-btn').setAttribute('aria-label', ph === PHASES.AWAIT_RESULT_NEXT ? 'つぎへ' : 'スタート');
  $('#next-btn').classList.toggle('hidden', ph !== PHASES.AWAIT_START && ph !== PHASES.AWAIT_RESULT_NEXT); // ▶ ＝ 開始または正解表示の先送り
  const inAnswer = (ph === PHASES.AWAIT_POSITION || ph === PHASES.AWAIT_CONFIRM);
  const c = $('#confirm-btn');
  // 位置語待ちから確定ボタンを出しておく（レイアウト固定）。選択前は非活性、選択後に活性。
  c.classList.toggle('hidden', !inAnswer);
  c.disabled = (ph !== PHASES.AWAIT_CONFIRM);
  if (!micDenied) setMicState(ph === PHASES.RESULT ? 'idle' : 'listening');
}

// ---- 認識マッチ ----
function onMatch(key, raw, elapsedMs) {
  const ph = phase.phase;
  if (key === 'quit') { goTitle(); return; }
  if (ph === PHASES.AWAIT_RESULT_NEXT && (key === 'next' || key === 'confirm')) { afterResult(); return; }
  if (ph === PHASES.AWAIT_INTRO && key === 'confirm') { beginFromIntro(); return; }
  if (ph === PHASES.AWAIT_NEXT && key === 'next') { onCertNext(); return; }
  if (ph === PHASES.AWAIT_START && key === 'start') { startReveal(); return; } // スタート発話
  if ((ph === PHASES.AWAIT_POSITION || ph === PHASES.AWAIT_CONFIRM) && level.vocab.includes(key)) {
    selectPosition(key); // 言い直しも含む
  } else if (ph === PHASES.AWAIT_CONFIRM && key === 'confirm') {
    doConfirm();
  }
}
function selectPosition(key) {
  selectedKey = key;
  board.setSelected(key); // 認識した位置のカードをマーク（矢印は使わない）
  if (phase.phase === PHASES.AWAIT_POSITION) phase.to(PHASES.AWAIT_CONFIRM);
  else $('#confirm-btn').classList.remove('hidden');
}

// ---- 確定・判定 ----
function doConfirm() {
  if (trialResolved || !selectedKey) return;
  trialResolved = true;
  clearTimers();
  phase.to(PHASES.RESULT); // 認識停止
  $('#confirm-btn').classList.add('hidden');
  board.showFigure(null);  // 矢印トーストを消す

  const correct = (selectedKey === dealt.targetKey);
  board.setSelected(null); // 選択中のチェックを消し、結果の正誤だけを表示する。
  board.setFlipped(selectedKey, true); // めくって中身（文字）を見せる
  let wait = 3000;
  if (correct) {
    board.setCorrect(selectedKey, true);
    reveal.show(board.cards.get(selectedKey)?.el);
    sfx.playCorrect();
  } else {
    sfx.playBlip(220);
    // 失敗時は全カードを表に戻して正解位置を見せる（KM-007）。少し長めに見せる。
    board.flipAll(true);
    board.setWrong(selectedKey, true);
    board.setCorrect(dealt.targetKey, true);
    wait = 2800;
  }

  pendingStatus = judge.record(correct ? 'correct' : 'wrong');
  pendingAdvance = true;
  if (correct) {
    navigation.afterSound(500); // 正解音は約440ms。鳴り終わってから先送りを受け付ける。
    navigation.listen(phase, PHASES.AWAIT_RESULT_NEXT);
  }
  // 結果を少し見せてから、クリア/GOは認定書、続くならスタート待ちへ戻る（次はスタートで始まる）。
  seqTimer = setTimeout(afterResult, wait);
}

function afterResult() {
  if (!pendingAdvance) return;
  pendingAdvance = false;
  reveal.clear();
  navigation.cancel();
  clearTimers();
  phase.to(PHASES.RESULT);
  if (pendingStatus === 'clear') showCertificate('clear', level.id);
  else if (pendingStatus === 'gameover') showCertificate('gameover', level.id);
  else beginTrial(); // スタート待ちへ
}

// ---- タッチ（位置選択・F-016） ----
function onCardTap(key) {
  if (trialResolved) return;
  if (phase.phase !== PHASES.AWAIT_POSITION && phase.phase !== PHASES.AWAIT_CONFIRM) return;
  // 同じ札を再タップ（ダブルタップ）＝直接めくる。別の札なら言い直し。
  if (key === selectedKey && phase.phase === PHASES.AWAIT_CONFIRM) { doConfirm(); return; }
  selectPosition(key);
}

// ---- 認定書 ----
function showCertificate(kind, levelId) {
  phase.to(PHASES.RESULT);
  navigation.afterSound();
  clearTimers();
  const idx = LEVELS.findIndex(l => l.id === levelId);
  const stars = levelId === 'extra' ? 6 : Math.max(1, idx);
  if (kind === 'clear') sfx.playClear(); else sfx.playGameover();
  renderCertificate($('#medal'), $('#cert-stars'), { kind, stars });
  const award = renderAward($('#cert-award'), progress, kind, levelId);
  $('#medal').innerHTML = kind === 'clear' ? medalMarkup(award?.medal || 'diamond') : '↻';
  $('#cert-next').setAttribute('aria-label', kind === 'gameover' ? '同じレベルに再挑戦（声でも「つぎ」）' : 'つぎへ');
  $('#cert').dataset.kind = kind;
  $('#cert').dataset.level = levelId;
  show('cert');
  navigation.listen(phase, PHASES.AWAIT_NEXT);
}
function onCertNext() {
  if (!$('#cert').classList.contains('active')) return;
  navigation.cancel();
  phase.to(PHASES.RESULT);
  const kind = $('#cert').dataset.kind, id = $('#cert').dataset.level;
  if (kind === 'gameover') { startLevel(id); return; }
  if (id === '5') {
    if (progress.unlocked()) startLevel('extra'); else goTitle();
  } else if (id === 'extra') goTitle();
  else startLevel(String(Number(id) + 1));
}

// ---- 終了/タイトル ----
function goTitle() {
  reveal.clear();
  sfx.stopAll();
  pendingAdvance = false;
  screenAwake.setActive(false);
  navigation.cancel();
  clearTimers();
  hideLevelIntro();
  try { phase && phase.to(PHASES.RESULT); } catch {}
  try { adapter && (adapter.dispose ? adapter.dispose() : adapter.stop()); } catch {}
  adapter = null; phase = null; judge = null; level = null; dealt = null;
  $('#countdown').classList.add('hidden'); $('#target-prompt').classList.add('hidden');
  $('#next-btn').classList.add('hidden'); $('#confirm-btn').classList.add('hidden');
  setMicState('idle');
  refreshProgress();
  show('title');
}

// ---- 配線 ----
function refreshProgress() {
  buildLevelSelect($('#level-select'), LEVELS.filter(l => l.id !== '0'), startLevel, progress);
  renderHighest($('#highest-title'), progress);
}
refreshProgress(); // レベル0は無し
$('#start-play').addEventListener('click', () => startLevel('1')); // はじめる＝レベル1
$('#confirm-btn').addEventListener('click', doConfirm);
$('#next-btn').addEventListener('click', () => { if (phase?.phase === PHASES.AWAIT_RESULT_NEXT) afterResult(); else startReveal(); }); // ▶ ＝ スタート（記憶提示を始める）
$('#intro-back').addEventListener('click', goTitle);
$('#level-intro').addEventListener('cancel', event => { event.preventDefault(); goTitle(); });
$('#intro-go').addEventListener('click', beginFromIntro);
$('#to-title').addEventListener('click', goTitle);
$('#cert-next').addEventListener('click', onCertNext);
$('#cert-quit').addEventListener('click', goTitle);
window.addEventListener('pagehide', goTitle);
