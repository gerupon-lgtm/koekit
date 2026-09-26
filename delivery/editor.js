import { validateStage } from './rules.js';
const SIZES = [3, 5, 7, 9];
const PIECES = { robot: 'ロボット', destination: 'とどけさき', package: 'にもつ', obstacle: 'しょうがいぶつ', erase: 'けす' };
const PIECE_ASSETS = { robot: 'robot-empty.webp', destination: 'destination.svg', package: 'package.svg', obstacle: 'obstacle.svg' };
const clone = value => JSON.parse(JSON.stringify(value));
const newId = () => globalThis.crypto?.randomUUID?.() || `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const COL_WORDS = [['a', 'えい', 'ええ', 'えー'], ['b', 'びー', 'びい', 'びぃー', 'びぃ'], ['c', 'しー', 'しい'], ['d', 'でー', 'で', 'でぃ', 'でぃー'], ['e', 'いー', 'いい'], ['f', 'えふ'], ['g', 'じー'], ['h', 'えっち'], ['i', 'あい']];
const ROW_WORDS = [['1', 'いち'], ['2', 'に'], ['3', 'さん'], ['4', 'よん', 'し'], ['5', 'ご'], ['6', 'ろく'], ['7', 'なな', 'しち'], ['8', 'はち'], ['9', 'きゅう', 'く']];
const EDIT_WORDS = { robot: ['ロボット', 'ろぼっと'], destination: ['とどけさき', '届け先'], package: ['にもつ', '荷物'], obstacle: ['しょうがいぶつ', '障害物'], erase: ['けす', '消す'], confirm: ['オッケー', 'オーケー', 'おっけー', 'おーけー'], save: ['ほぞん', '保存'], end: ['おわり', '終わり'] };
const normalized = raw => String(raw).toLowerCase().replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s　]+/g, '');
export function editorVocabulary(size = 9) { return [...COL_WORDS.slice(0, size).flat(), ...ROW_WORDS.slice(0, size).flat(), ...Object.values(EDIT_WORDS).flat()]; }
export function parseEditorUtterance(raw, size = 9) {
  const word = normalized(raw);
  for (const [type, forms] of Object.entries(EDIT_WORDS)) if (forms.some(form => normalized(form) === word)) return Object.hasOwn(PIECES, type) ? { type: 'piece', piece: type } : { type };
  for (let column = 0; column < size; column++) for (let row = 0; row < size; row++) for (const c of COL_WORDS[column]) for (const r of ROW_WORDS[row]) if (normalized(c + r) === word) return { type: 'coordinate', column, row, cell: row * size + column };
  return null;
}

export function createDraft(size = 3, id = newId()) {
  if (!SIZES.includes(size)) throw new RangeError('INVALID_SIZE');
  const now = new Date().toISOString();
  return { id, revision: 0, size, blocked: [], start: null, destination: null, packages: [], stepLimit: null, createdAt: now, updatedAt: now };
}

export function duplicateDraft(stage, id = newId()) {
  const now = new Date().toISOString();
  return { ...clone(stage), id, revision: 0, createdAt: now, updatedAt: now };
}

export function placePiece(stage, cell, piece) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= stage.size ** 2 || !Object.hasOwn(PIECES, piece)) return { ok: false, code: 'INVALID_CELL', stage };
  const occupied = stage.start === cell || stage.destination === cell || stage.packages.some(p => p.cell === cell) || stage.blocked.includes(cell);
  if (piece !== 'erase' && occupied) return { ok: false, code: 'OCCUPIED', stage };
  if (piece === 'package' && stage.packages.length >= 4) return { ok: false, code: 'PACKAGE_FULL', stage };
  const next = clone(stage);
  if (piece === 'robot') next.start = cell;
  if (piece === 'destination') next.destination = cell;
  if (piece === 'package') {
    const ids = new Set(next.packages.map(p => p.id));
    let id = 0;
    while (ids.has(`package-${id}`)) id++;
    next.packages.push({ id: `package-${id}`, cell });
  }
  if (piece === 'obstacle') next.blocked.push(cell);
  if (piece === 'erase') {
    if (next.start === cell) next.start = null;
    if (next.destination === cell) next.destination = null;
    next.packages = next.packages.filter(p => p.cell !== cell);
    next.blocked = next.blocked.filter(c => c !== cell);
  }
  next.revision++;
  return { ok: true, stage: next };
}

export function resizeDraft(stage, size) {
  if (!SIZES.includes(size)) throw new RangeError('INVALID_SIZE');
  const remap = cell => cell === null ? null : Math.floor(cell / stage.size) < size && cell % stage.size < size ? Math.floor(cell / stage.size) * size + cell % stage.size : null;
  return { ...clone(stage), size, revision: stage.revision + 1, start: remap(stage.start), destination: remap(stage.destination), blocked: stage.blocked.map(remap).filter(c => c !== null), packages: stage.packages.map(p => ({ ...p, cell: remap(p.cell) })).filter(p => p.cell !== null) };
}

export function classifyDraft(stage, analysis) {
  if (stage.start === null || stage.destination === null || !stage.packages.length) return 'incomplete';
  if (!analysis || analysis.status === 'searching') return 'searching';
  if (!['solved', 'ok'].includes(analysis.status)) return analysis.status === 'no-solution' || analysis.status === 'unsolvable' ? 'unsolvable' : 'error';
  return !Number.isInteger(stage.stepLimit) || stage.stepLimit < analysis.minSteps ? 'limit-insufficient' : 'ready';
}

export function reorderStages(ids, index, offset) {
  const next = [...ids];
  if (!Number.isInteger(index) || index < 0 || index >= next.length || index + offset < 0 || index + offset >= next.length) return next;
  [next[index], next[index + offset]] = [next[index + offset], next[index]];
  return next;
}

/** Uses DeliveryStorage and SearchClient; simple callback adapters also supported. */
export function mountEditor(host, { storage, search, onPlay, onClose, onSpeechContext = () => {} }) {
  let library = { schemaVersion: 1, revision: 0, stages: [] };
  let mode = 'library', current = null, selected = null, piece = 'robot', analysis = null, message = '', order = [];
  let disposed = false, analysisEpoch = 0, saveTimer = null, dirty = false, pendingDelete = null, zoom = false;
  let analysisAbort = new AbortController();
  let saveConflict = false;
  const analyses = new Map();
  const loaded = storage.loadLibrary ? storage.loadLibrary() : storage.load('library');
  let storageRevision = loaded?.revision ?? 0;
  if (loaded?.ok && loaded.value) library = { ...library, ...clone(loaded.value) };
  else if (loaded?.stages) library = clone(loaded);
  else if (loaded?.value?.stages) library = clone(loaded.value);
  if (loaded?.ok === false) message = '保存を読みこめません。保存済みの内容は消していません。';

  function el(tag, text, className) {
    const node = host.ownerDocument.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action, disabled = false) {
    const node = el('button', text); node.type = 'button'; node.disabled = disabled; node.addEventListener('click', action); return node;
  }
  function persist(candidate, success = '') {
    const result = storage.saveLibrary ? storage.saveLibrary(candidate) : storage.save('library', { stages: candidate.stages }, storageRevision);
    if (result?.ok === false) { saveConflict = result.code === 'STALE_REVISION'; message = saveConflict ? '別の画面で更新されています。編集中の内容を保ったまま、保存を止めました。' : '保存できませんでした。内容はこの画面に残っています。もう一度「ほぞん」を押してください。'; render(); return false; }
    library = { ...candidate, ...clone(result?.value || {}) };
    storageRevision = result?.revision ?? storageRevision + 1;
    saveConflict = false;
    message = success;
    dirty = false;
    return true;
  }
  function saveCurrent(explicit = false) {
    if (!current || disposed) return false;
    clearTimeout(saveTimer);
    current.updatedAt = new Date().toISOString();
    const candidate = clone(library);
    const index = candidate.stages.findIndex(s => s.id === current.id);
    if (index === -1) {
      if (candidate.stages.length >= 10) { message = '10めん いっぱいです。保存済みの面をへんしゅうしてください。'; render(); return false; }
      candidate.stages.push(clone(current));
    } else candidate.stages[index] = clone(current);
    candidate.revision = library.revision + 1;
    const ok = persist(candidate, explicit ? 'ほぞんしました。' : '下書きをほぞんしました。');
    if (!ok) dirty = true;
    if (ok && explicit) render();
    else if (ok) { const feedback = host.querySelector?.('.delivery-editor-feedback'); if (feedback) feedback.textContent = message; }
    return ok;
  }
  function scheduleSave() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(() => saveCurrent(), 300); }
  function complete(stage) { return stage.start !== null && stage.destination !== null && stage.packages.length > 0; }
  async function inspect(stage, epoch, editing = false) {
    let result;
    try { result = complete(stage) ? await (typeof search === 'function' ? search(clone(stage)) : search.run('solve', { stage: clone(stage) }, { signal: analysisAbort.signal })) : { status: 'incomplete' }; }
    catch { result = { status: 'error' }; }
    if (disposed || epoch !== analysisEpoch) return;
    analyses.set(stage.id, { revision: stage.revision, ...result });
    if (editing && current?.id === stage.id && current.revision === stage.revision) {
      analysis = result;
      if (['solved', 'ok'].includes(result.status) && current.stepLimit === null) { current.stepLimit = result.minSteps; scheduleSave(); }
    }
    render();
  }
  function analyzeCurrent() {
    analysisAbort.abort(); analysisAbort = new AbortController();
    const epoch = ++analysisEpoch;
    analysis = complete(current) ? { status: 'searching' } : { status: 'incomplete' };
    inspect(clone(current), epoch, true);
  }
  async function inspectLibrary() {
    analysisAbort.abort(); analysisAbort = new AbortController();
    const epoch = ++analysisEpoch;
    for (const stage of library.stages) { if (disposed || epoch !== analysisEpoch) return; await inspect(clone(stage), epoch); }
  }
  function open(stage) {
    mode = 'edit'; current = clone(stage); selected = null; analysis = null; pendingDelete = null; dirty = false; message = ''; analyzeCurrent(); render();
  }
  function newStage() {
    if (library.stages.length >= 10) { message = '10めん いっぱいです。面をへんしゅう・削除してください。'; render(); return; }
    open(createDraft()); saveCurrent();
  }
  function mutate(stage) { current = stage; scheduleSave(); analyzeCurrent(); render(); }
  function confirmPlacement() {
    const result = placePiece(current, selected, piece);
    if (!result.ok) { message = result.code === 'OCCUPIED' ? 'そのマスには置いてあります。先に「けす」を選んでください。' : result.code === 'PACKAGE_FULL' ? 'にもつは4こまでです。' : '置くマスを選んでください。'; render(); return; }
    message = `${PIECES[piece]}を置きました。`; mutate(result.stage);
  }
  function statusText(stage, result) {
    const status = classifyDraft(stage, result);
    return { incomplete: '下書き：ロボット・とどけさき・にもつを置いてね', searching: '最低ほすうをしらべています…', unsolvable: '下書き：とどけられる道がありません', error: '下書き：探索できませんでした', 'limit-insufficient': `下書き：上限がたりません（最低 ${result?.minSteps}歩）`, ready: `あそべます・最低 ${result?.minSteps}歩` }[status];
  }
  function board(stage, interactive = false) {
    const viewport = el('div', undefined, 'delivery-editor-board-scroll');
    const grid = el('div', undefined, `delivery-editor-board${zoom && interactive ? ' is-zoomed' : ''}${interactive ? '' : ' is-preview'}`);
    grid.style.setProperty('--editor-size', stage.size);
    grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', `${stage.size}×${stage.size}の盤面`);
    for (let cell = 0; cell < stage.size ** 2; cell++) {
      const label = `${String.fromCharCode(65 + cell % stage.size)}${Math.floor(cell / stage.size) + 1}`;
      const kind = stage.start === cell ? 'robot' : stage.destination === cell ? 'destination' : stage.packages.some(p => p.cell === cell) ? 'package' : stage.blocked.includes(cell) ? 'obstacle' : null;
      const node = interactive ? button(kind ? undefined : '·', () => { selected = cell; message = `${label}を選びました。種類を選んで「ここに おく」。`; render(); }) : el('span', kind ? undefined : '·');
      if (kind) { const image = el('img'); image.src = new URL(`../assets/delivery/${PIECE_ASSETS[kind]}`, import.meta.url).href; image.alt = ''; image.draggable = false; image.setAttribute('aria-hidden', 'true'); node.append(image); }
      node.className = `delivery-editor-cell${stage.blocked.includes(cell) ? ' is-blocked' : ''}${interactive && selected === cell ? ' is-selected' : ''}`;
      node.setAttribute('aria-label', `${label} ${kind ? PIECES[kind] : '空きマス'}`);
      if (interactive) node.setAttribute('aria-pressed', String(selected === cell));
      grid.append(node);
    }
    viewport.append(grid); return viewport;
  }
  function backToLibrary() {
    if (dirty && !saveCurrent()) return;
    clearTimeout(saveTimer); mode = 'library'; current = null; pendingDelete = null; inspectLibrary(); render();
  }
  function play(stages, preview) {
    if (preview && dirty && !saveCurrent()) return;
    const snapshot = clone(stages);
    clearTimeout(saveTimer); analysisAbort.abort();
    ++analysisEpoch;
    onSpeechContext(null);
    const returnToEditor = () => { if (!disposed) { mode = preview ? 'edit' : 'library'; if (preview) analyzeCurrent(); else inspectLibrary(); render(); } };
    onPlay(snapshot, { preview, onReturn: returnToEditor });
  }
  function render() {
    if (disposed) return;
    const active = host.ownerDocument.activeElement;
    const focusable = host.querySelectorAll ? [...host.querySelectorAll('button,input,select')] : [];
    const focusKey = node => `${node.tagName}|${node.getAttribute?.('aria-label') || node.getAttribute?.('data-editor-control') || node.textContent || ''}`;
    const focusedKey = active && host.contains?.(active) ? focusKey(active) : null;
    const focusedIndex = focusedKey ? focusable.filter(node => focusKey(node) === focusedKey).indexOf(active) : -1;
    const caret = active?.tagName === 'INPUT' ? [active.selectionStart, active.selectionEnd] : null;
    host.replaceChildren(); host.classList.add('delivery-editor');
    host.append(el('h2', mode === 'edit' ? 'めんを つくる' : mode === 'order' ? 'あそぶ じゅんばん' : 'つくる・あそぶ'));
    const feedback = el('p', message, 'delivery-editor-feedback'); feedback.setAttribute('role', 'status'); host.append(feedback);
    if (saveConflict) host.append(button('最新の一覧を 読みなおす', () => {
      clearTimeout(saveTimer);
      const latest = storage.loadLibrary ? storage.loadLibrary() : storage.load('library');
      if (!latest?.ok) { message = '最新の一覧を読みこめませんでした。編集中の内容は残っています。'; render(); return; }
      library = { schemaVersion: 1, revision: 0, ...(clone(latest.value || { stages: [] })) };
      storageRevision = latest.revision ?? 0; saveConflict = false;
      message = current ? '最新の一覧を読みこみました。編集中の内容は残しています。「ほぞん」でこの内容を保存できます。' : '最新の一覧を読みこみました。';
      if (current) dirty = true; else inspectLibrary();
      render();
    }));
    if (mode === 'edit') renderEdit(); else if (mode === 'order') renderOrder(); else renderLibrary();
    if (focusedKey) {
      const replacement = [...host.querySelectorAll('button,input,select')].filter(node => focusKey(node) === focusedKey)[focusedIndex];
      replacement?.focus({ preventScroll: true });
      if (caret && replacement?.setSelectionRange) replacement.setSelectionRange(...caret);
    }
    onSpeechContext(mode === 'edit' ? { phase: 'editor', size: current.size, cell: selected, piece, words: editorVocabulary(current.size), onText: raw => controller.handleCommand(parseEditorUtterance(raw, current.size)), cue: '座標 → 置くもの → オッケー。ほぞん・おわり。', touch: 'マスと種類を選んで「ここに おく」。' } : null);
  }
  function renderEdit() {
    const nameLabel = el('label', 'めんの名前'); const name = el('input'); name.value = current.name || ''; name.maxLength = 40; name.setAttribute('data-editor-control', 'name');
    name.addEventListener('input', () => { current.name = name.value; scheduleSave(); }); nameLabel.append(name); host.append(nameLabel);
    const sizeLabel = el('label', 'ばんめんのサイズ'); const size = el('select');
    for (const n of SIZES) { const option = el('option', `${n}×${n}`); option.value = n; option.selected = n === current.size; size.append(option); }
    size.addEventListener('change', () => { selected = null; mutate(resizeDraft(current, Number(size.value))); }); sizeLabel.append(size); host.append(sizeLabel);
    host.append(el('p', 'マスを選ぶ → 置くものを選ぶ →「ここに おく」で確定。サイズを小さくすると、外側のものは消えます。'));
    if (current.size === 9) host.append(button(zoom ? 'ばんめんを もとにもどす' : 'ばんめんを おおきく', () => { zoom = !zoom; render(); }));
    host.append(board(current, true));
    const controls = el('div', undefined, 'delivery-editor-controls');
    const columnLabel = el('label', '列（A〜' + String.fromCharCode(64 + current.size) + '）'); const column = el('select');
    const rowLabel = el('label', '行（1〜' + current.size + '）'); const row = el('select');
    for (let n = 0; n < current.size; n++) { const c = el('option', String.fromCharCode(65 + n)); c.value = n; c.selected = selected !== null && selected % current.size === n; column.append(c); const r = el('option', String(n + 1)); r.value = n; r.selected = selected !== null && Math.floor(selected / current.size) === n; row.append(r); }
    columnLabel.append(column); rowLabel.append(row); controls.append(columnLabel, rowLabel, button('このマスを えらぶ', () => { selected = Number(row.value) * current.size + Number(column.value); render(); })); host.append(controls);
    host.append(el('p', selected === null ? '置くマスを選んでね' : `えらんだマス：${String.fromCharCode(65 + selected % current.size)}${Math.floor(selected / current.size) + 1}`));
    const tools = el('div', undefined, 'delivery-editor-tools');
    for (const [kind, label] of Object.entries(PIECES)) { const tool = button(label, () => { piece = kind; render(); }); tool.setAttribute('aria-pressed', String(piece === kind)); tools.append(tool); }
    host.append(tools, button('ここに おく（オッケー）', confirmPlacement, selected === null));
    host.append(el('p', statusText(current, analysis), 'delivery-editor-analysis'));
    if (complete(current) && !['solved', 'ok', 'searching'].includes(analysis?.status)) host.append(button('もういちど しらべる', () => { analyzeCurrent(); render(); }));
    const limits = el('div', undefined, 'delivery-editor-controls');
    const solved = ['solved', 'ok'].includes(analysis?.status);
    limits.append(el('span', `ほすうの上限：${current.stepLimit ?? '未設定'}歩`), button('− 1歩', () => { if (solved && current.stepLimit > analysis.minSteps) { current.stepLimit--; scheduleSave(); render(); } }, !solved || current.stepLimit <= analysis.minSteps), button('＋ 1歩', () => { current.stepLimit = Math.max((current.stepLimit ?? 0) + 1, solved ? analysis.minSteps : 1); scheduleSave(); render(); }));
    if (solved && classifyDraft(current, analysis) === 'limit-insufficient') limits.append(button(`最低 ${analysis.minSteps}歩に あわせる`, () => { current.stepLimit = analysis.minSteps; scheduleSave(); render(); }));
    host.append(limits);
    const actions = el('div', undefined, 'delivery-editor-controls'); actions.append(button('ほぞん', () => saveCurrent(true)), button('ためしに あそぶ', () => play([current], true), classifyDraft(current, analysis) !== 'ready'), button('一覧へ もどる', backToLibrary)); host.append(actions);
  }
  function renderLibrary() {
    host.append(el('p', `${library.stages.length} / 10めん。下書きもほぞんできます。`));
    const actions = el('div', undefined, 'delivery-editor-controls'); actions.append(button('あたらしく つくる', newStage, library.stages.length >= 10), button('じゅんばんを えらんで あそぶ', () => { mode = 'order'; order = []; render(); }, !library.stages.length), button('タイトルへ もどる', onClose)); host.append(actions);
    if (!library.stages.length) host.append(el('p', 'まだ面がありません。「あたらしく つくる」から はじめよう。'));
    for (const [index, stage] of library.stages.entries()) {
      const card = el('article', undefined, 'delivery-editor-card'); card.append(el('h3', stage.name || `めん ${index + 1}`), board(stage), el('p', statusText(stage, analyses.get(stage.id))));
      const buttons = el('div', undefined, 'delivery-editor-controls'); buttons.append(button('へんしゅう', () => open(stage)), button('ふくせい', () => { const candidate = clone(library); const copied = { ...duplicateDraft(stage), name: `${stage.name || `めん ${index + 1}`} のコピー` }; if (candidate.stages.length >= 10) return; candidate.stages.push(copied); candidate.revision++; if (persist(candidate, 'ふくせいしました。')) { inspectLibrary(); render(); } }, library.stages.length >= 10), button('削除', () => { pendingDelete = stage.id; render(); })); card.append(buttons);
      if (pendingDelete === stage.id) { const confirm = el('div', undefined, 'delivery-editor-delete'); confirm.setAttribute('role', 'group'); confirm.setAttribute('aria-label', '削除の確認'); confirm.append(el('p', 'この面を削除しますか？ もとにもどせません。'), button('削除する', () => { const candidate = clone(library); candidate.stages = candidate.stages.filter(s => s.id !== stage.id); candidate.revision++; if (persist(candidate, '削除しました。')) { pendingDelete = null; render(); } }), button('やめる', () => { pendingDelete = null; render(); })); card.append(confirm); }
      host.append(card);
    }
  }
  function renderOrder() {
    host.append(el('p', '完成した面を選んで、上へ・下へで じゅんばんを変えてね。称号はつきません。'));
    for (const [index, stage] of library.stages.entries()) {
      const ready = classifyDraft(stage, analyses.get(stage.id)) === 'ready';
      const item = button(`${order.includes(stage.id) ? '✓ ' : ''}${stage.name || `めん ${index + 1}`}${ready ? '' : '（下書き）'}`, () => { order = order.includes(stage.id) ? order.filter(id => id !== stage.id) : [...order, stage.id]; render(); }, !ready); item.setAttribute('aria-pressed', String(order.includes(stage.id))); host.append(item);
    }
    const list = el('ol');
    order.forEach((id, index) => { const stage = library.stages.find(s => s.id === id); const li = el('li'); li.append(el('span', stage.name || `めん ${library.stages.indexOf(stage) + 1}`), button('上へ', () => { order = reorderStages(order, index, -1); render(); }, index === 0), button('下へ', () => { order = reorderStages(order, index, 1); render(); }, index === order.length - 1)); list.append(li); }); host.append(list);
    host.append(button('このじゅんばんで スタート', () => { const stages = order.map(id => library.stages.find(s => s.id === id)); if (stages.every(s => classifyDraft(s, analyses.get(s.id)) === 'ready')) play(stages, false); }, !order.length), button('一覧へ もどる', () => { mode = 'library'; render(); }));
  }
  const controller = {
    restorePreview(snapshot) {
      if (disposed || !snapshot?.current || !validateStage(snapshot.current, { draft: true }).ok) return;
      mode = 'edit'; current = clone(snapshot.current); selected = snapshot.selected ?? null;
      piece = Object.hasOwn(PIECES, snapshot.piece) ? snapshot.piece : 'robot';
      dirty = false; message = 'ためしに あそぶ前の面に もどりました。';
      analyzeCurrent(); render();
    },
    dispose() { if (disposed) return; if (dirty) saveCurrent(); disposed = true; ++analysisEpoch; clearTimeout(saveTimer); analysisAbort.abort(); onSpeechContext(null); },
    getState() { return clone({ mode, current, selected, piece, analysis, library, order, dirty }); },
    handleCommand(command) {
      if (disposed || mode !== 'edit' || !command) return false;
      if (command.type === 'coordinate') {
        const cell = command.cell ?? (Number.isInteger(command.row) && Number.isInteger(command.column) ? command.row * current.size + command.column : null);
        if (!Number.isInteger(cell) || cell < 0 || cell >= current.size ** 2) return false;
        selected = cell; render(); return true;
      }
      if (command.type === 'piece' && Object.hasOwn(PIECES, command.piece)) { piece = command.piece; render(); return true; }
      if (command.type === 'confirm') { confirmPlacement(); return true; }
      if (command.type === 'save') { saveCurrent(true); return true; }
      if (command.type === 'close' || command.type === 'end') { backToLibrary(); return true; }
      return false;
    },
  };
  render(); inspectLibrary();
  return controller;
}
