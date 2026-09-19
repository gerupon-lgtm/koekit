// イロドリズム 盤面ロジックと描画 — docs/irodori/screens.md / data-model.md
// 座標は 0-based（row, col）。音声の「行1-9・列A-I」は app.js 側で 0-based に変換する。
import { colorHex } from './palette.js';

export function createCells(size) {
  return new Array(size * size).fill(null);
}
export const idx = (size, row, col) => row * size + col;
export const inRange = (size, row, col) => row >= 0 && row < size && col >= 0 && col < size;

// 長方形（両端含む）のセルindex一覧
export function rectCells(size, a, b) {
  const r0 = Math.min(a.row, b.row), r1 = Math.max(a.row, b.row);
  const c0 = Math.min(a.col, b.col), c1 = Math.max(a.col, b.col);
  const out = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(idx(size, r, c));
  return out;
}

// ブレゼンハム法で2点を結ぶドット線（両端含む・決定的）— NR-09
export function lineCells(size, a, b) {
  const out = [];
  let x0 = a.col, y0 = a.row;
  const x1 = b.col, y1 = b.row;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  // 無限ループ防止に上限（盤面内なので size*size で十分）
  for (let guard = 0; guard <= size * size + 2; guard++) {
    out.push(idx(size, y0, x0));
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return out;
}

export const colLabel = c => String.fromCharCode(65 + c); // 0→A, 1→B, …
function hdrEl(text, cls) {
  const d = document.createElement('div');
  d.className = 'ir-hdr ' + cls;
  d.textContent = text;
  return d;
}

// 盤面をDOMグリッドとして描画（列名A〜I・行名1〜9のヘッダー付き）。
// opts: {cursor:{row,col}|null, previewCells:[idx], previewColor:index}
export function renderBoard(container, state, opts = {}) {
  const { size, cells } = state;
  const { cursor = null, previewCells = [], previewColor = null } = opts;
  const previewSet = new Set(previewCells);
  container.style.setProperty('--n', String(size));
  container.innerHTML = '';
  // 1行目: 角＋列名（A〜）＋右の空き（左右対称にして作画部分を中央に）
  container.appendChild(hdrEl('', 'ir-corner'));
  for (let c = 0; c < size; c++) {
    container.appendChild(hdrEl(colLabel(c), 'ir-hcol' + (cursor && cursor.col === c ? ' is-cur' : '')));
  }
  container.appendChild(hdrEl('', 'ir-corner'));
  // 各行: 行名（1〜）＋セル＋右の空き
  for (let r = 0; r < size; r++) {
    container.appendChild(hdrEl(String(r + 1), 'ir-hrow' + (cursor && cursor.row === r ? ' is-cur' : '')));
    for (let c = 0; c < size; c++) {
      const i = idx(size, r, c);
      const cell = document.createElement('div');
      cell.className = 'ir-cell';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      const base = colorHex(cells[i]);
      if (base) cell.style.background = base;
      else cell.classList.add('ir-empty');
      if (previewSet.has(i) && previewColor != null) {
        cell.classList.add('ir-preview');
        cell.style.setProperty('--preview', colorHex(previewColor));
      }
      if (cursor && cursor.row === r && cursor.col === c) cell.classList.add('ir-cursor');
      container.appendChild(cell);
    }
    // 右側にも行名（左右対称・両側に表示）
    container.appendChild(hdrEl(String(r + 1), 'ir-hrow' + (cursor && cursor.row === r ? ' is-cur' : '')));
  }
  // 最終行: 角＋列名（A〜）＋角（上下対称・下辺にも列名）
  container.appendChild(hdrEl('', 'ir-corner'));
  for (let c = 0; c < size; c++) {
    container.appendChild(hdrEl(colLabel(c), 'ir-hcol' + (cursor && cursor.col === c ? ' is-cur' : '')));
  }
  container.appendChild(hdrEl('', 'ir-corner'));
}

// サムネイル（canvas）。セルからドット絵をそのまま拡大（pixelated は CSS 側）
export function renderThumb(canvas, state) {
  const { size, cells } = state;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const hex = colorHex(cells[idx(size, r, c)]);
      if (hex) { ctx.fillStyle = hex; ctx.fillRect(c, r, 1, 1); }
    }
  }
}
