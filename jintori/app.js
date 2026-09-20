import { normalizeOptions, createRun, startRun, rollRun, playMove, nextMatch, extendRun } from './run.js';
import { analyzeMove, listLegalMoves } from './rules.js';
import { SlotStore } from './storage.js';
import { parseCommand, grammarFor } from './commands.js';
import { SpeechSession } from './voice.js';
import { $, renderMenu, renderSetup, renderGame, renderResult, sideName } from './view.js';
import { Roulette } from '../src/game/roulette.js';
import { ScreenAwake } from '../src/ui/screenawake.js';
import { setMicState } from '../src/ui/micstate.js';
import * as sfx from './sound.js';
import { CONFIG } from './config.js';

let options = normalizeOptions(), run = null, lease = null;
let pending = emptyPending(), selected = [null, null], selectedSide = 0;
let generation = 0, timer = null, worker = null, roulette = null, modal = null;
let busy = false, memoryOnly = false, conflict = false, starting = false, finishing = false;
const awake = new ScreenAwake();
const store = new SlotStore({ onConflict: showConflict });
const speech = new SpeechSession({
  onText: (raw, context) => {
    if (context.generation !== generation || document.hidden) return;
    const command = parseCommand(raw, context.phase, run?.match?.size || 8, availableItems());
    if (command) void dispatch(command);
  },
  onState: state => setMicState($('mic-state'), null, state),
});
function emptyPending(item = 'basic') { return { item, cell: null, analysis: null, directionId: null }; }
function availableItems() {
  if (!run?.match || run.match.size === 4) return [];
  return ['enhanced', 'strongest'].filter(item => run.inventoryBySide[run.match.sideToMove][item] > 0);
}
function stopWork() {
  generation++;
  speech.close(); clearTimeout(timer); timer = null;
  worker?.terminate(); worker = null;
  roulette?.reset(); roulette = null;
  sfx.stopAll(); busy = false;
}
function notify(text) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(notify.timer); notify.timer = setTimeout(() => { $('toast').hidden = true; }, CONFIG.timing.toast);
}
function status(text = '') { $('save-status').textContent = text; $('save-status').hidden = !text; }
function listen(phase) {
  if (document.hidden || conflict) return;
  void speech.open(grammarFor(phase, run?.match?.size || 8, availableItems()), { phase, generation });
}
function save() {
  if (memoryOnly) return;
  try { store.save(run, lease); status(); }
  catch (error) {
    if (error.code === 'SAVE_CONFLICT' || error.code === 'STALE_ACTION') { showConflict(); return; }
    status('この端末に保存できません。対戦は続けられます。次の確定時に再試行します。');
  }
}
function showConflict() {
  stopWork(); conflict = true;
  openDialog('conflict', '別の画面で更新されました', 'この画面の操作を止めました。最新の保存を読み直してください。', [
    ['最新の保存を読み直す', async () => { await store.close(); location.reload(); }],
  ]);
}
function screen(id) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id;
  $('home').hidden = Boolean(run); $('quit').hidden = !run;
  awake.setActive(Boolean(run));
}
function render() {
  const focused = document.activeElement;
  const focusKey = ['cell', 'color', 'direction'].find(key => focused?.dataset?.[key] !== undefined);
  const focusValue = focusKey ? focused.dataset[focusKey] : null;
  stopWork();
  if (modal || conflict || document.hidden) return;
  if (!run) {
    screen('title'); const saved = store.load(options); renderMenu(options, saved);
    if (saved.error) status(saved.error === 'SAVE_INVALID' ? '保存を読み込めません。新しくはじめられます。' : 'この端末に保存できません。');
    return;
  }
  if (run.phase === 'setup') { screen('setup'); renderSetup(run, selected, selectedSide); listen('setup'); }
  else if (run.phase === 'dice') { screen('dice'); startDice(); listen('dice'); }
  else if (run.phase === 'playing') {
    screen('game');
    const cpu = run.mode.opponent === 'cpu' && run.match.sideToMove === 2;
    renderGame(run, pending, cpu);
    if (cpu) startCPU(); else listen(pending.analysis?.needsDirection ? 'direction' : 'human');
  } else { screen('result'); renderResult(run); listen(run.phase === 'seriesResult' ? 'series' : 'result'); }
  if (focusKey) document.querySelector(`[data-${focusKey}="${focusValue}"]:not(:disabled)`)?.focus({ preventScroll: true });
}
async function begin(resume) {
  if (starting || run) return;
  starting = true; stopWork();
  const token = generation;
  let loaded;
  try { loaded = await store.begin(options); lease = loaded.lease; memoryOnly = false; }
  catch (error) {
    if (error.code === 'SAVE_CONFLICT') { starting = false; showConflict(); return; }
    if (error.code === 'STALE_ACTION') { starting = false; return; }
    loaded = store.load(options); memoryOnly = true;
    status('この端末に保存できません。この画面を閉じるまで対戦できます。');
  }
  if (token !== generation) { await store.close(); starting = false; return; }
  if (resume && (loaded.error || !loaded.record.active)) { starting = false; await store.close(); render(); return; }
  run = resume ? loaded.record.active : createRun(options);
  if (!resume && run.mode.structure === 'streak') run.bestStreak = loaded.record.bestStreak;
  selected = [null, null]; selectedSide = 0; pending = emptyPending();
  starting = false; save(); render();
}
function startDice() {
  $('stop-dice').disabled = false; $('dice-result').textContent = '「ストップ」でとめよう';
  const token = generation;
  roulette = new Roulette({ faces: 6 });
  roulette.on('tick', value => { if (token === generation) $('dice-face').textContent = value + 1; });
  roulette.start();
}
function stopDice() {
  if (run?.phase !== 'dice' || busy) return;
  // Draw and save immediately: hiding during the stopping animation never rerolls.
  speech.close(); busy = true; $('stop-dice').disabled = true;
  const value = Math.floor(Math.random() * 6) + 1;
  run = rollRun(run, value); save();
  if (conflict) return;
  const token = generation;
  roulette.on('stop', () => {
    if (token !== generation) return;
    $('dice-face').textContent = value;
    $('dice-result').textContent = `${sideName(run, run.match.firstSide)} から！`;
    const duration = sfx.playDiceSound();
    timer = setTimeout(() => { if (token === generation) render(); }, Math.max(CONFIG.timing.diceResult, duration));
  });
  roulette.stop();
}
function startCPU() {
  busy = true;
  const token = generation;
  const accept = move => {
    if (token !== generation || !run || modal || document.hidden) return;
    worker?.terminate(); worker = null;
    commit(move?.cell ?? listLegalMoves(run.match)[0], move?.item || 'basic', move?.directionId ?? null);
  };
  try {
    worker = new Worker(new URL('./cpu-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = event => { if (event.data.token === token) accept(event.data.move); };
    worker.onerror = () => accept(null);
    worker.postMessage({ type: 'choose', token, state: run.match, difficulty: run.mode.difficultyId });
    timer = setTimeout(() => accept(null), CONFIG.timing.workerTimeout);
  } catch { accept(null); }
}
function commit(cell, item, directionId) {
  if (run?.phase !== 'playing') return;
  const previousCells = run.match.cells;
  stopWork();
  try { run = playMove(run, cell, item, directionId); }
  catch { notify('この手は確定できません。場所を選び直してください。'); pending = emptyPending(); render(); return; }
  pending = emptyPending(); save(); if (conflict) return;
  busy = true; screen('game'); renderGame(run, pending, true);
  const passed = run.match.turnInfo.passedSides;
  if (passed.length) notify(passed.map(side => `${sideName(run, side)} は置ける場所がないためパス`).join('。'));
  const flipped = run.match.cells.filter((owner,index) => index !== cell && owner !== previousCells[index]).length;
  const outcome = run.phase === 'seriesResult' ? run.series.outcome : run.match.outcome;
  const result = outcome === null ? null : outcome === 0 ? 'draw' : run.mode.opponent === 'cpu' && outcome === 2 ? 'loss' : 'win';
  const duration = sfx.playMoveSound({item, flipped, result, passed: passed.length > 0});
  const token = generation;
  timer = setTimeout(() => { if (token === generation) render(); }, Math.max(duration, passed.length ? CONFIG.timing.pass : CONFIG.timing.move));
}
function openDialog(kind, title, body, buttons) {
  stopWork(); modal = kind;
  $('dialog-title').textContent = title; $('dialog-body').textContent = body;
  if (kind === 'help') {
    const example = document.createElement('div');
    example.className = 'help-example';
    example.setAttribute('aria-label', '自分、相手、自分とはさむと、3つとも自分の色になります');
    example.textContent = '① ② ①　→　① ① ①';
    $('dialog-body').prepend(example);
  }
  $('dialog-actions').replaceChildren();
  for (const [label, action] of buttons) {
    const button = document.createElement('button'); button.textContent = label; button.className = 'big';
    button.addEventListener('click', () => { void action(); }); $('dialog-actions').append(button);
  }
  if (!$('dialog').open) $('dialog').showModal();
  if (kind === 'help' || kind === 'exit') listen(kind);
}
function closeDialog() { if (conflict || finishing) return; $('dialog').close(); modal = null; render(); }
async function finish() {
  if (finishing) return;
  finishing = true;
  stopWork();
  try { if (!memoryOnly) await store.finish(lease, run); }
  catch (error) {
    finishing = false;
    if (['SAVE_CONFLICT', 'STALE_ACTION'].includes(error.code)) { showConflict(); return; }
    openDialog('saveError', '終了を保存できません', '途中保存を消せていません。もう一度お試しください。', [['もう一度終了する', finish], ['対戦にもどる', closeDialog]]); return;
  }
  await store.close(); run = null; lease = null; pending = emptyPending();
  finishing = false;
  $('dialog').close(); modal = null; status(); render();
}
function quit() {
  if (!run) return;
  openDialog('exit', '対戦を終了しますか？', 'この対戦の途中保存を消して、メニューにもどります。最高記録は残ります。', [['終了する', finish], ['つづける', closeDialog]]);
}
async function dispatch(command) {
  const { type } = command;
  if (conflict || document.hidden) return;
  if (modal) {
    if (modal === 'exit' && ['confirm', 'quit'].includes(type)) await finish();
    else if (modal === 'exit' && type === 'cancel' || modal === 'help' && ['close', 'confirm'].includes(type)) closeDialog();
    else if (modal === 'help' && type === 'quit') quit();
    return;
  }
  if (type === 'help') { openDialog('help', 'あそびかた', '相手の色をはさむと、自分の色になります。場所を「えい いち」などと指定し、プレビューを見て「オッケー」。タッチでも遊べます。\n\n6×6・8×8では「きょうか」「さいきょう」を場所より先に選べます。きょうかは上下左右にも効果。さいきょうは自分の色を飛び越え、最多の1方向だけに効果。同数なら①②…を選んでからオッケー。「もどす」で選択を取り消せます。\n\n置けなければ自動でパス。両方とも置けなくなったら、多く取った方の勝ちです。', [['とじる', closeDialog]]); return; }
  if (type === 'quit') { quit(); return; }
  if (type === 'new' || type === 'resume') { await begin(type === 'resume'); return; }
  if (!run || busy) return;
  if (run.phase === 'setup') {
    if (type === 'color') {
      if (selected[1 - selectedSide] === command.color) { notify('あいてとちがう色をえらんでね'); return; }
      selected[selectedSide] = command.color; render();
    } else if (['confirm', 'confirmColor'].includes(type) && selected[0] !== null && run.mode.opponent === 'human' && selectedSide === 0) {
      selectedSide = 1; render();
    } else if (type === 'start') { run = startRun(run, selected); save(); render(); }
  } else if (run.phase === 'dice' && type === 'stop') stopDice();
  else if (run.phase === 'playing' && !(run.mode.opponent === 'cpu' && run.match.sideToMove === 2)) {
    if (type === 'undo') pending = emptyPending();
    else if (type === 'item' && availableItems().includes(command.item)) pending = emptyPending(command.item);
    else if (type === 'cell') pending = { ...emptyPending(pending.item), cell: command.cell, analysis: analyzeMove(run.match, command.cell, pending.item) };
    else if (type === 'invalidCell') {
      pending = emptyPending(pending.item); notify('盤面の中の場所を指定してね');
      stopWork(); renderGame(run, pending, false); const duration = sfx.playInvalidSound();
      const token = generation;
      timer = setTimeout(() => { if (token === generation) render(); }, Math.max(duration, CONFIG.timing.invalid));
      return;
    }
    else if (type === 'choice' && pending.analysis?.needsDirection) pending.directionId = pending.analysis.directions[command.number - 1]?.id ?? null;
    else if (type === 'confirm' && pending.analysis?.legal && (!pending.analysis.needsDirection || pending.directionId)) { commit(pending.cell, pending.item, pending.directionId); return; }
    else return;
    render();
  } else if (run.phase === 'result' && type === 'next') { run = nextMatch(run); save(); render(); }
  else if (run.phase === 'seriesResult' && type === 'extend' && run.series.outcome === 0) { run = extendRun(run); save(); render(); }
  else if (['result', 'seriesResult'].includes(run.phase) && type === 'finish') await finish();
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || button.disabled || button.closest('dialog')) return;
  sfx.primeAudio();
  if (button.dataset.option && !run && !starting) {
    options = normalizeOptions({ ...options, [button.dataset.option]: button.dataset.value }); render(); return;
  }
  const command = button.dataset.action ? { type: button.dataset.action } :
    button.dataset.color !== undefined ? { type: 'color', color: Number(button.dataset.color) } :
    button.dataset.cell !== undefined ? { type: 'cell', cell: Number(button.dataset.cell) } :
    button.dataset.item ? { type: 'item', item: button.dataset.item } :
    button.dataset.direction ? { type: 'choice', number: Number(button.dataset.direction) } : null;
  if (command) void dispatch(command);
});
$('dialog').addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopWork();
  else if (modal) { if (['help', 'exit'].includes(modal)) listen(modal); }
  else render();
});
window.addEventListener('pagehide', () => { stopWork(); void store.close(); awake.setActive(false); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
render();
