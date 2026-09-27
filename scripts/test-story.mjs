// モノガタリズム（仮称）物語生成の自動検査（基本設計 MG-T01）
// 実行: node scripts/test-story.mjs
import { readFileSync } from 'node:fs';
import { makeBoard, resolvePicks, buildStory, splitSentences, MAX_PER_ROW } from '../story/story.js';
import { SETS, ROW_KEYS, EXTRA_KEYS, FIRST_STAGE, LAST_STAGE, loadSets } from '../story/story-data.js';
import { parse, wordsFor } from '../story/vocabulary.js';

// 画面と同じ JSON を読む
await loadSets(path => JSON.parse(readFileSync(new URL(path, new URL('../story/story-data.js', import.meta.url)), 'utf8')));

// 再現できる乱数（mulberry32）
function seeded(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let fail = 0, runs = 0;
const stats = { together: 0, join: 0 };
const typeCount = {};
const bad = (msg, ctx) => { fail++; if (fail <= 10) console.error('NG:', msg, ctx ?? ''); };

for (const audience of ['kids', 'adult']) {
  const set = SETS[audience];
  for (const order of ['normal', 'mechakucha']) {
    for (let n = 0; n < 1500; n++) {
      const rnd = seeded(n * 7919 + (audience === 'kids' ? 1 : 2) + (order === 'normal' ? 0 : 100000));
      const board = makeBoard(audience, rnd);
      if (ROW_KEYS.some(k => board.rows[k].length !== set.cols)) bad('盤面の列数', audience);
      const sel = {};
      for (const k of ROW_KEYS) {
        const count = Math.floor(rnd() * (MAX_PER_ROW + 1)); // 0〜3
        const cols = [...Array(set.cols).keys()].sort(() => rnd() - 0.5);
        sel[k] = cols.slice(0, count);
      }
      const picks = resolvePicks(board, sel, rnd);
      const st = buildStory({ audience, name: set.names[0], picks, order, rnd });
      runs++;
      const all = st.lines.map(l => l.text).join('');
      if (/[{}]|undefined|null/.test(all)) bad('置換漏れ', all);
      for (const k of ROW_KEYS) for (const w of picks[k].words) if (!all.includes(w)) bad(`選んだ語が出ない ${k}=${w}`, all);
      if (!all.includes(set.names[0])) bad('名前が出ない', all);
      const sceneCount = st.lines.filter(l => !l.shift).length;
      if (sceneCount !== st.stages.length || sceneCount < 4 || sceneCount > 7) bad('場面数が型と合わない', `${st.type} ${sceneCount}`);
      typeCount[`${audience}/${st.type}`] = (typeCount[`${audience}/${st.type}`] || 0) + 1;
      if (new Set(st.used).size !== st.used.length) bad('同じ物語で同じ場面を2回使った', st.used);
      stats[st.companion]++;
      // 途中で現れる仲間は、1人目が登場した後に加わる
      if (st.companion === 'join') {
        const first = picks.aite.words[0];
        const firstPos = all.indexOf(first);
        for (const w of picks.aite.words.slice(1)) {
          const joinLine = st.lines.find(l => l.shift && l.text.includes(w));
          if (!joinLine) { bad('途中登場の文がない', w); continue; }
          if (all.indexOf(joinLine.text) < firstPos) bad('1人目より前に仲間が加わる', all);
        }
      }
      // ふつう：いつ・どこでは選んだ順にだけ進む（戻らない）
      if (order === 'normal') {
        for (const k of ['itsu', 'basho']) {
          // 場面ごとの並び（seq）が、選んだ順にだけ進むこと。選んだ語はすべて並びに入ること
          const ws = picks[k].words;
          const order = st.seq[k].map(w => ws.indexOf(w));
          for (let i = 1; i < order.length; i++) if (order[i] < order[i - 1]) bad(`${k} が選んだ順に進まない`, st.seq[k].join('/'));
          for (const w of ws) if (!st.seq[k].includes(w)) bad(`${k} の語が並びに入らない`, w);
        }
        if (!st.lines[st.lines.length - 1].text.length) bad('最後の文が空');
        if (st.lines[0].shift) bad('ふつうで最初の文がつなぎ文', st.lines[0].text);
      }
      for (const l of st.lines) if (!splitSentences(l.text).length) bad('文分割が空', l.text);
    }
  }
}

// データの約束：はじまりの場面は必ず「いつ」「どこで」を含む（ふつうで最初につなぎ文が来ないため）
// 型：最初は はじまり、最後は おわり、使う場面がすべてある（読み込み時にも確認している）
for (const a of ['kids', 'adult']) {
  const S = SETS[a];
  if (!S.scenes[FIRST_STAGE].every(t => t.includes('{itsu}') && t.includes('{basho}'))) bad('はじまりの場面に いつ／どこで がない', a);
  for (const t of Object.values(S.types)) {
    if (t.flow[0].stage !== FIRST_STAGE || t.flow.at(-1).stage !== LAST_STAGE) bad('型の最初・最後', t.name);
    if (!t.intro) bad('型の紹介文がない', t.name);
    const min = t.flow.filter(f => !f.optional).length, max = t.flow.length;
    if (min < 4 || max > 7) bad('型の長さが4〜7場面でない', `${t.name} ${min}-${max}`);
  }
  if (!S.scenes['できごと'].some(t => ['{name}', '{aite}', '{mono}'].every(k => t.includes(k)))) bad('できごとに 主人公＋だれと＋なにを を含む場面がない', a);
  for (const k of ROW_KEYS) if (S.rows[k].pool.length < S.cols) bad('候補が列数より少ない', `${a}/${k}`);
  const words = ROW_KEYS.flatMap(k => S.rows[k].pool.map(p => p.w));
  if (new Set(words).size !== words.length) bad('盤面の言葉が重複', a);
}

// データの書き間違い：使える差しこみ語だけか、こども用に漢字がないか、量は足りているか
for (const a of ['kids', 'adult']) {
  const raw = JSON.parse(readFileSync(new URL(`../story/data/${a}.json`, import.meta.url), 'utf8'));
  const sceneKeys = new Set(['name', ...ROW_KEYS, ...EXTRA_KEYS]);
  const check = (text, allowed, where) => {
    for (const m of text.matchAll(/\{(\w*)\}?/g)) if (!allowed.has(m[1]) || !m[0].endsWith('}')) bad(`使えない差しこみ語 {${m[1]}}`, `${a}/${where}: ${text}`);
    if (/[{}]/.test(text.replace(/\{\w+\}/g, ''))) bad('かっこの閉じ忘れ', `${a}/${where}: ${text}`);
  };
  for (const st of Object.keys(raw.scenes)) for (const t of raw.scenes[st]) check(t, sceneKeys, st);
  for (const k of ['itsu', 'basho', 'aite']) for (const t of raw.shift[k]) check(t, new Set([...sceneKeys, 'new']), 'つなぎ文');
  if (a === 'kids') {
    const body = JSON.stringify({ ...raw, _説明: undefined });
    const kanji = body.match(/[\u4e00-\u9fff]/g);
    if (kanji) bad('こども用に漢字がある', [...new Set(kanji)].join(''));
  }
  for (const k of EXTRA_KEYS) if (!raw.extras?.[k]?.length) bad('差しこみ語の候補がない', `${a}/${k}`);
  for (const k of ['itsu', 'basho', 'aite']) if (raw.shift[k].length < 5) bad('つなぎ文が少ない', `${a}/${k}`);
  for (const st of Object.keys(raw.scenes)) if (new Set(raw.scenes[st]).size !== raw.scenes[st].length) bad('同じ場面文が重複', `${a}/${st}`);
  const allScenes = Object.values(raw.scenes).flat();
  if (new Set(allScenes).size !== allScenes.length) bad('別の段階に同じ場面文がある', a);
}

// 直前に使った場面は避ける
{
  const rnd = seeded(7);
  const b = makeBoard('adult', rnd);
  const p = resolvePicks(b, {}, rnd);
  const first = buildStory({ audience: 'adult', name: '佐藤', picks: p, rnd });
  for (let i = 0; i < 50; i++) {
    const next = buildStory({ audience: 'adult', name: '佐藤', picks: p, rnd, avoid: new Set(first.used) });
    if (next.used.some(u => first.used.includes(u))) { bad('直前の場面を避けていない', next.used); break; }
  }
}

// おまかせ：何も選ばなければ各行1つ・印つき
{
  const rnd = seeded(42);
  const b = makeBoard('kids', rnd);
  const p = resolvePicks(b, {}, rnd);
  for (const k of ROW_KEYS) if (!p[k].omakase || p[k].words.length !== 1) bad('おまかせ', k);
}
// 文分割：「」の中の句点で切らない
{
  const s = splitSentences('「あした、いこう。ね」といいました。すごい！');
  if (s.length !== 2) bad('文分割', s);
}

// 声の照合（基本設計4節）：1発話1語、区間外の語・続けて言った語は何もしない
{
  const row4 = { type: 'row', cols: 4, row: 0 }, row5 = { type: 'row', cols: 5, row: 0 };
  const name = { type: 'name', names: SETS.kids.names, hasCand: false };
  const eq = (raw, ctx, want) => { const got = JSON.stringify(parse(raw, ctx)); if (got !== JSON.stringify(want)) bad(`照合 ${raw}/${ctx.type}`, got); };
  eq('いち', row4, { type: 'number', value: 0 }); eq('し', row4, { type: 'number', value: 3 }); eq('よん', row4, { type: 'number', value: 3 });
  eq('ご', row4, null); eq('ご', row5, { type: 'number', value: 4 });
  eq('オッケー', row4, { type: 'ok' }); eq('おーけー', row4, { type: 'ok' }); eq('おまかせ', row4, { type: 'omakase' }); eq('もどる', row4, { type: 'back' });
  eq('さん オッケー', row4, null); eq('スタート', row4, null); eq('[unk]', row4, null); eq('', row4, null);
  eq('スタート', { type: 'ready' }, { type: 'start' }); eq('つぎ', { type: 'after' }, { type: 'next' });
  eq('はな', name, { type: 'name', value: 'はな' }); eq('オッケー', name, null); eq('オッケー', { ...name, hasCand: true }, { type: 'ok' });
  for (const w of wordsFor(row5)) if (!w) bad('空の受付語');
}

if (stats.together === 0 || stats.join === 0) bad('だれとの2形が両方出ていない', stats);
for (const a of ['kids', 'adult']) for (const t of Object.keys(SETS[a].types)) if (!typeCount[`${a}/${t}`]) bad('一度も出ない型がある', `${a}/${t}`);
// 直前と同じ型は続かない
{
  const rnd = seeded(11);
  const b = makeBoard('kids', rnd);
  const p = resolvePicks(b, {}, rnd);
  let prev = null;
  for (let i = 0; i < 200; i++) {
    const st = buildStory({ audience: 'kids', name: 'はな', picks: p, rnd, avoidType: prev });
    if (st.type === prev) { bad('同じ型が続いた', st.type); break; }
    prev = st.type;
  }
}
console.log(`runs=${runs} together=${stats.together} join=${stats.join}`);
console.log('型の出現', JSON.stringify(typeCount));
if (fail) { console.error(`失敗 ${fail} 件`); process.exit(1); }
console.log('test-story: OK');
