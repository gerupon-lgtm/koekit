// 物語の組み立て（画面に依存しない部分）
import { SETS, STAGES } from './story-data.js';

// つながりの強さ
//  shikkari  : 場面は順番どおり。差しこみ語（相手・場所・もの）は物語全体で固定
//  chotto    : 場面は順番どおり。差しこみ語を場面ごとに引き直す（ちょっと話がずれる）
//  mechakucha: 場面の段階も順番も無視。差しこみ語も場面ごとに引き直す
export const LEVELS = {
  shikkari: 'しっかり',
  chotto: 'ちょっとへん',
  mechakucha: 'めちゃくちゃ',
};

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

function rollSlots(set, rnd) {
  const out = {};
  for (const [key, list] of Object.entries(set.slots)) out[key] = pick(list, rnd);
  return out;
}

function allCardRefs(set) {
  const refs = [];
  set.cards.forEach((list, stage) => list.forEach((_, idx) => refs.push({ stage, idx })));
  return refs;
}

export function generate({ audience, level, name, rnd = Math.random }) {
  const set = SETS[audience];
  const fixed = rollSlots(set, rnd);
  const slotsFor = () => (level === 'shikkari' ? fixed : rollSlots(set, rnd));
  let parts;
  if (level === 'mechakucha') {
    const pool = allCardRefs(set);
    parts = [];
    for (let i = 0; i < STAGES.length; i++) {
      const j = Math.floor(rnd() * pool.length);
      parts.push({ ...pool.splice(j, 1)[0], slots: slotsFor() });
    }
  } else {
    parts = set.cards.map((list, stage) => ({ stage, idx: Math.floor(rnd() * list.length), slots: slotsFor() }));
  }
  return { audience, level, name, fixed, parts };
}

// 1場面だけ引き直す（同じカードは避ける）
export function rerollPart(story, i, rnd = Math.random) {
  const set = SETS[story.audience];
  const cur = story.parts[i];
  const used = new Set(story.parts.map(p => p.stage + ':' + p.idx));
  let candidates;
  if (story.level === 'mechakucha') {
    candidates = allCardRefs(set).filter(r => !used.has(r.stage + ':' + r.idx));
  } else {
    candidates = set.cards[cur.stage].map((_, idx) => ({ stage: cur.stage, idx })).filter(r => r.idx !== cur.idx);
  }
  const next = pick(candidates, rnd);
  const slots = story.level === 'shikkari' ? story.fixed : rollSlots(set, rnd);
  const parts = story.parts.slice();
  parts[i] = { ...next, slots };
  return { ...story, parts };
}

export function renderPart(story, part) {
  const tpl = SETS[story.audience].cards[part.stage][part.idx];
  const vars = { name: story.name, ...part.slots };
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export function stageLabel(part) {
  return STAGES[part.stage];
}

// 読み上げ用に文単位へ分ける（長い発話が途中で切れる端末対策）
export function splitSentences(text) {
  const out = [];
  let buf = '';
  let quote = 0;
  for (const ch of text) {
    buf += ch;
    if (ch === '「') quote++;
    if (ch === '」') quote = Math.max(0, quote - 1);
    if ((ch === '。' || ch === '！' || ch === '？') && quote === 0) { out.push(buf); buf = ''; }
  }
  if (buf.trim()) out.push(buf);
  return out.map(s => s.trim()).filter(Boolean);
}
