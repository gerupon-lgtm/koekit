// レベル選択ボタン生成（両アプリ共通）。保護者用。数字＋延長は星アイコン。
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2l3 6 6 .5-4.5 4 1.5 6-6-3.5L6 18.5 7.5 12.5 3 8.5 9 8z"/></svg>';

/**
 * @param {HTMLElement} wrapEl ボタンを並べる要素
 * @param {{id:string}[]} levels レベル定義（id を表示）
 * @param {(id:string)=>void} onPick 選択時
 */
export function buildLevelSelect(wrapEl, levels, onPick, progress) {
  wrapEl.innerHTML = '';
  for (const l of levels) {
    const b = document.createElement('button');
    b.className = 'lv-btn';
    const speed = l.id === 'extra' || l.id.startsWith('s');
    const names = { '0': 'れんしゅう', '1': 'ひだり・みぎ', '2': 'うえ・した', '3': 'まんなか', '4': 'ななめ', '5': '9つのばしょ' };
    const label = l.label || (speed ? 'スピード' : names[l.id]);
    b.dataset.level = l.id;
    b.textContent = `${speed ? '⚡' : l.id === '0' ? '▶' : l.id}  ${label}`;
    if (progress?.completed(l.id)) { b.textContent += ' ✓'; b.classList.add('completed'); }
    b.disabled = !!(speed && progress && !progress.unlocked());
    if (b.disabled) b.textContent += ' 🔒';
    b.setAttribute('aria-label', b.textContent + (b.disabled ? '：通常レベルをすべてクリアすると解放' : ''));
    b.addEventListener('click', () => onPick(l.id));
    wrapEl.appendChild(b);
  }
  if (progress) {
    const hint = document.createElement('p'); hint.className = 'unlock-hint';
    hint.textContent = progress.unlocked() ? 'スピードに チャレンジできます' : '通常レベルを すべてクリアで スピード解放';
    wrapEl.append(hint);
  }
}
