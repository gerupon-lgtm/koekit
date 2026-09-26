import { scoreEvents } from '../../saezuri/document.js';
const ns = 'http://www.w3.org/2000/svg';
function svgElement(tag, attrs = {}, text) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text != null) node.textContent = text;
  return node;
}
const pitchClasses = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const pitchName = midi => `${pitchClasses[midi % 12]}${Math.floor(midi / 12) - 1}`;
const step = midi => (Math.floor(midi / 12) - 1) * 7 + [0,0,1,1,2,3,3,4,4,5,5,6][midi % 12];
export function renderScore(container, pattern) {
  container.replaceChildren();
  const events = scoreEvents(pattern);
  for (let bar = 0; bar < pattern.bars; bar++) {
    const accidentals = new Map();
    const current = events.filter(e => Math.floor(e.startTick / 16) === bar);
    const ys = current.filter(e => e.midi !== null).map(e => 100 - (step(e.midi) - step(64)) * 6);
    const upper = Math.min(0, ...ys.map(y => y - 55)), lower = Math.max(155, ...ys.map(y => y + 40));
    const svg = svgElement('svg', { viewBox: `0 ${upper} 640 ${lower - upper}`, role: 'img', 'aria-label': `${bar + 1}小節目の試作譜面` });
    svg.append(svgElement('text', { x: 8, y: 24 }, `${bar + 1}小節`));
    for (let i = 0; i < 5; i++) svg.append(svgElement('line', { x1: 10, y1: 52 + i * 12, x2: 632, y2: 52 + i * 12, stroke: '#897b72' }));
    svg.append(svgElement('text', { x: 10, y: 94, 'font-size': 52, 'font-family': 'Segoe UI Symbol,serif' }, '𝄞'));
    for (const e of current) {
      const x = 60 + (e.startTick % 16) * 34;
      if (e.midi === null) {
        svg.append(svgElement('text', { x, y: 86, 'font-size': 27, 'aria-label': `休符 ${e.durationTick / 4}拍` }, e.durationTick === 4 ? '𝄽' : e.durationTick === 2 ? '𝄾' : '𝄿'));
        continue;
      }
      const y = 100 - (step(e.midi) - step(64)) * 6;
      const group = svgElement('g', { 'data-note-id': e.noteId, 'data-start-tick': e.startTick, fill: e.origin === 'completed' ? '#b25c19' : '#514479' });
      group.append(svgElement('title', {}, `${pitchName(e.midi)} ${e.durationTick / 4}拍${e.tieIn ? ' タイ継続' : ''}${e.origin === 'completed' ? ' 補完候補' : ''}`));
      if (y >= 112) for (let line = 112; line <= y; line += 12) group.append(svgElement('line', { x1: x - 12, y1: line, x2: x + 12, y2: line, stroke: '#514479' }));
      if (y <= 40) for (let line = 40; line >= y; line -= 12) group.append(svgElement('line', { x1: x - 12, y1: line, x2: x + 12, y2: line, stroke: '#514479' }));
      group.append(svgElement('ellipse', { cx: x, cy: y, rx: 8, ry: 5, transform: `rotate(-20 ${x} ${y})` }));
      group.append(svgElement('line', { x1: x + 7, y1: y, x2: x + 7, y2: y - 32, stroke: '#514479', 'stroke-width': 2 }));
      for (let flag = 0; flag < (e.durationTick === 1 ? 2 : e.durationTick === 2 ? 1 : 0); flag++) group.append(svgElement('path', { d: `M${x + 7} ${y - 32 + flag * 7} q18 8 5 18`, fill: 'none', stroke: '#514479', 'stroke-width': 2 }));
      const accidental = pitchClasses[e.midi % 12].includes('♯') ? 1 : 0;
      if ((accidentals.get(step(e.midi)) || 0) !== accidental) group.append(svgElement('text', { x: x - 22, y: y + 5, 'font-size': 18 }, accidental ? '♯' : '♮'));
      accidentals.set(step(e.midi), accidental);
      if (e.tieOut) group.append(svgElement('path', { d: `M${x} ${y + 12} q${e.durationTick * 17} 18 ${e.durationTick * 34 - 4} 0`, fill: 'none', stroke: '#514479', 'stroke-width': 2 }));
      if (e.tieIn && e.startTick % 16 === 0) group.append(svgElement('path', { d: `M40 ${y + 12} Q50 ${y + 22} 60 ${y + 12}`, fill: 'none', stroke: '#514479' }));
      svg.append(group);
    }
    svg.append(svgElement('line', { x1: 632, y1: 52, x2: 632, y2: 100, stroke: '#514479' }));
    container.append(svg);
  }
}
