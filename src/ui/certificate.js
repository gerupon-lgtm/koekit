// 認定書ビュー（両アプリ共通）。文字を使わず、メダル＋星で到達を示す。
const STAR = '<svg viewBox="0 0 24 24" fill="%FILL%"><path d="M12 2l3 6 6 .5-4.5 4 1.5 6-6-3.5L6 18.5 7.5 12.5 3 8.5 9 8z"/></svg>';

/**
 * @param {HTMLElement} medalEl メダル要素（class を clear/over で塗り替える）
 * @param {HTMLElement} starsEl 星を並べる要素
 * @param {{kind:'clear'|'gameover', stars:number, total?:number}} opts
 */
export function renderCertificate(medalEl, starsEl, { kind, stars, total = 6 }) {
  medalEl.className = 'medal ' + (kind === 'clear' ? 'clear' : 'over');
  const lit = kind === 'clear' ? '#ffb300' : '#bbb';
  starsEl.innerHTML = '';
  for (let i = 0; i < total; i++) {
    starsEl.insertAdjacentHTML('beforeend', STAR.replace('%FILL%', i < stars ? lit : '#eee'));
  }
}
