// イロドリズム メインコントローラ（タッチ中核スライス）
// 画面: モード選択→サイズ/見本選択→制作→一覧→完成プレビュー。
// 既存2作品には影響しない（irodori/ 単独 + 共通部品の import のみ）。
import { COLORS, colorName, ERASE } from './palette.js';
import { createCells, idx, inRange, rectCells, lineCells, renderBoard, renderThumb } from './board.js';
import * as store from './storage.js';
import { makeGrammar, parse, colIndex } from './vocabulary.js';
import { VoiceInput } from './phase.js';
import { setMicState } from '../src/ui/micstate.js';
import { createHelp } from './help.js';
import { Tutorial, createTutorialGuide } from './tutorial.js';
import { TEMPLATES, CATEGORIES, findTemplate, matchesTemplate } from './templates.js';
import { HEART_RECIPE } from './recipes.js';

const APP_VERSION = 'v0.5.8';
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
// 音声の範囲/線オペ：素の座標＝訂正（カーソル移動）、「から」＝始点、「まで」＝終点、「せん」＝線
let vStart = null;       // 始点 {row,col}（「から」で確定）
let vEnd = null;         // 終点 {row,col}（「まで」または から以降の座標で確定）
let vLine = false;       // 「せん」が言われた（線）
// 履歴（undo/redo・1確定=1手）
let history = [];        // cells スナップショットの配列
let histIndex = -1;      // 現在位置
let activeScreen = 'mode';
let help;
let tutorial = null;
let tutorialGuide, tutorialTimer, undoAnnounced = false;
let voiceRequest = 0;
let templateSize = 'all', templateCategory = 'all', templateGuideVisible = true;
let recipePage = -1;
let recipePractice = false, recipeStep = 0, recipeTimer;

