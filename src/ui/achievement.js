import { GAME_NAMES } from '../game/progress.js';

let medalId = 0;
export function medalMarkup(medal) {
  const id = 'rainbow-medal-' + (++medalId);
  const gradient = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e98f97"/><stop offset=".25" stop-color="#dfb94e"/><stop offset=".5" stop-color="#71b88f"/><stop offset=".75" stop-color="#78b7da"/><stop offset="1" stop-color="#b58cda"/></linearGradient></defs>`;
  return `<span class="award-medal ${medal}" aria-hidden="true"><svg viewBox="0 0 48 56">${medal === 'rainbow' ? gradient : ''}<path class="ribbon" d="M10 28 7 55l13-6 4 5 4-5 13 6-3-27"/><circle ${medal === 'rainbow' ? `fill="url(#${id})"` : ''} cx="24" cy="22" r="20"/><circle class="medal-ring" cx="24" cy="22" r="15"/><path class="medal-star" d="m24 10 3.6 7.4 8.2 1.2-5.9 5.8 1.4 8.2L24 28.7l-7.3 3.9 1.4-8.2-5.9-5.8 8.2-1.2Z"/></svg></span>`;
}
export function renderHighest(el, progress) {
  const title = progress.highest();
  el.replaceChildren();
  if (title) el.insertAdjacentHTML('beforeend', medalMarkup(title.medal));
  const text = document.createElement('div');
  const label = document.createElement('small'); label.textContent = GAME_NAMES[progress.game];
  const name = document.createElement('strong'); name.textContent = title?.name || '称号は これから';
  text.append(label, name); el.append(text);
  if (!progress.persistent) {
    const note = document.createElement('small'); note.textContent = '記録を保存できません。この画面を閉じるまで保持します。';
    el.append(note);
  }
}
export function renderAward(el, progress, kind, id) {
  el.replaceChildren();
  const title = kind === 'clear' ? progress.clear(id) : null;
  const label = document.createElement('small'); label.textContent = GAME_NAMES[progress.game];
  const name = document.createElement('strong');
  name.textContent = kind === 'gameover' ? 'もういちど チャレンジ' : title?.name || 'スピード クリア！';
  el.append(label, name);
  el.classList.remove('award-pop');
  void el.offsetWidth;
  el.classList.add('award-pop');
  return title;
}
