// イロドリズム メインコントローラ（タッチ中核スライス）
// 画面: モード選択→サイズ選択→制作→一覧→完成プレビュー。音声(phase.js)・見本は次段で追加。
// 既存2作品には影響しない（irodori/ 単独 + 共通部品の import のみ）。
import { COLORS, colorName } from './palette.js';
import { createCells, idx, inRange, rectCells, lineCells, renderBoard, renderThumb } from './board.js';
import * as store from './storage.js';
import { makeGrammar, parse, colIndex } from './vocabulary.js';
import { VoiceInput } from './phase.js';

const APP_VERSION = 'v0.2.1';
const PREF_READ = 'irodori:readAloud';
const $ = id => document.getElementById(id);
const q = sel => document.querySelector(sel);
const qa = sel => [...document.querySelectorAll(sel)];

// ---- 状態 ----
let current = null;      // {id, size, cells, mode, templateId, createdAt}
let savedId = null;      // 保存済みならその id（更新保存の判定）
let cursor = null;       // {row, col}
let pendingColor = null; // 色index
let tool = 'single';     // single | range | line
let anchor = null;       // 範囲/線の始点 {row,col}
let previewCells = [];   // プレビュー中のindex配列
let previewFrom = 'list';
let readAloud = false;   // 色名の読み上げ（デフォルトOFF・任意ON）
// 音声
let voice = null;        // VoiceInput
let lastCoord = null;    // 直近に指定した座標（から/せんの始点に使う）
let voiceLine = false;   // 「せん」が言われた
let awaitingEnd = false; // から/せんの後、終点待ち

// ---- 画面遷移 ----
function show(name) {
  qa('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
  if (name !== 'make' && voice && voice.active) voice.disable();
  if (name === 'mode') renderMode();
  if (name === 'list') renderList();
  window.scrollTo(0, 0);
}

// ---- 読み上げ（NR-07 #2。TTS出力でありユーザー音声は送らない=C-1に抵触しない）----
function speak(text) {
  try {
    if (!readAloud) return;
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* 無視 */ }
}

// ---- モード画面 ----
function renderMode() {
  const draft = store.loadDraft();
  let cont = $('btn-continue');
  const hasDraft = draft && Array.isArray(draft.cells) && draft.cells.some(c => c != null);
  if (hasDraft && !cont) {
    cont = document.createElement('button');
    cont.id = 'btn-continue';
    cont.className = 'ir-big ir-continue';
    cont.textContent = 'かきかけを つづける';
    cont.onclick = () => { openMake(draft, null); };
    q('[data-screen="mode"] .ir-menu').prepend(cont);
  } else if (!hasDraft && cont) {
    cont.remove();
  }
}

// ---- 制作開始 ----
function startNew(size, mode) {
  const cells = createCells(size);
  openMake({ id: store.newId(), size, cells, mode, templateId: null, createdAt: null }, null);
}
function openMake(artwork, existingId) {
  current = { ...artwork, cells: artwork.cells.slice() };
  savedId = existingId;
  cursor = { row: 0, col: 0 };
  pendingColor = null;
  tool = 'single';
  anchor = null;
  previewCells = [];
  lastCoord = null; voiceLine = false; awaitingEnd = false;
  setMsg('');
  qa('.ir-tool').forEach(b => b.classList.toggle('is-active', b.dataset.tool === 'single'));
  renderPalette();
  draw();
  show('make');
}

function setMsg(t) { $('make-msg').textContent = t; }

function draw() {
  renderBoard($('board'), current, { cursor, previewCells, previewColor: pendingColor });
  $('btn-confirm').disabled = !(previewCells.length && pendingColor != null);
}

// ---- パレット ----
function renderPalette() {
  const el = $('palette');
  el.innerHTML = '';
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'ir-swatch' + (pendingColor === i ? ' is-sel' : '');
    b.style.setProperty('--sw', c.hex);
    b.innerHTML = `<span class="ir-chip"></span><span class="ir-cname">${c.name}</span>`;
    b.onclick = () => selectColor(i);
    el.appendChild(b);
  });
}
function selectColor(i) {
  pendingColor = i;
  speak(colorName(i));
  qa('.ir-swatch').forEach((b, j) => b.classList.toggle('is-sel', j === i));
  // 単マスで既にカーソルがあればプレビュー
  if (tool === 'single' && cursor) previewCells = [idx(current.size, cursor.row, cursor.col)];
  draw();
}

