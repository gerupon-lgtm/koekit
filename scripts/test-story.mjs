// モノガタリズム（仮称）物語生成の自動検査（基本設計 MG-T01）
// 実行: node scripts/test-story.mjs
import { makeBoard, resolvePicks, buildStory, splitSentences, MAX_PER_ROW } from '../story/story.js';
import { SETS, ROW_KEYS } from '../story/story-data.js';
import { parse, wordsFor } from '../story/vocabulary.js';

// 再現できる乱数（mulberry32）
function seeded(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let fail = 0, runs = 0;
const stats = { together: 0, join: 0 };
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
      if (st.lines.filter(l => !l.shift).length !== 5) bad('場面数が5でない');
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
          const ws = picks[k].words;
          const pos = ws.map(w => all.indexOf(w));
          for (let i = 1; i < pos.length; i++) if (pos[i] < pos[i - 1]) bad(`${k} が選んだ順に進まない`, ws.join('/'));
        }
        if (!st.lines[st.lines.length - 1].text.length) bad('最後の文が空');
      }
      for (const l of st.lines) if (!splitSentences(l.text).length) bad('文分割が空', l.text);
    }
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
console.log(`runs=${runs} together=${stats.together} join=${stats.join}`);
if (fail) { console.error(`失敗 ${fail} 件`); process.exit(1); }
console.log('test-story: OK');
