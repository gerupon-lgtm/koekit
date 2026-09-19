// 正解札を元の位置からステージ中央へ。判定・試行時間はコントローラが管理する。
export class CardReveal {
  constructor(stage) { this.stage = stage; this.overlay = null; }
  clear() { this.overlay?.remove(); this.overlay = null; }
  show(card) {
    this.clear();
    if (!card) return;
    const source = card.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'card-reveal';
    overlay.setAttribute('aria-hidden', 'true');
    const hero = document.createElement('div');
    hero.className = 'card-reveal-hero';
    // Safariでも画像の自然幅やGridの割合計算に引っ張られない正方形にする。
    const size = Math.max(0, Math.min(330, this.stage.clientWidth * .78, this.stage.clientHeight * .88));
    hero.style.width = hero.style.height = `${size}px`;
    const art = document.createElement('div');
    art.className = 'card-reveal-art';
    art.append(...[...card.querySelector('.front').childNodes].map(n => n.cloneNode(true)));
    hero.append(art);
    overlay.append(hero);
    this.stage.append(overlay);
    this.overlay = overlay;
    const dest = hero.getBoundingClientRect();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      hero.animate([
        { transform: `translate(${source.x + source.width / 2 - dest.x - dest.width / 2}px, ${source.y + source.height / 2 - dest.y - dest.height / 2}px) scale(${source.width / dest.width})` },
        { transform: 'translate(0, 0) scale(1)' },
      ], { duration: 460, easing: 'cubic-bezier(.18,.8,.25,1)', fill: 'both' });
    }
  }
}