// ---- 画面遷移 ----
function show(name) {
  activeScreen = name;
  qa('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
  if (name !== 'make' && voice && voice.active) voice.disable();
  if (name !== 'make') {
    clearTimeout(recipeTimer);
    tutorial = null;
    clearTimeout(tutorialTimer);
    tutorialGuide?.close();
    $('template-dialog').close();
  }
  if (name === 'make') {
    if (!tutorial && !recipePractice && !help.seen) help.show(name);
    else void enableVoice();
  }
  if (name === 'mode') renderMode();
  if (name === 'list') renderList();
  if (name === 'templates') renderTemplates();
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

// ---- 見本選択・参照（既存の保存データにはIDだけを持つ） ----
function renderTemplates() {
  renderThumb($('heart-practice-picture'), findTemplate('heart-5',5));
  function filters(id, choices, selected, onSelect) {
    const host = $(id); host.replaceChildren();
    for (const [value, label] of choices) {
      const button = mkBtn(label, () => { onSelect(value); renderTemplates(); });
      button.setAttribute('aria-pressed', String(value === selected)); host.append(button);
    }
  }
  filters('template-sizes', [['all', 'ぜんぶ'], ...[3,5,7,9].map(n => [String(n), `${n} × ${n}`])], templateSize, value => { templateSize = value; });
  filters('template-categories', [['all', 'ぜんぶ'], ...Object.entries(CATEGORIES)], templateCategory, value => { templateCategory = value; });
  const gallery = $('template-gallery'); gallery.replaceChildren();
  const items = TEMPLATES.filter(t => (templateSize === 'all' || t.size === Number(templateSize)) && (templateCategory === 'all' || t.category === templateCategory));
  $('template-empty').hidden = items.length > 0;
  const pairVisible = items.some(t=>t.id==='letter-s-7') && items.some(t=>t.id==='flag-9');
  for (const t of items) {
    const button = document.createElement('button'); button.className = 'ir-template-choice'; button.dataset.template = t.id;
    if (pairVisible && t.id === 'letter-s-7') button.style.gridColumn = '1';
    button.setAttribute('aria-label', `${t.name} ${t.size}かける${t.size}`);
    const canvas = document.createElement('canvas'); canvas.className = 'ir-template-picture'; canvas.setAttribute('aria-hidden', 'true'); renderThumb(canvas, t);
    const name = document.createElement('strong'); name.textContent = t.name;
    const size = document.createElement('span'); size.textContent = `${t.size} × ${t.size}`;
    button.append(canvas, name, size);
    button.onclick = () => {
      tutorial = null;
      openMake({ id: store.newId(), size: t.size, cells: createCells(t.size), mode: 'template', templateId: t.id, createdAt: null }, null);
    };
    gallery.append(button);
  }
}
function updateTemplateToggle() {
  $('template-guide-toggle').textContent = 'したえ：' + (templateGuideVisible ? 'オン' : 'オフ');
  $('template-guide-toggle').setAttribute('aria-pressed', String(templateGuideVisible));
}
function showTemplateReference() {
  const template = findTemplate(current?.templateId, current?.size);
  if (!template) return;
  voice?.disable();
  try { speechSynthesis.cancel(); } catch {}
  $('template-title').textContent = template.name;
  $('template-caption').textContent = `${template.size} × ${template.size} の おてほん`;
  $('template-canvas').setAttribute('aria-label', template.name + 'の いろつき おてほん');
  renderTemplateReference();
  updateTemplateToggle();
  $('template-dialog').showModal();
  if (heartExplanationOpen()) void enableVoice();
}

function renderTemplateReference() {
  const template = findTemplate(current?.templateId, current?.size);
  if (!template) return;
  const hasRecipe = template.id === 'heart-5';
  const step = hasRecipe && recipePage >= 0 ? HEART_RECIPE[recipePage] : null;
  $('recipe-tabs').hidden = !hasRecipe;
  $('recipe-content').hidden = !step;
  $('template-freedom').hidden = !!step;
  $('template-guide-toggle').hidden = !!step;
  $('template-dialog').classList.toggle('ir-recipe-dialog', !!step);
  $('recipe-overview').setAttribute('aria-pressed', String(!step));
  $('recipe-open').setAttribute('aria-pressed', String(!!step));
  renderThumb($('template-canvas'), step ? {size:5,cells:step.snapshot} : template);
  $('template-canvas').setAttribute('aria-label', step ? `はーとの ${recipePage+1}てめを ぬった おてほん` : template.name+'の いろつき おてほん');
  $('template-caption').textContent = step ? 'この てじゅんで ぬった あとの かたち' : `${template.size} × ${template.size} の おてほん`;
  $('template-done').textContent = step ? 'オッケーで はじめる' : 'ぬる';
  if (step) {
    $('recipe-title').textContent = step.title;
    $('recipe-words').replaceChildren(...step.words.map(word=>{const span=document.createElement('span');span.textContent=word;return span;}));
    $('recipe-tip').textContent = step.tip;
    $('recipe-progress').textContent = `${recipePage+1} / ${HEART_RECIPE.length}`;
    $('recipe-prev').disabled = recipePage === 0;
    $('recipe-next').disabled = recipePage === HEART_RECIPE.length-1;
  }
}

// 完全一致した途中形で進行する。誤って塗った場合は、直して一致すれば続けられる。
function syncRecipeProgress() {
  const match = HEART_RECIPE.findIndex(step => step.snapshot.every((c,i)=>c===current.cells[i]));
  const next = match >= 0 ? match+1 : current.cells.every(c=>c===null) ? 0 : recipeStep;
  if (next === recipeStep) return;
  const forward = next > recipeStep;
  recipeStep = next;
  recipePage = Math.min(next,4);
  clearTimeout(recipeTimer);
  if (forward && next < 5) recipeTimer = setTimeout(() => {
    if (activeScreen === 'make' && recipePractice && !help.open && !$('template-dialog').open) showTemplateReference();
  }, 600);
}

// ---- 制作開始 ----
function startNew(size, mode) {
  tutorial = null;
  const cells = createCells(size);
  openMake({ id: store.newId(), size, cells, mode, templateId: null, createdAt: null }, null);
}
function openMake(artwork, existingId, practice = false) {
  clearTimeout(recipeTimer);
  recipePractice = practice; recipeStep = 0;
  current = { ...artwork, cells: artwork.cells.slice() };
  savedId = existingId;
  templateGuideVisible = true; recipePage = -1;
  cursor = { row: 0, col: 0 };
  pendingColor = null;
  tool = 'single';
  anchor = null;
  previewCells = [];
  vStart = null; vEnd = null; vLine = false;
  history = [current.cells.slice()]; histIndex = 0; updateUndoRedo();
  setMsg('');
  qa('.ir-tool').forEach(b => b.classList.toggle('is-active', b.dataset.tool === 'single'));
  renderPalette();
  highlightPaint(null);
  draw();
  show('make');
  if (recipePractice) { recipePage = 0; showTemplateReference(); }
}

function setMsg(t) {
  $('make-msg').textContent = tutorial && (!t || t === 'こえで いえるよ')
    ? 'まちがえたら「もどす」で ひとつまえへ' : t;
}

function draw() {
  const template = current.mode === 'template' ? findTemplate(current.templateId, current.size) : null;
  renderBoard($('board'), current, { cursor, previewCells, previewColor: pendingColor, template: templateGuideVisible ? template : null });
  $('template-reference').hidden = !template;
  if (recipePractice) syncRecipeProgress();
  if (template) $('template-reference').textContent = matchesTemplate(current.cells, template)
    ? 'おてほんと おなじに できた！　みる ↗' : `${template.name}　おてほんを みる ↗`;
  if (recipePractice) $('template-reference').textContent = recipeStep < 5
    ? `${recipeStep+1}/5　${HEART_RECIPE[recipeStep].title}　てじゅん ↗`
    : 'はーとが できた！　てじゅんを みる ↗';
  $('btn-confirm').disabled = !(previewCells.length && pendingColor != null);
  $('tutorial-status').hidden = false;
  $('tutorial-status').replaceChildren();
  $('make-msg').classList.toggle('ir-practice-msg', !!tutorial);
  $('tutorial-goal').hidden = !tutorial;
  if (tutorial) {
    const goals = [['A1を', 'きいろに ぬろう'], ['B2〜D4を', 'あおに ぬろう'], ['A5〜E1に', 'オレンジの せん'], ['H5を', tutorial.undoReady ? 'もどすで とりけす' : 'くろにして もどす']];
    const [place, goal] = goals[tutorial.step];
    $('tutorial-goal').textContent = `${tutorial.step + 1}/4　${place} ${goal}`;
  }
  for (const text of ['まちがえたら「もどす」で', 'ひとつまえに もどれるよ']) {
    const line = document.createElement('span'); line.textContent = text;
    $('tutorial-status').append(line);
  }
  $('btn-save').hidden = !!tutorial;
  if (tutorial) {
    document.querySelectorAll('#board .ir-cell').forEach(cell => {
      const i = idx(current.size, Number(cell.dataset.row), Number(cell.dataset.col));
      cell.classList.toggle('ir-tutorial-target', !tutorial.passed && tutorial.lesson.cells.includes(i));
    });
    $('btn-confirm').disabled ||= tutorial.passed;
    if (tutorial.passed && !tutorialTimer && !tutorialGuide.open) {
      setMsg('できたね！');
      tutorialTimer = setTimeout(nextTutorial, 600);
    } else if (tutorial.undoReady && !tutorial.passed && !undoAnnounced) {
      undoAnnounced = true;
      tutorialGuide.show('undo', tutorial);
    } else if (tutorial.feedback) setMsg(tutorial.feedback);
  }
}

function startTutorial() {
  clearTimeout(tutorialTimer); tutorialTimer = null; undoAnnounced = false;
  tutorial = new Tutorial();
  openMake({ id: 'practice', size: 9, cells: tutorial.base.slice(), mode: 'free', templateId: null, createdAt: null }, null);
  tutorialGuide.show('overview', tutorial);
}
function retryTutorial() {
  if (!tutorial) return;
  clearTimeout(tutorialTimer); tutorialTimer = null; undoAnnounced = false;
  const cells = tutorial.retry();
  openMake({ ...current, size: tutorial.lesson.size, cells }, null);
  tutorialGuide.show('lesson', tutorial);
}
function nextTutorial() {
  clearTimeout(tutorialTimer); tutorialTimer = null;
  if (!tutorial?.passed) return;
  if (tutorial.next()) retryTutorial();
  else tutorialGuide.show('complete', tutorial);
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
  if (i !== ERASE) speak(colorName(i));
  highlightPaint(i);
  // 単マスで既にカーソルがあればプレビュー
  if (tool === 'single' && cursor) previewCells = [idx(current.size, cursor.row, cursor.col)];
  draw();
}
function highlightPaint(i) {
  qa('.ir-swatch').forEach((b, j) => b.classList.toggle('is-sel', j === i));
  const e = $('btn-erase'); if (e) e.classList.toggle('is-sel', i === ERASE);
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
  if (tutorial?.passed) return;
  // ダブルタップ＝いま選んだ色で直接塗る（色/消しゴム未選択なら無視）
  if (tool !== 'single' || pendingColor == null) return;
  paintCells([idx(current.size, row, col)]);
  draw();
}

// マスを着色（消しゴム=null）し、下書き保存＋履歴に1手積む
function paintCells(cellIdxs) {
  const v = (pendingColor === ERASE) ? null : pendingColor;
  cellIdxs.forEach(i => { current.cells[i] = v; });
  if (!tutorial) store.saveDraft(current);
  pushHistory();
  tutorial?.record({ type: 'paint', tool, color: v, cells: cellIdxs }, current.cells);
}

// ---- 着色確定（2段階確定 C-3）。プレビュー中のマスを確定し、1マスへ自動で戻る（ワンショット）----
function confirmApply() {
  if (tutorial?.passed) return;
  if (pendingColor == null || !previewCells.length) return;
  paintCells(previewCells);
  anchor = null; vStart = null; vEnd = null; vLine = false; previewCells = [];
  setMsg(''); setToolVisual('single');
  draw();
}

// ---- 履歴（undo/redo・1確定=1手） ----
function pushHistory() {
  history = history.slice(0, histIndex + 1);
  history.push(current.cells.slice());
  if (history.length > 40) history.shift();
  histIndex = history.length - 1;
  updateUndoRedo();
}
function undo() {
  if (tutorial?.passed) return;
  if (histIndex <= 0) return;
  histIndex--;
  current.cells = history[histIndex].slice();
  if (!tutorial) store.saveDraft(current);
  tutorial?.record({ type: 'undo' }, current.cells);
  previewCells = []; setMsg('もどした');
  updateUndoRedo(); draw();
}
function redo() {
  if (tutorial?.passed) return;
  if (histIndex >= history.length - 1) return;
  histIndex++;
  current.cells = history[histIndex].slice();
  if (!tutorial) store.saveDraft(current);
  previewCells = []; setMsg('やりなおした');
  updateUndoRedo(); draw();
}
function updateUndoRedo() {
  const u = $('btn-undo'), r = $('btn-redo');
  if (u) u.disabled = histIndex <= 0;
  if (r) r.disabled = histIndex >= history.length - 1;
}

// ---- 保存 ----
function doSave() {
  if (tutorial) { setMsg('れんしゅうは ほぞんしないよ'); return; }
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
  tutorialGuide = createTutorialGuide({
    onOpen: () => { voice?.disable(); void enableVoice(); },
    onClose: () => { if (activeScreen === 'make') { voice?.disable(); void enableVoice(); } },
    onRestart: startTutorial, onRetry: retryTutorial, onFinish: () => show('mode'),
  });
  help = createHelp({
    onOpen: () => { voice?.disable(); try { speechSynthesis.cancel(); } catch {} },
    onClose: () => { if (activeScreen === 'make') void enableVoice(); },
  });
  qa('.ir-help-open').forEach(b => { b.onclick = () => {
    if (tutorial?.passed) nextTutorial();
    else if (tutorial) tutorialGuide.show(tutorial.undoReady ? 'undo' : 'lesson', tutorial);
    else help.show(activeScreen);
  }; });
  $('heart-practice').onclick = () => {
    tutorial = null;
    openMake({id:store.newId(),size:5,cells:createCells(5),mode:'template',templateId:'heart-5',createdAt:null},null,true);
  };
  $('template-reference').onclick = () => {
    if (recipePractice) recipePage = Math.min(recipeStep,4);
    showTemplateReference();
  };
  $('recipe-overview').onclick = () => { recipePage = -1; renderTemplateReference(); };
  $('recipe-open').onclick = () => { recipePage = Math.max(0,recipePage); renderTemplateReference(); };
  $('recipe-prev').onclick = () => { recipePage = Math.max(0,recipePage-1); renderTemplateReference(); };
  $('recipe-next').onclick = () => { recipePage = Math.min(HEART_RECIPE.length-1,recipePage+1); renderTemplateReference(); };
  $('template-close').onclick = $('template-done').onclick = () => $('template-dialog').close();
  $('template-dialog').addEventListener('close', () => { voice?.disable(); if (activeScreen === 'make') void enableVoice(); });
  $('template-guide-toggle').onclick = () => {
    templateGuideVisible = !templateGuideVisible;
    updateTemplateToggle(); draw();
  };
  $('ver').textContent = APP_VERSION;
  try { readAloud = localStorage.getItem(PREF_READ) === '1'; } catch { readAloud = false; }
  updateReadBtn();
  $('btn-read').onclick = toggleRead;
  // ヘッダー：ホーム（コエキットへ）。マイクは状態表示（トグルではない）
  $('home-btn').onclick = () => { location.href = '../'; };
  // パレット付近：けす（消しゴム）・もどす・やりなおし（音声にも対応・C-2）
  $('btn-erase').onclick = () => selectColor(ERASE);
  $('btn-undo').onclick = undo;
  $('btn-redo').onclick = redo;
  // モード選択
  qa('[data-go]').forEach(b => b.onclick = () => {
    const go = b.dataset.go;
    if (go === 'free') show('size');
    else if (go === 'tutorial') startTutorial();
    else if (go === 'list') show('list');
    else if (go === 'template') show('templates');
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
function micState(s) {
  const el = $('mic-state'); if (el) setMicState(el, null, s);
}
function onVoiceState(s) {
  micState(s);
  if (s === 'listening') setMsg('こえで いえるよ');
  else if (s === 'denied') setMsg('マイクが つかえないよ（タッチでOK）');
}
function heartExplanationOpen() {
  return $('template-dialog').open && current?.templateId === 'heart-5';
}
async function enableVoice() {
  const request = ++voiceRequest;
  if (activeScreen !== 'make' || help.open || ($('template-dialog').open && !heartExplanationOpen())) return;
  if (!voice) { voice = new VoiceInput({ onText: onVoiceText, onState: onVoiceState }); voice.setGrammar(makeGrammar()); }
  if (voice.active) return;
  voice.setGrammar(heartExplanationOpen() ? ['オッケー','オーケー','おっけー','おーけー'] : tutorialGuide.open ? ['オーケー', 'オッケー', 'つぎ', '次', 'やめる', 'おわり'] : tutorial ? [...makeGrammar(), 'つぎ', '次'] : makeGrammar());
  if (!(await voice.isAvailable())) { setMsg('このブラウザは こえが つかえないよ（タッチでOK）'); micState('denied'); return; }
  if (request !== voiceRequest || activeScreen !== 'make' || help.open || ($('template-dialog').open && !heartExplanationOpen())) return;
  await voice.enable();
}
function onVoiceText(text) {
  if (activeScreen !== 'make' || help.open || ($('template-dialog').open && !heartExplanationOpen())) return;
  if ($('template-dialog').open) {
    if (heartExplanationOpen() && /^(オーケー|オッケー|おーけー|おっけー)$/.test(text.replace(/\s/g,''))) $('template-dialog').close();
    return;
  }
  if (tutorialGuide.open) {
    if (/^(やめる|おわり|終わり)$/.test(text.trim())) show('mode');
    else if (/^(つぎ|次|オーケー|オッケー|おーけー|おっけー)$/.test(text.trim())) tutorialGuide.primary();
    return;
  }
  if (tutorial?.passed) {
    if (parse(text).some(t => t.type === 'kw' && t.val === 'quit')) show('mode');
    else if (/^(つぎ|次|オーケー|オッケー|おーけー|おっけー)$/.test(text.trim())) nextTutorial();
    return;
  }
  interpretVoice(parse(text));
}

// トークン列を制作モデルへ反映（全発話・分割発話の両対応）
// 合意モデル：素の座標＝カーソル移動（＝言い直し・最後が有効）／「から」＝始点／「まで」＝終点／
// 「せん」＝線。始点+終点が揃えば範囲/線プレビュー、揃わなければ現在マスの1マスに退化。オッケーで確定。
function interpretVoice(tokens) {
  let i = 0;
  while (i < tokens.length) {
    if (activeScreen !== 'make' || tutorial?.passed || tutorialGuide.open) break;
    const t = tokens[i];
    if (t.type === 'kw') {
      if (t.val === 'save') doSave();
      else if (t.val === 'quit') show('mode');                                   // やめる／おわり
      else if (t.val === 'ok') confirmApply();
      else if (t.val === 'undo') undo();
      else if (t.val === 'redo') redo();
      else if (t.val === 'erase') voiceColor(ERASE);                             // けす（消しゴム）
      else if (t.val === 'kara') { vStart = { row: cursor.row, col: cursor.col }; voicePreview(); } // 始点＝いま言った座標（範囲モードに入る）
      else if (t.val === 'made') { vEnd = { row: cursor.row, col: cursor.col }; voicePreview(); }    // 終点（省略可）
      else if (t.val === 'sen') { vLine = true; voicePreview(); }
      i++;
    } else if (t.type === 'color') { voiceColor(t.val); i++; }
    else if (t.type === 'dir') {
      let steps = 1;
      if (tokens[i + 1] && tokens[i + 1].type === 'digit') { steps = Number(tokens[i + 1].val); i += 2; } else i++;
      voiceMove(t.val, steps);
    } else if (t.type === 'col' || t.type === 'digit') {
      let col = null, row = null;
      while (i < tokens.length && (tokens[i].type === 'col' || tokens[i].type === 'digit')) {
        if (tokens[i].type === 'col' && col == null) col = tokens[i].val;
        else if (tokens[i].type === 'digit' && row == null) row = tokens[i].val;
        else break;
        i++;
      }
      voiceSetCoord(col, row);
    } else i++;
  }
}
function setToolVisual(t) {
  tool = t;
  qa('.ir-tool').forEach(b => b.classList.toggle('is-active', b.dataset.tool === t));
}
// 数字だけの絶対座標は無視。列指定を伴う言い直し・列だけの訂正は維持。
function voiceSetCoord(colLetter, rowDigit) {
  if (colLetter == null) return; // 列の認識脱落で現在列の別の行へ動くのを防ぐ
  const size = current.size;
  let r = cursor.row, c = cursor.col;
  if (rowDigit != null) r = Number(rowDigit) - 1;
  if (colLetter != null) c = colIndex(colLetter);
  if (!inRange(size, r, c)) { sfxWrong(); return; }   // 範囲外は不正解音・位置維持
  cursor = { row: r, col: c };
  if (vStart) vEnd = { row: r, col: c };              // 「から」の後の座標は終点（まで省略可・言い直しは最後が有効）
  voicePreview();
}
function voiceMove(dir, steps) {
  const size = current.size; let r = cursor.row, c = cursor.col;
  if (dir === 'みぎ') c += steps; else if (dir === 'ひだり') c -= steps; else if (dir === 'うえ') r -= steps; else if (dir === 'した') r += steps;
  if (!inRange(size, r, c)) { sfxWrong(); return; }
  cursor = { row: r, col: c };
  voicePreview();
}
function voiceColor(i) {
  pendingColor = i;
  if (i !== ERASE) speak(colorName(i));
  highlightPaint(i);
  voicePreview();
}
// 始点＋終点が揃えば範囲/線、揃わなければ現在マスの1マス（せん/からの退化＝キャンセル）
function voicePreview() {
  const size = current.size;
  if (vStart && vEnd) {
    previewCells = vLine ? lineCells(size, vStart, vEnd) : rectCells(size, vStart, vEnd);
    setToolVisual(vLine ? 'line' : 'range');
    setMsg(pendingColor != null ? 'オーケーで きめてね' : 'いろを えらんでね');
  } else {
    previewCells = (pendingColor != null) ? [idx(size, cursor.row, cursor.col)] : [];
    setToolVisual('single');
    if (vStart) setMsg('おわりの ばしょ、または いろ');
    else setMsg(pendingColor != null ? 'オーケーで きめてね' : '');
  }
  draw();
}

init();
