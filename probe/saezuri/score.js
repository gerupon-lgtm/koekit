import { scoreEvents } from '../../saezuri/document.js?v=v0.1.0-20261001214550-9fb3c40';
import { signature, spellPitch } from './key-signature.js?v=v0.1.0-20261001214550-9fb3c40';
const ns = 'http://www.w3.org/2000/svg';
function svgElement(tag, attrs = {}, text) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text != null) node.textContent = text;
  return node;
}
const pitchClasses = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const pitchName = midi => `${pitchClasses[midi % 12]}${Math.floor(midi / 12) - 1}`;
export function renderScore(container, pattern, { fifths = 0, displayOctave = 0, fitWidth = false } = {}) {
  if (![-1,0,1].includes(displayOctave)) throw new Error('DISPLAY_OCTAVE');
  container.replaceChildren();
  const events = scoreEvents(pattern);
  const key = signature(fifths), count = Math.abs(fifths);
  const width = fitWidth ? Math.max(260,Math.min(640,container.clientWidth || 340)) : 640;
  const left = fitWidth ? (count ? 58 + count * 9 : 48) : (count ? 78 + count * 12 : 60);
  const spacing = (width - 36 - left) / 16;
  const yFor = midi => 100 - (spellPitch(midi + displayOctave * 12,fifths).step - 30) * 6;
  for (let bar = 0; bar < pattern.bars; bar++) {
    const accidentals = new Map();
    const current = events.filter(e => Math.floor(e.startTick / 16) === bar);
    const ys = current.filter(e => e.midi !== null).map(e => yFor(e.midi));
    const upper = Math.min(0, ...ys.map(y => y - 55)), lower = Math.max(155, ...ys.map(y => y + 40));
    const svg = svgElement('svg', { viewBox: `0 ${upper} ${width} ${lower - upper}`, 'data-bar':bar, role: 'img', 'aria-label': `${bar + 1}小節目の試作譜面` });
    svg.append(svgElement('text', { x: 8, y: 24 }, `${bar + 1}小節`));
    for (let i = 0; i < 5; i++) svg.append(svgElement('line', { x1: 10, y1: 52 + i * 12, x2: width-8, y2: 52 + i * 12, stroke: '#897b72' }));
    svg.append(svgElement('text', { x: fitWidth?6:10, y: 94, 'font-size': fitWidth?44:52, 'font-family': 'Segoe UI Symbol,serif' }, '𝄞'));
    if (displayOctave) svg.append(svgElement('text', { x: 23, y: displayOctave>0?114:43, 'font-size':14, 'data-octave-clef':displayOctave, 'aria-label':displayOctave>0?'実音は譜面の1オクターブ下':'実音は譜面の1オクターブ上' }, '8'));
    const keyGroup = svgElement('g', { 'data-key-signature': fifths, 'aria-label': key.label });
    const keyYs = fifths<0 ? [76,58,82,64,88,70,94] : [52,70,46,64,82,58,76];
    for(let i=0;i<count;i++)keyGroup.append(svgElement('text',{x:(fitWidth?38:52)+i*(fitWidth?9:12),y:keyYs[i]+5,'font-size':fitWidth?18:20},fifths<0?'♭':'♯'));
    svg.append(keyGroup);
    for (const e of current) {
      const x = left + (e.startTick % 16) * spacing;
      if (e.midi === null) {
        svg.append(svgElement('text', { x, y: 86, 'font-size': 27, 'aria-label': `休符 ${e.durationTick / 4}拍` }, e.durationTick === 4 ? '𝄽' : e.durationTick === 2 ? '𝄾' : '𝄿'));
        continue;
      }
      const pitch = spellPitch(e.midi + displayOctave * 12,fifths), y = yFor(e.midi);
      const group = svgElement('g', { 'data-note-id': e.noteId, 'data-start-tick': e.startTick, 'data-duration-tick':e.durationTick, 'data-midi': e.midi, fill: e.origin === 'completed' ? '#b25c19' : '#514479' });
      group.append(svgElement('title', {}, `${pitch.name}${displayOctave?`（実音 ${spellPitch(e.midi,fifths).name}）`:''} ${e.durationTick / 4}拍${e.tieIn ? ' タイ継続' : ''}${e.origin === 'completed' ? ' 補完候補' : ''}`));
      if (y >= 112) for (let line = 112; line <= y; line += 12) group.append(svgElement('line', { x1: x - 12, y1: line, x2: x + 12, y2: line, stroke: '#514479' }));
      if (y <= 40) for (let line = 40; line >= y; line -= 12) group.append(svgElement('line', { x1: x - 12, y1: line, x2: x + 12, y2: line, stroke: '#514479' }));
      group.append(svgElement('ellipse', { cx: x, cy: y, rx: 8, ry: 5, transform: `rotate(-20 ${x} ${y})` }));
      group.append(svgElement('line', { x1: x + 7, y1: y, x2: x + 7, y2: y - 32, stroke: '#514479', 'stroke-width': 2 }));
      for (let flag = 0; flag < (e.durationTick === 1 ? 2 : e.durationTick === 2 ? 1 : 0); flag++) group.append(svgElement('path', { d: `M${x + 7} ${y - 32 + flag * 7} q18 8 5 18`, fill: 'none', stroke: '#514479', 'stroke-width': 2 }));
      const expected = accidentals.get(pitch.step) ?? key.alterations[pitch.letter];
      // Each bar is a separate staff/system here: repeat a tied accidental at
      // its new staff, but do not carry it to subsequent untied notes.
      if ((!e.tieIn || e.startTick % 16 === 0) && expected !== pitch.accidental) group.append(svgElement('text', { x: x - 22, y: y + 5, 'font-size': 18 }, pitch.accidental<0?'♭':pitch.accidental>0?'♯':'♮'));
      if (!e.tieIn) accidentals.set(pitch.step, pitch.accidental);
      if (e.tieOut) group.append(svgElement('path', { d: `M${x} ${y + 12} q${e.durationTick * spacing / 2} 18 ${e.durationTick * spacing - 4} 0`, fill: 'none', stroke: '#514479', 'stroke-width': 2 }));
      if (e.tieIn && e.startTick % 16 === 0) group.append(svgElement('path', { d: `M${left-20} ${y + 12} Q${left-10} ${y + 22} ${left} ${y + 12}`, fill: 'none', stroke: '#514479' }));
      svg.append(group);
    }
    svg.append(svgElement('line', { x1: width-8, y1: 52, x2: width-8, y2: 100, stroke: '#514479' }));
    container.append(svg);
  }
}
