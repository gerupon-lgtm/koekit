// 盤面版の組み立て（画面に依存しない部分）— 基本設計6節
import { SETS, ROW_KEYS, STAGES } from './story-data.js';

export const MAX_PER_ROW = 3; // 1行で選べる上限（要件B区分）
const TOTAL = STAGES.length;

const randInt = (n, rnd) => Math.floor(rnd() * n);

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1, rnd); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 盤面：各行の候補から cols 個を裏向きで並べる
export function makeBoard(audience, rnd = Math.random) {
  const set = SETS[audience];
  const rows = {};
  for (const k of ROW_KEYS) rows[k] = shuffle(set.rows[k].pool, rnd).slice(0, set.cols);
  return { audience, cols: set.cols, rows };
}

// 選択を確定：selections は { itsu: [列番号（選んだ順）], ... }
// 選ばなかった行は「おまかせ」で盤面から1つランダム
export function resolvePicks(board, selections, rnd = Math.random) {
  const picks = {};
  for (const k of ROW_KEYS) {
    const sel = (selections[k] || []).slice();
    picks[k] = sel.length ? { idx: sel, omakase: false } : { idx: [randInt(board.cols, rnd)], omakase: true };
    picks[k].items = picks[k].idx.map(i => board.rows[k][i]);
    picks[k].words = picks[k].items.map(it => it.w);
  }
  return picks;
}

// 場面ごとに、どの語を使うかの並び（長さ TOTAL）
//  ふつう：選んだ順に前へ進む（floor(i×個数÷5)）
//  めちゃくちゃ：全語を1回以上含むランダムな並び
function sequenceFor(words, order, rnd) {
  const n = words.length;
  if (order !== 'mechakucha') return Array.from({ length: TOTAL }, (_, i) => words[Math.min(n - 1, Math.floor((i * n) / TOTAL))]);
  const seq = words.slice();
  while (seq.length < TOTAL) seq.push(words[randInt(n, rnd)]);
  return shuffle(seq, rnd);
}

// だれと：物語ごとに「最初から一緒」か「途中で現れる」かをランダムに決める
// 途中で現れる場合、1人目が物語に出てきた場面（first）より後で、2人目以降が加わる
// 1人目が最後の場面まで出てこない組み合わせでは「最初から一緒」にする
function companionPlan(words, first, order, rnd) {
  const last = TOTAL - 1;
  if (words.length < 2 || first >= last || rnd() < 0.5) return { mode: 'together', joinAt: words.map(() => 0) };
  const joinAt = [0];
  if (order === 'mechakucha') {
    for (let j = 1; j < words.length; j++) joinAt.push(first + 1 + randInt(last - first, rnd));
    return { mode: 'join', joinAt };
  }
  let at = first + 1 + randInt(2, rnd);
  for (let j = 1; j < words.length; j++) {
    joinAt.push(Math.min(last, at));
    at += randInt(2, rnd); // 次の仲間は同じ場面か、次の場面
  }
  return { mode: 'join', joinAt };
}

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function pickCards(set, order, rnd) {
  if (order === 'mechakucha') {
    const all = [];
    set.scenes.forEach((list, stage) => list.forEach((tpl, idx) => all.push({ stage, idx, tpl })));
    return shuffle(all, rnd).slice(0, TOTAL);
  }
  return set.scenes.map((list, stage) => { const idx = randInt(list.length, rnd); return { stage, idx, tpl: list[idx] }; });
}

const hasSlots = cards => cards.some(c => c.tpl.includes('{aite}')) && cards.some(c => c.tpl.includes('{mono}'));

// 最後の手段：できごとの段階から「だれと」「なにを」を両方含むカードに差しかえる
function ensureSlots(set, cards) {
  if (hasSlots(cards)) return cards;
  const list = set.scenes[1];
  const idx = list.findIndex(t => t.includes('{aite}') && t.includes('{mono}'));
  const pos = cards.findIndex(c => c.stage === 1);
  const out = cards.slice();
  out[pos >= 0 ? pos : 1] = { stage: 1, idx, tpl: list[idx] };
  return out;
}

// 物語の生成
export function buildStory({ audience, name, picks, order = 'normal', rnd = Math.random }) {
  const set = SETS[audience];
  let cards = null;
  for (let attempt = 0; attempt < 200 && !cards; attempt++) {
    const c = pickCards(set, order, rnd);
    if (hasSlots(c)) cards = c;
  }
  cards = ensureSlots(set, cards || pickCards(set, order, rnd));

  const seq = { itsu: sequenceFor(picks.itsu.words, order, rnd), basho: sequenceFor(picks.basho.words, order, rnd) };
  const firstAite = cards.findIndex(c => c.tpl.includes('{aite}'));
  const plan = companionPlan(picks.aite.words, firstAite, order, rnd);
  const mono = picks.mono.words.join(set.join);

  const lines = [];
  const last = { itsu: null, basho: null };
  const joined = new Set();
  cards.forEach((c, i) => {
    const newcomers = [];
    picks.aite.words.forEach((w, j) => {
      if (plan.joinAt[j] <= i && !joined.has(j)) { if (i > 0) newcomers.push(w); joined.add(j); }
    });
    const aite = picks.aite.words.filter((_, j) => joined.has(j)).join(set.join);
    const vars = { name, itsu: seq.itsu[i], basho: seq.basho[i], aite, mono };

    for (const k of ['itsu', 'basho']) {
      const v = vars[k];
      if (v === last[k]) continue;
      const mentions = c.tpl.includes('{' + k + '}');
      if (!(mentions && last[k] === null)) lines.push({ stage: null, text: fill(set.shift[k], vars), shift: true });
      last[k] = v;
    }
    for (const w of newcomers) lines.push({ stage: null, text: fill(set.shift.aite, { ...vars, new: w }), shift: true });
    lines.push({ stage: STAGES[c.stage], text: fill(c.tpl, vars), shift: false });
  });
  return { lines, companion: plan.mode };
}

// めくった結果の読み上げ文
export function picksSummary(audience, picks) {
  const set = SETS[audience];
  return ROW_KEYS.map(k => picks[k].omakase
    ? `${set.rows[k].label}？ おまかせで、${picks[k].words[0]}。`
    : `${set.rows[k].label}、${picks[k].words.join('と、')}。`);
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
