// 盤面ビュー（両アプリ共通）。3×3グリッドに位置キーで札を置き、フォーカス/選択/めくり/図示を扱う。
// カード構造: <div class="card"><div class="front"></div></div>
//   .card.flipped で前面(.front)を表示。前面の中身は各アプリが setContent で差し込む
//   （ピタリズム=赤丸プレースホルダ、メモリズム=絵の img）。
import { POS } from '../game/positions.js';

export class BoardView {
  /**
   * @param {HTMLElement} boardEl 盤面コンテナ（display:grid）
   * @param {HTMLElement} figureEl 図示オーバーレイ（内部に <svg><path.arrow><circle.dot>）
   * @param {{onCardTap?:(key:string)=>void}} [opts]
   */
  constructor(boardEl, figureEl, { onCardTap } = {}) {
    this.boardEl = boardEl;
    this.figureEl = figureEl;
    this.onCardTap = onCardTap;
    this.cards = new Map(); // key -> { el, front }
  }

  render(keys) {
    this.boardEl.innerHTML = '';
    this.cards.clear();
    for (const key of keys) {
      const el = document.createElement('div');
      el.className = 'card';
      el.style.gridRow = POS[key].r;
      el.style.gridColumn = POS[key].c;
      el.dataset.key = key;
      const front = document.createElement('div');
      front.className = 'front';
      el.appendChild(front);
      el.addEventListener('click', () => this.onCardTap && this.onCardTap(key));
      this.boardEl.appendChild(el);
      this.cards.set(key, { el, front });
    }
  }

  keys() { return [...this.cards.keys()]; }

  setContent(key, node) {
    const c = this.cards.get(key); if (!c) return;
    c.front.innerHTML = '';
    if (node) c.front.appendChild(node);
  }
  clearContent() { this.cards.forEach(c => { c.front.innerHTML = ''; }); }

  setFocus(key) { this.cards.forEach((c, k) => c.el.classList.toggle('focus', k === key)); }
  clearFocus() { this.cards.forEach(c => c.el.classList.remove('focus')); }
  setSelected(key) { this.cards.forEach((c, k) => c.el.classList.toggle('selected', k === key)); }
  setFlipped(key, faceUp) { const c = this.cards.get(key); if (c) c.el.classList.toggle('flipped', !!faceUp); }
  setCorrect(key, b) { const c = this.cards.get(key); if (c) c.el.classList.toggle('correct', !!b); }
  setWrong(key, b) { const c = this.cards.get(key); if (c) c.el.classList.toggle('wrong', !!b); }
  flipAll(faceUp) { this.cards.forEach(c => c.el.classList.toggle('flipped', !!faceUp)); }
  clearMarks() {
    this.cards.forEach(c => c.el.classList.remove('focus', 'selected', 'flipped', 'correct', 'wrong'));
    this.showFigure(null);
  }

  /** 認識結果の図示（矢印/中点）。key=null で消す。 */
  showFigure(key) {
    const fig = this.figureEl; if (!fig) return;
    const svg = fig.querySelector('svg'), arrow = fig.querySelector('.arrow'), dot = fig.querySelector('.dot');
    if (!key) { fig.classList.remove('show'); return; }
    if (POS[key].deg === null) { arrow.style.display = 'none'; dot.style.display = 'block'; svg.style.transform = 'none'; }
    else { arrow.style.display = 'block'; dot.style.display = 'none'; svg.style.transform = `rotate(${POS[key].deg}deg)`; }
    fig.classList.add('show');
  }
}