// ---- ツール切替 ----
function setTool(t) {
  tool = t;
  anchor = null;
  previewCells = (t === 'single' && cursor && pendingColor != null)
    ? [idx(current.size, cursor.row, cursor.col)] : [];
  qa('.ir-tool').forEach(b => b.classList.toggle('is-active', b.dataset.tool === t));
  setMsg(t === 'range' ? 'はんい：はじめと おわりの マスを タッチ' : t === 'line' ? 'せん：はじめと おわりの マスを タッチ' : '');
  draw();
}

// ---- 盤面タッチ ----
function onCellTap(row, col) {
  if (!inRange(current.size, row, col)) return;
  if (tool === 'single') {
    cursor = { row, col };
    previewCells = (pendingColor != null) ? [idx(current.size, row, col)] : [];
    draw();
    return;
  }
  // range / line: 1点目→2点目
  if (!anchor) {
    anchor = { row, col };
    cursor = { row, col };
    previewCells = [];
    setMsg('おわりの マスを タッチ');
    draw();
  } else {
    const end = { row, col };
    previewCells = tool === 'range'
      ? rectCells(current.size, anchor, end)
      : lineCells(current.size, anchor, end);
    cursor = end;
    setMsg(pendingColor != null ? 'オーケーで きめてね' : 'いろを えらんでね');
    draw();
  }
}
function onCellDbl(row, col) {
  // ダブルタップ＝いま選んだ色で直接塗る（色未選択なら無視）
  if (tool !== 'single' || pendingColor == null) return;
  applyColor([idx(current.size, row, col)]);
}

// ---- 着色確定（2段階確定 C-3）----
function applyColor(cellIdxs) {
  if (pendingColor == null || !cellIdxs.length) return;
  cellIdxs.forEach(i => { current.cells[i] = pendingColor; });
  store.saveDraft(current); // 自動下書き
  if (tool !== 'single') { anchor = null; previewCells = []; setMsg(''); }
  voiceLine = false; awaitingEnd = false;
  draw();
}
function confirmApply() { applyColor(previewCells); }

// ---- 保存 ----
function doSave() {
  const artwork = { ...current, id: savedId || current.id };
  const res = store.saveArtwork(artwork);
  if (res.ok) {
    savedId = artwork.id;
    current.id = artwork.id;
    store.clearDraft();
    setMsg('ほぞんしたよ！');
  } else if (res.reason === 'limit') {
    setMsg('いっぱいだよ。「さくひん」で ふるいのを けしてね。');
  } else {
    setMsg('ほぞんできなかった…もういちど ためしてね。');
  }
}

// ---- 作品一覧 ----
function renderList() {
  const arr = store.listArtworks();
  const g = $('gallery');
  g.innerHTML = '';
  $('list-empty').hidden = arr.length > 0;
  arr.slice().reverse().forEach(a => {
    const card = document.createElement('div');
    card.className = 'ir-card';
    const canvas = document.createElement('canvas');
    canvas.className = 'ir-thumb';
    renderThumb(canvas, a);
    const thumbBtn = document.createElement('button');
    thumbBtn.className = 'ir-thumb-btn';
    thumbBtn.setAttribute('aria-label', 'ひらく');
    thumbBtn.appendChild(canvas);
    thumbBtn.onclick = () => openPreview(a, 'list');
    const meta = document.createElement('div');
    meta.className = 'ir-card-meta';
    meta.textContent = `${a.size}×${a.size}`;
    const acts = document.createElement('div');
    acts.className = 'ir-card-acts';
    acts.innerHTML = '';
    const bEdit = mkBtn('つづき', () => openMake(a, a.id));
    const bCopy = mkBtn('コピー', () => openMake({ ...a, id: store.newId(), createdAt: null }, null));
    const bDel = mkBtn('けす', () => { if (confirm('けしても いい？')) { store.deleteArtwork(a.id); renderList(); } });
    bDel.classList.add('ir-del');
    acts.append(bEdit, bCopy, bDel);
    card.append(thumbBtn, meta, acts);
    g.appendChild(card);
  });
}
function mkBtn(label, fn) { const b = document.createElement('button'); b.className = 'ir-mini'; b.textContent = label; b.onclick = fn; return b; }

