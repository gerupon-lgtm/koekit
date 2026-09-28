// 盤面版の組み立て（画面に依存しない部分）— 基本設計6節
// 物語は「型」（場面の並び）で作る。型・場面・つなぎ文などは story/data/*.json にある
import { SETS, ROW_KEYS, FIRST_STAGE } from './story-data.js';
import { varietyPicker } from './variety.js';
export { loadSets } from './story-data.js';

export const MAX_PER_ROW = 3; // 1行で選べる上限（要件B区分）

const randInt = (n, rnd) => Math.floor(rnd() * n);
const pick = (list, rnd) => list[randInt(list.length, rnd)];

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

// 場面ごとに、どの語を使うかの並び（長さ total）
//  ふつう：選んだ順に前へ進む（floor(i×個数÷total)）
//  めちゃくちゃ：全語を1回以上含むランダムな並び
function sequenceFor(words, order, rnd, total) {
  const n = words.length;
  if (order !== 'mechakucha') return Array.from({ length: total }, (_, i) => words[Math.min(n - 1, Math.floor((i * n) / total))]);
  const seq = words.slice(0, total);
  while (seq.length < total) seq.push(words[randInt(n, rnd)]);
  return shuffle(seq, rnd);
}

// だれと：物語ごとに「最初から一緒」か「途中で現れる」かをランダムに決める
// 途中で現れる場合、1人目が物語に出てきた場面（first）より後で、2人目以降が加わる
function companionPlan(words, first, order, rnd, total) {
  const last = total - 1;
  if (words.length < 2 || first < 0 || first >= last || rnd() < 0.5) return { mode: 'together', joinAt: words.map(() => 0) };
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

// 型を選び、かっこつきの場面を入れるかどうか決める（avoidType は直前の型）
export function chooseFlow(set, rnd, avoidType) {
  const names = Object.keys(set.types);
  const cand = names.length > 1 ? names.filter(n => n !== avoidType) : names;
  const type = set.types[pick(cand, rnd)];
  const stages = type.flow.filter(s => !s.optional || rnd() < 0.5).map(s => s.stage);
  return { type, stages };
}

const ref = c => c.stage + ':' + c.idx;

// 場面カードを選ぶ。avoid（直前の物語で使った "場面:番号"）と、同じ物語の中での重複はなるべく避ける
function pickCards(set, stages, order, rnd, avoid) {
  const used = new Set();
  const choose = refs => {
    const fresh = refs.filter(r => !avoid.has(ref(r)) && !used.has(ref(r)));
    const notDup = refs.filter(r => !used.has(ref(r)));
    const c = pick(fresh.length ? fresh : notDup.length ? notDup : refs, rnd);
    used.add(ref(c));
    return c;
  };
  const refsOf = stage => set.scenes[stage].map((tpl, idx) => ({ stage, idx, tpl }));
  if (order === 'mechakucha') {
    const all = Object.keys(set.scenes).flatMap(refsOf);
    return stages.map(() => choose(all));
  }
  return stages.map(stage => choose(refsOf(stage)));
}

// 主人公・だれと・なにを が、物語のどこかに必ず出るようにする
const NEED = ['{name}', '{aite}', '{mono}'];
const hasSlots = cards => NEED.every(k => cards.some(c => c.tpl.includes(k)));

// 最後の手段：2番目の場面を「3つとも含むカード」に差しかえる（はじまり・おわりは残す）
function ensureSlots(set, cards) {
  if (hasSlots(cards)) return cards;
  for (const [stage, list] of Object.entries(set.scenes)) {
    const idx = list.findIndex(t => NEED.every(k => t.includes(k)));
    if (idx >= 0) { const out = cards.slice(); out[1] = { stage, idx, tpl: list[idx] }; return out; }
  }
  return cards;
}

// つなぎ文を選ぶ（同じ物語の中では同じ文をなるべく繰り返さない）
// 物語の生成
//  avoid：直前に使った場面（"場面:番号" の Set）、avoidType：直前の型。app 側が渡す
export function buildStory({ audience, name, picks, order = 'normal', rnd = Math.random, avoid = new Set(), avoidType, history = [] }) {
  const set = SETS[audience];
  const variety = varietyPicker(list => pick(list, rnd), history);
  const { type, stages } = chooseFlow(set, rnd, avoidType);
  const total = stages.length;
  let cards = null;
  for (let attempt = 0; attempt < 200 && !cards; attempt++) {
    const c = pickCards(set, stages, order, rnd, avoid);
    if (hasSlots(c)) cards = c;
  }
  cards = ensureSlots(set, cards || pickCards(set, stages, order, rnd, avoid));

  const seq = { itsu: sequenceFor(picks.itsu.words, order, rnd, total), basho: sequenceFor(picks.basho.words, order, rnd, total) };
  const firstAite = cards.findIndex(c => c.tpl.includes('{aite}'));
  const plan = companionPlan(picks.aite.words, firstAite, order, rnd, total);
  const mono = picks.mono.words.join(set.join);
  // 脇役・小道具・音は物語ごとに1つ選び、同じ物語の中では同じものが出る
  const extras = {};
  for (const [k, list] of Object.entries(set.extras)) extras[k] = pick(list, rnd);

  const lines = [];
  const last = { itsu: null, basho: null };
  const joined = new Set();
  cards.forEach((c, i) => {
    const newcomers = [];
    picks.aite.words.forEach((w, j) => {
      if (plan.joinAt[j] <= i && !joined.has(j)) { if (i > 0) newcomers.push(w); joined.add(j); }
    });
    const aite = picks.aite.words.filter((_, j) => joined.has(j)).join(set.join);
    const vars = { ...extras, name, itsu: seq.itsu[i], basho: seq.basho[i], aite, mono };

    for (const k of ['itsu', 'basho']) {
      const v = vars[k];
      if (v === last[k]) continue;
      const mentions = c.tpl.includes('{' + k + '}');
      if (!(mentions && last[k] === null)) lines.push({ stage: null, text: fill(variety.take('o/shift-' + k, set.shift[k], 4, true), vars), shift: true });
      last[k] = v;
    }
    for (const w of newcomers) lines.push({ stage: null, text: fill(variety.take('o/shift-aite', set.shift.aite, 3, true), { ...vars, new: w }), shift: true });
    lines.push({ stage: c.stage, text: fill(c.tpl, vars), shift: false });
  });
  const intros = audience === 'kids'
    ? [type.intro, `こんどは、${type.name}のおはなしだよ。`, `${type.name}のおはなしが、はじまるよ。`, `さて、どんな${type.name}になるのかな。`]
    : [type.intro, `ここから始まるのは、${type.name}の物語です。`, `${type.name}の物語を、始めましょう。`, `さて、どんな${type.name}になるでしょうか。`];
  return { lines, companion: plan.mode, used: cards.map(ref), extras, type: type.name,
    intro: variety.take('o/intro', intros, 2), stages, seq, variety: variety.used };
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

export { FIRST_STAGE };
