// イロドリズム メインコントローラ（タッチ中核スライス）
// 画面: モード選択→サイズ選択→制作→一覧→完成プレビュー。音声(phase.js)・見本は次段で追加。
// 既存2作品には影響しない（irodori/ 単独 + 共通部品の import のみ）。
import { COLORS, colorName } from './palette.js';
import { createCells, idx, inRange, rectCells, lineCells, renderBoard, renderThumb } from './board.js';
import * as store from './storage.js';

const APP_VERSION = 'v0.1.3';
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

// ---- 画面遷移 ----
function show(name) {
  qa('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
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

init();