// ---- 完成プレビュー ----
function openPreview(artwork, from) {
  previewFrom = from || 'list';
  renderThumb($('preview-canvas'), artwork);
  show('preview');
}

// ---- 起動・イベント ----
function updateReadBtn() {
  const b = $('btn-read');
  if (!b) return;
  b.setAttribute('aria-pressed', String(readAloud));
  b.classList.toggle('is-active', readAloud);
  b.textContent = 'よみあげ:' + (readAloud ? 'オン' : 'オフ');
}
function toggleRead() {
  readAloud = !readAloud;
  try { localStorage.setItem(PREF_READ, readAloud ? '1' : '0'); } catch { /* 無視 */ }
  updateReadBtn();
  if (readAloud && pendingColor != null) speak(colorName(pendingColor));
}

function init() {
  $('ver').textContent = APP_VERSION;
  try { readAloud = localStorage.getItem(PREF_READ) === '1'; } catch { readAloud = false; }
  updateReadBtn();
  $('btn-read').onclick = toggleRead;
  // ヘッダー：ホーム（コエキットへ）／マイク（音声トグル）
  $('home-btn').onclick = () => { location.href = '../'; };
  $('mic-btn').onclick = toggleMic;
  // モード選択
  qa('[data-go]').forEach(b => b.onclick = () => {
    const go = b.dataset.go;
    if (go === 'free') show('size');
    else if (go === 'list') show('list');
    else if (go === 'template') setModeNote('おてほんは じゅんびちゅう（つぎの だんかい）');
  });
  // サイズ選択
  qa('[data-size]').forEach(b => b.onclick = () => startNew(Number(b.dataset.size), 'free'));
  // 戻る
  qa('[data-back]').forEach(b => b.onclick = () => show(b.dataset.back));
  $('preview-back').onclick = () => show(previewFrom);
  // 制作
  $('palette') && renderPalette();
  qa('.ir-tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  $('btn-confirm').onclick = confirmApply;
  $('btn-save').onclick = doSave;
  $('board').addEventListener('click', e => {
    const cell = e.target.closest('.ir-cell'); if (!cell) return;
    onCellTap(Number(cell.dataset.row), Number(cell.dataset.col));
  });
  $('board').addEventListener('dblclick', e => {
    const cell = e.target.closest('.ir-cell'); if (!cell) return;
    onCellDbl(Number(cell.dataset.row), Number(cell.dataset.col));
  });
  show('mode');
}
function setModeNote(t) {
  let n = $('mode-note');
  if (!n) { n = document.createElement('p'); n.id = 'mode-note'; n.className = 'ir-intro'; q('[data-screen="mode"] .ir-menu').after(n); }
  n.textContent = t;
}

// ---- 音声（制作画面） ----
let _sfxCtx = null;
function sfxWrong() {
  try {
    _sfxCtx = _sfxCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = _sfxCtx.createOscillator(), g = _sfxCtx.createGain();
    o.type = 'square'; o.frequency.value = 160; g.gain.value = 0.06;
    o.connect(g); g.connect(_sfxCtx.destination);
    o.start(); o.stop(_sfxCtx.currentTime + 0.14);
  } catch { /* 無視 */ }
}
function micUI(state) {
  const b = $('mic-btn'); if (!b) return;
  b.classList.remove('is-off', 'is-listen');
  if (state === 'listening') { b.classList.add('is-listen'); b.setAttribute('aria-pressed', 'true'); }
  else { b.classList.add('is-off'); b.setAttribute('aria-pressed', 'false'); }
}
async function toggleMic() {
  if (!voice) { voice = new VoiceInput({ onText: onVoiceText, onStatus: onVoiceStatus }); voice.setGrammar(makeGrammar()); }
  if (voice.active) { voice.disable(); return; }
  if (!(await voice.isAvailable())) { setMsg('このブラウザは こえが つかえないよ'); return; }
  setMsg('こえを じゅんびちゅう…（はじめは じかんが かかるよ）');
  micUI('loading');
  await voice.enable();
}
function onVoiceStatus(s) {
  if (s === 'listening') { micUI('listening'); setMsg('こえで いえるよ'); }
  else if (s === 'off') { micUI('off'); }
  else if (s === 'error') { micUI('off'); setMsg('マイクが つかえなかったよ'); }
}
function onVoiceText(text) { interpretVoice(parse(text)); }

// トークン列を制作モデルへ反映（全発話・分割発話の両対応）
function interpretVoice(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'kw') {
      if (t.val === 'save') doSave();
      else if (t.val === 'quit') show('mode');
      else if (t.val === 'ok') confirmApply();
      else if (t.val === 'kara') beginTwoPoint();
      else if (t.val === 'sen') { voiceLine = true; setToolVisual('line'); }
      // made は接続語（無視）
      i++;
    } else if (t.type === 'color') { selectColor(t.val); i++; }
    else if (t.type === 'dir') {
      let steps = 1;
      if (tokens[i + 1] && tokens[i + 1].type === 'digit') { steps = Number(tokens[i + 1].val); i += 2; } else i++;
      voiceRelMove(t.val, steps);
    } else if (t.type === 'col' || t.type === 'digit') {
      let col = null, row = null;
      while (i < tokens.length && (tokens[i].type === 'col' || tokens[i].type === 'digit')) {
        if (tokens[i].type === 'col' && col == null) col = tokens[i].val;
        else if (tokens[i].type === 'digit' && row == null) row = tokens[i].val;
        else break;
        i++;
      }
      voiceCoord(col, row);
    } else i++;
  }
}
function setToolVisual(t) {
  tool = t;
  qa('.ir-tool').forEach(b => b.classList.toggle('is-active', b.dataset.tool === t));
}
function voiceCoord(colLetter, rowDigit) {
  const size = current.size;
  let r = cursor ? cursor.row : 0, c = cursor ? cursor.col : 0;
  if (rowDigit != null) r = Number(rowDigit) - 1;
  if (colLetter != null) c = colIndex(colLetter);
  if (!inRange(size, r, c)) { sfxWrong(); return; }        // 範囲外は不正解音・位置維持
  if (awaitingEnd && anchor) {
    previewCells = (tool === 'line') ? lineCells(size, anchor, { row: r, col: c }) : rectCells(size, anchor, { row: r, col: c });
    cursor = { row: r, col: c }; lastCoord = { row: r, col: c }; awaitingEnd = false;
    setMsg(pendingColor != null ? 'オーケーで きめてね' : 'いろを えらんでね');
  } else {
    cursor = { row: r, col: c }; lastCoord = { row: r, col: c };
    if (tool === 'single' && pendingColor != null) previewCells = [idx(size, r, c)];
  }
  draw();
}
function voiceRelMove(dir, steps) {
  const size = current.size; let r = cursor.row, c = cursor.col;
  if (dir === 'みぎ') c += steps; else if (dir === 'ひだり') c -= steps; else if (dir === 'うえ') r -= steps; else if (dir === 'した') r += steps;
  if (!inRange(size, r, c)) { sfxWrong(); return; }
  cursor = { row: r, col: c }; lastCoord = { row: r, col: c };
  if (tool === 'single' && pendingColor != null) previewCells = [idx(size, r, c)];
  draw();
}
function beginTwoPoint() {
  setToolVisual(voiceLine ? 'line' : 'range');
  anchor = lastCoord || cursor;
  awaitingEnd = true; previewCells = [];
  setMsg('つぎの ばしょを いってね');
  draw();
}

init();
