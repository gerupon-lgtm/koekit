// レベル選択ボタン生成（両アプリ共通）。保護者用。数字＋延長は星アイコン。
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2l3 6 6 .5-4.5 4 1.5 6-6-3.5L6 18.5 7.5 12.5 3 8.5 9 8z"/></svg>';

/**
 * @param {HTMLElement} wrapEl ボタンを並べる要素
 * @param {{id:string}[]} levels レベル定義（id を表示）
 * @param {(id:string)=>void} onPick 選択時
 */
export function buildLevelSelect(wrapEl, levels, onPick) {
  wrapEl.innerHTML = '';
  for (const l of levels) {
    const b = document.createElement('button');
    b.className = 'lv-btn';
    if (l.id === 'extra') b.innerHTML = STAR;
    else b.textContent = l.id;
    b.addEventListener('click', () => onPick(l.id));
    wrapEl.appendChild(b);
  }
}
