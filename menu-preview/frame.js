import { buildGroupedLevelSelect } from '../src/ui/levelselect.js';
import { renderHighest } from '../src/ui/achievement.js';
import { LEVELS } from '../src/game/levels.js';
import { sequenceLevels } from '../src/game/sequence.js';
import { Progress } from '../src/game/progress.js';
import { layoutCSS } from './layout.js';

const mode = document.body.dataset.previewMode;
const origin = new URL(document.baseURI).origin;
const style = document.createElement('style');
document.head.append(style);
let record = null;
let timer;
const send = payload => parent.postMessage(payload, origin);
function measure() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const title = document.querySelector('#title');
    const footer = title.querySelector('.title-footer').getBoundingClientRect();
    const buttons = [...title.querySelectorAll('[data-level]')].map(b => {
      const r = b.getBoundingClientRect();
      return { top: r.top + scrollY, height: r.height, width: r.width };
    });
    const logo = title.querySelector('.app-title').getBoundingClientRect();
    send({ type: 'menu-measure', width: innerWidth, height: innerHeight,
      overflow: Math.max(0, Math.ceil(footer.bottom + scrollY - innerHeight)),
      logoTop: logo.top + scrollY, logoWidth: logo.width, buttons });
  }, 60);
}
function renderRecord(value) {
  const seq = mode === 'kioku-sequence';
  const levels = seq ? sequenceLevels() : LEVELS.filter(l => l.id !== '0');
  const speedIds = seq ? levels.filter(l => l.speed).map(l => l.id) : ['extra'];
  const ids = value === 'complete' ? ['1','2','3','4','5', ...speedIds] : value === 'partial' ? ['1','2'] : [];
  // 実際のプレイ記録は読み書きしない。
  const progress = new Progress(mode, { speedIds, storage: { getItem: () => JSON.stringify(ids) } });
  buildGroupedLevelSelect(document.querySelector('#level-select'), levels, () => {
    send({ type: 'menu-note', text: 'ここは表示確認用です。ゲームは開始しません。' });
  }, progress);
  renderHighest(document.querySelector('#highest-title'), progress);
}
document.querySelector(mode === 'kioku-sequence' ? '#mode-sequence' : '#mode-place')?.setAttribute('aria-current', 'page');
document.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (link) {
    event.preventDefault();
    if (link.id === 'mode-place' || link.id === 'mode-sequence') {
      send({ type: 'menu-mode', mode: link.id === 'mode-place' ? 'kioku-place' : 'kioku-sequence' });
    }
  }
  measure();
});
addEventListener('message', event => {
  if (event.source !== parent || event.origin !== origin || event.data?.type !== 'menu-config') return;
  style.textContent = event.data.original ? '' : layoutCSS(event.data.settings);
  if (record !== event.data.record) { record = event.data.record; renderRecord(record); }
  measure();
});
addEventListener('resize', measure);
document.fonts.ready.then(measure);
send({ type: 'menu-ready' });
