import { COLORS } from '../irodori/palette.js';
import { colLabel } from '../irodori/board.js';
import { countCells, listLegalMoves } from './rules.js';

export const $ = id => document.getElementById(id);
export const ITEM_NAMES = { basic: 'ふつう', enhanced: 'きょうか', strongest: 'さいきょう' };
const arrows = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };
const circled = ['①','②','③','④','⑤','⑥','⑦','⑧'];
export const sideName = (run, side) => side === 2 && run.mode.opponent === 'cpu' ? 'コンピュータ' : `プレイヤー${side}`;
const sideMark = (run, side) => side === 2 && run.mode.opponent === 'cpu' ? 'C' : String(side);
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function ink(index) {
  const hex = COLORS[index].hex.slice(1);
  const channels = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? '#252018' : '#fff';
}
function paint(el, color) {
  el.style.background = COLORS[color].hex;
  el.style.color = ink(color);
}
export function renderScores(host, run, counts = { 1: '', 2: '' }, activeSide = null) {
  host.replaceChildren();
  for (const side of [1, 2]) {
    const score = node('div', 'score' + (activeSide === side ? ' active' : ''));
    const chip = node('span', 'owner-chip', sideMark(run, side));
    paint(chip, run.colorsBySide?.[side] ?? (side === 1 ? 10 : 11));
    const label = node('div'); label.append(node('div', 'score-name', sideName(run, side)));
    const inv = run.inventoryBySide[side];
    if (run.match?.size >= 6) label.append(node('div', 'stock', `強化 ${inv.enhanced} · 最強 ${inv.strongest}`));
    score.append(chip, label, node('span', 'score-count', counts[side])); host.append(score);
  }
}
export function renderMenu(options, saved) {
  for (const button of document.querySelectorAll('[data-option]')) {
    button.setAttribute('aria-pressed', String(String(options[button.dataset.option]) === button.dataset.value));
    if (button.dataset.option === 'supplyPolicy') {
      button.disabled = options.structure === 'series' && options.size === 4;
    }
  }
  $('structure-options').hidden = options.opponent === 'human';
  $('series-options').hidden = options.structure === 'streak';
  $('difficulty-options').hidden = options.opponent === 'human';
  $('mode-note').textContent = options.structure === 'streak'
    ? '4 × 4 → 6 × 6 → 8 × 8。勝ってステップアップ。'
    : options.size === 4 ? '4 × 4 は、ふつうの色だけで対戦。' : options.supplyPolicy === 'refill'
      ? '毎局、きょうか1回・さいきょう1回。' : '対戦全体で、きょうか3回・さいきょう1回。';
  $('resume').hidden = !saved.record.active || Boolean(saved.error);
  $('record').textContent = options.structure === 'streak' ? `最高 ${saved.record.bestStreak} 連勝` : '';
}
export function renderSetup(run, selected, selectedSide) {
  $('color-turn').textContent = `${sideName(run, selectedSide + 1)} の色`;
  const colorsBySide = { 1: selected[0] ?? 10, 2: selected[1] ?? 11 };
  renderScores($('color-players'), { ...run, colorsBySide }, { 1: '', 2: '' }, selectedSide + 1);
  $('palette').replaceChildren();
  COLORS.forEach((color, index) => {
    const button = node('button', 'swatch');
    button.dataset.color = index;
    button.setAttribute('aria-label', color.name);
    button.setAttribute('aria-pressed', String(selected[selectedSide] === index));
    button.disabled = selected[1 - selectedSide] === index;
    const chip = node('span', 'chip'); chip.style.background = color.hex;
    button.append(chip, node('span', '', color.name)); $('palette').append(button);
  });
  $('color-confirm').disabled = selected[selectedSide] === null;
  $('color-confirm').hidden = selectedSide === 1 || run.mode.opponent === 'cpu';
}
export function renderGame(run, pending, blocked) {
  const state = run.match, side = state.sideToMove;
  renderScores($('scores'), run, countCells(state), side);
  $('round-info').textContent = run.series
    ? run.series.extensionActive ? '延長戦' : `${run.series.completedMatches + 1} / ${run.series.plannedMatches} 局`
    : `${run.currentStreak} 連勝 · ${state.size} × ${state.size}`;
  $('score-info').textContent = run.series ? `${run.series.winsBySide[1]} 勝 / ${run.series.winsBySide[2]} 勝` : `最高 ${run.bestStreak} 連勝`;
  $('turn-status').textContent = blocked ? (run.mode.opponent === 'cpu' && side === 2 ? 'コンピュータが考えています' : '色がかわります') : `${sideName(run, side)} の番`;
  const analysis = pending.analysis;
  const chosen = analysis?.directions.find(d => d.id === pending.directionId);
  const preview = new Set(analysis?.legal ? analysis.normal : []);
  const extras = new Set(analysis?.legal ? chosen?.extra ?? analysis.extra : []);
  const legal = new Set(!blocked ? listLegalMoves(state) : []);
  const board = $('board'); board.replaceChildren(); board.style.setProperty('--n', state.size);
  if (blocked) board.setAttribute('aria-busy', 'true'); else board.removeAttribute('aria-busy');
  const label = text => board.append(node('span', 'board-label', text));
  label(''); for (let c = 0; c < state.size; c++) label(colLabel(c)); label('');
  const candidateBadges = new Map();
  for (const [index, direction] of (analysis?.needsDirection ? analysis.directions : []).entries()) {
    const ray = [...direction.normal, ...direction.extra];
    const target = ray.sort((a, b) => Math.abs(a - pending.cell) - Math.abs(b - pending.cell))[0];
    if (target !== undefined) candidateBadges.set(target, circled[index]);
  }
  for (let row = 0; row < state.size; row++) {
    label(row + 1);
    for (let col = 0; col < state.size; col++) {
      const i = row * state.size + col, owner = state.cells[i];
      const button = node('button', 'cell' + (!owner ? ' empty' : '') + (legal.has(i) ? ' legal' : '') +
        (preview.has(i) ? ' preview' : '') + (extras.has(i) ? ' extra' : '') + (pending.cell === i ? ' selected' : ''));
      button.dataset.cell = i; button.disabled = blocked;
      button.setAttribute('aria-label', `${colLabel(col)}${row + 1} ${owner ? sideName(run, owner) : '空き'}${preview.has(i) || extras.has(i) ? ' 反転予定' : ''}`);
      const shownOwner = preview.has(i) || extras.has(i) || analysis?.legal && pending.cell === i ? side : owner;
      if (shownOwner) { paint(button, run.colorsBySide[shownOwner]); button.append(node('span', '', sideMark(run, shownOwner))); }
      if (candidateBadges.has(i)) button.append(node('span', 'choice-badge', candidateBadges.get(i)));
      board.append(button);
    }
    label(row + 1);
  }
  label(''); for (let c = 0; c < state.size; c++) label(colLabel(c)); label('');
  $('direction-options').replaceChildren();
  if (analysis?.needsDirection) analysis.directions.forEach((direction, index) => {
    const button = node('button', '', `${circled[index]} ${arrows[direction.id]} ${direction.total}マス`);
    button.dataset.direction = index + 1;
    button.setAttribute('aria-pressed', String(pending.directionId === direction.id));
    button.disabled = blocked; $('direction-options').append(button);
  });
  const coord = pending.cell === null ? '' : `${colLabel(pending.cell % state.size)}${Math.floor(pending.cell / state.size) + 1}`;
  $('selection-status').textContent = blocked ? '' : analysis?.needsDirection && !pending.directionId ? '① ②… からえらんでね' :
    pending.cell !== null && !analysis?.legal ? 'ここには置けません' : `${ITEM_NAMES[pending.item]}${coord ? ` · ${coord}` : ' · 場所をえらんでね'}`;
  for (const item of ['enhanced', 'strongest']) {
    const button = $(item); button.textContent = `${ITEM_NAMES[item]} ${run.inventoryBySide[side][item]}`;
    button.disabled = blocked || state.size === 4 || !run.inventoryBySide[side][item];
    button.setAttribute('aria-pressed', String(pending.item === item));
  }
  $('confirm-move').disabled = blocked || !analysis?.legal || analysis.needsDirection && !pending.directionId;
  document.querySelector('[data-action="undo"]').disabled = blocked || pending.cell === null && pending.item === 'basic';
}
export function renderResult(run) {
  const total = run.phase === 'seriesResult', outcome = total ? run.series.outcome : run.match.outcome;
  $('result-heading').textContent = outcome === 0 ? 'ひきわけ' : `${sideName(run, outcome)} の勝ち！`;
  $('result-detail').textContent = total ? `対戦終了 · ${run.series.completedMatches}局\n${run.series.winsBySide[1]}勝 対 ${run.series.winsBySide[2]}勝（${run.series.draws}引き分け）` :
    run.series ? `${run.series.completedMatches} / ${run.series.plannedMatches} 局 終了` : `${run.currentStreak} 連勝`;
  renderScores($('result-scores'), run, countCells(run.match));
  $('result-record').textContent = run.series ? 'さいごの盤面のマス数' : `最高 ${run.bestStreak} 連勝`;
  $('next-match').hidden = total;
  $('next-match').textContent = run.mode.structure === 'streak' && run.match.outcome !== 1 ? 'もう一戦' : 'つぎの対戦';
  $('extend').hidden = !total || outcome !== 0;
  $('end-result').textContent = total && outcome === 0 ? '引き分けで終了' : '終了する';
}
