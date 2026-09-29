// モノガタリズム（仮称）物語生成の自動検査（基本設計 MG-T01）
// 実行: node scripts/test-story.mjs
import { readFileSync } from 'node:fs';
import { makeBoard, resolvePicks, cardIds, buildStory, splitSentences, MAX_PER_ROW } from '../story/story.js';
import { SETS, ROW_KEYS, EXTRA_KEYS, FIRST_STAGE, LAST_STAGE, loadSets } from '../story/story-data.js';
import { parse, wordsFor } from '../story/vocabulary.js';
import { buildCoherentStory } from '../story/coherent-story.js';
import { COHERENT_PLOTS, COHERENT_ENDINGS } from '../story/coherent-scenes.js';
import { NARRATIVE } from '../story/narrative.js';
import { PLOT_VARIATION } from '../story/coherent-variation.js';
import { PLOT_BRANCHES } from '../story/coherent-branches.js';
import { remember, rememberRepertoire, cleanReplay, varietyPicker, repertoirePicker, HISTORY_LIMIT, REPERTOIRE_LIMIT } from '../story/variety.js';

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
const coherentCount = {};
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
        const before = JSON.stringify({ picks, st });
        const coherent = buildCoherentStory({ audience, name: set.names[0], picks, original: st });
        const plotKey = `${audience}/${coherent.family}/${coherent.plot}`;
        coherentCount[plotKey] = (coherentCount[plotKey] || 0) + 1;
        const text = coherent.lines.map(line => line.text).join('');
        if (/[{}]|undefined|null/.test(text)) bad('別版の置換漏れ', text);
        for (const k of ROW_KEYS) for (const w of picks[k].words) if (!text.includes(w)) bad('別版から選んだ語が消えた', w);
        if (!text.includes(set.names[0])) bad('別版に主人公がいない', audience);
        if (audience === 'kids' && /[\u4e00-\u9fff]/.test(text)) bad('別版のこども用に漢字', text);
        if (coherent.lines.at(-1).stage !== 'おわり' || !coherent.lines.at(-1).text.endsWith('。')) bad('別版の結末がない', text);
        if (coherent.endingStyle === 'cliche' && !/めでたし、めでたし。|おしまい。$/.test(coherent.lines.at(-1).text)) bad('別版の定番の締めがない');
        const stages = coherent.stages;
        if (stages.length < 5 || stages.length > 8 || stages[0] !== 'はじまり' || stages.at(-1) !== 'おわり') bad('別版の場面構成');
        if (!(stages.indexOf('てがかり') < stages.indexOf('こうどう') && stages.indexOf('こうどう') < stages.indexOf('かいけつ'))) bad('別版の因果の順序');
        if (coherent.companion === 'join') {
          const joinAt = coherent.lines.findIndex(line => line.stage === 'なかま');
          if (joinAt < 0 || joinAt >= coherent.lines.findIndex(line => line.stage === 'てがかり')) bad('別版の合流位置');
        }
        if (before !== JSON.stringify({ picks, st })) bad('別版が原作や選択を変更した');
        if (n < 10 && JSON.stringify(coherent) !== JSON.stringify(buildCoherentStory({ audience, name: set.names[0], picks, original: st }))) bad('別版が切替のたび変化する');
        for (const k of ['itsu', 'basho']) {
          // 場面ごとの並び（seq）が、選んだ順にだけ進むこと。選んだ語はすべて並びに入ること
          const ws = picks[k].words;
          const order = st.seq[k].map(w => ws.indexOf(w));
          for (let i = 1; i < order.length; i++) if (order[i] < order[i - 1]) bad(`${k} が選んだ順に進まない`, st.seq[k].join('/'));
          for (const w of ws) if (!st.seq[k].includes(w)) bad(`${k} の語が並びに入らない`, w);
          const otherOrder = coherent.seq[k].map(w => ws.indexOf(w));
          for (let i = 1; i < otherOrder.length; i++) if (otherOrder[i] < otherOrder[i - 1]) bad(`別版の ${k} が逆戻りする`);
          if (new Set(coherent.seq[k].slice(stages.indexOf('こうどう'))).size !== 1) bad(`別版の解決途中で ${k} が変わる`);
        }
        if (!st.lines[st.lines.length - 1].text.length) bad('最後の文が空');
        if (st.lines[0].shift) bad('ふつうで最初の文がつなぎ文', st.lines[0].text);
      }
      for (const l of st.lines) if (!splitSentences(l.text).length) bad('文分割が空', l.text);
    }
  }
}

// 新しい展開もすべて抽選されること。未選択の文も含めて、差し込み語・表記・重複を検査。
const coherentStages = ['problem', 'clue', 'action', 'resolution'];
for (const audience of ['kids', 'adult']) {
  let plots = 0;
  const allowed = new Set(['name', 'itsu', 'basho', 'aite', 'mono', ...EXTRA_KEYS]);
  const checkTemplates = (texts, where) => {
    if (!texts.length || new Set(texts).size !== texts.length) bad('別版の候補が空または重複', where);
    for (const text of texts) {
      if (audience === 'kids' && /[\u4e00-\u9fff]/.test(text)) bad('別版のこども用候補に漢字', where);
      const body = text.replace(/\{(\w+)\}/g, (_, key) => {
        if (!allowed.has(key)) bad('別版に未定義の差し込み語', `${where}/${key}`);
        return '';
      });
      if (/[{}]/.test(body)) bad('別版の候補にかっこの閉じ忘れ', where);
    }
  };
  checkTemplates(COHERENT_ENDINGS[audience], `${audience}/ending`);
  for (const [kind, texts] of Object.entries(NARRATIVE[audience])) checkTemplates(texts, `${audience}/narrative/${kind}`);
  for (const [family, candidates] of Object.entries(COHERENT_PLOTS)) {
    if (new Set(candidates.map(p => p.id)).size !== candidates.length) bad('別版の展開ID重複', family);
    for (const plot of candidates) {
      plots++;
      if (!coherentCount[`${audience}/${family}/${plot.id}`]) bad('一度も出ない別版の展開', `${audience}/${family}/${plot.id}`);
      for (const stage of coherentStages) checkTemplates(plot[audience][stage], `${audience}/${plot.id}/${stage}`);
      const variation = (plot.variation || PLOT_VARIATION[plot.id])?.[audience];
      if (!variation || ['self', 'companion', 'beat', 'echo', 'after'].some(key => !variation[key])) bad('別版の追加展開の不足', plot.id);
      else checkTemplates(Object.values(variation), `${audience}/${plot.id}/variation`);
      for (const route of PLOT_BRANCHES[plot.id] || []) {
        for (const stage of ['clue', 'action', 'resolution']) checkTemplates(route[audience][stage], `${audience}/${plot.id}/${route.id}/${stage}`);
        checkTemplates(Object.values(route.variation[audience]), `${audience}/${plot.id}/${route.id}/variation`);
        if (route[audience].problem) bad('分岐で共通の問題を変更', route.id);
      }
    }
  }
  if (plots !== 40) bad('別版の筋数が40ではない', plots);
  console.log(`another story ${audience}: plots=${plots}, branching plots=5, total routes=50`);
}

// 長く遊び、端末保存→復元を挟んでも直近候補を避ける。原作と別版の履歴は分離する。
for (const audience of ['kids', 'adult']) {
  let replay = cleanReplay(null);
  const rnd = seeded(audience === 'kids' ? 812 : 813);
  const formats = new Set(), sources = new Set(), ends = new Set(), sizes = new Set(), casts = new Set(), timing = new Set();
  let originalIntro = '', alternateIntro = '';
  const checkHistory = (before, used) => {
    const prior = [...before];
    for (const id of used) {
      const prefix = id.slice(0, id.lastIndexOf('/') + 1);
      const last = prior.filter(old => old.startsWith(prefix)).at(-1);
      if (last === id) bad('直近と同じ候補を再使用', id);
      prior.push(id);
    }
  };
  for (let i = 0; i < 120; i++) {
    const h = replay[audience], board = makeBoard(audience, rnd);
    const picks = resolvePicks(board, Object.fromEntries(ROW_KEYS.map(k => [k, [0, 1, 2]])), rnd);
    const original = buildStory({ audience, name: SETS[audience].names[0], picks, rnd, history: h.original, avoid: new Set(h.scenes.flat()), avoidType: h.type });
    if (h.type === original.type || original.intro === originalIntro) bad('原作の紹介が直前と同じ');
    checkHistory(h.original, original.variety);
    originalIntro = original.intro;
    h.original = remember(h.original, original.variety);
    h.scenes = [...h.scenes, original.used].slice(-2); h.type = original.type;
    const before = JSON.stringify({ original, picks, originalHistory: h.original });
    const args = { audience, name: SETS[audience].names[0], picks, original, history: h.alternate, repertoire: h.repertoire };
    const alt = buildCoherentStory(args);
    if (JSON.stringify(alt) !== JSON.stringify(buildCoherentStory(args))) bad('同じ入力と履歴で別版が変わる');
    if (before !== JSON.stringify({ original, picks, originalHistory: h.original })) bad('別版が原作の履歴を変更');
    checkHistory(h.alternate, alt.variety);
    if (alternateIntro === alt.intro) bad('別版の紹介が直前と同じ');
    alternateIntro = alt.intro;
    const shifts = alt.variety.filter(id => id.startsWith('a/shift-'));
    if (new Set(shifts).size !== shifts.length) bad('同じ別版で同じ転換文を使った');
    h.alternate = remember(h.alternate, alt.variety);
    h.repertoire = rememberRepertoire(h.repertoire, alt.repertoire);
    formats.add(alt.format); sources.add(alt.clueSource); ends.add(alt.endingStyle); sizes.add(alt.stages.length); casts.add(alt.companion);
    timing.add(JSON.stringify(alt.seq));
    replay = cleanReplay(JSON.parse(JSON.stringify(replay)));
    if (h.original.length > HISTORY_LIMIT || h.alternate.length > HISTORY_LIMIT) bad('履歴が上限を超えた');
  }
  if (formats.size !== 3 || sources.size !== 3 || ends.size !== 3 || casts.size !== 2 || sizes.size < 3) bad('別版の変化が出現しない', { formats: [...formats], sources: [...sources], ends: [...ends], sizes: [...sizes], casts: [...casts] });
  console.log(`replay ${audience}: 120 stories with reload, formats=${formats.size}, clue sources=${sources.size}, endings=${ends.size}, casts=${casts.size}, lengths=${[...sizes].sort().join('/')}`);
}
{
  const broken = cleanReplay({ kids: { original: [null, 3, 'valid'], scenes: [null], alternate: 'bad', type: {} }, adult: null });
  if (broken.kids.original.join() !== 'valid' || broken.kids.alternate.length || broken.kids.type !== null) bad('破損した履歴を復元できない');
  const p = varietyPicker(list => list[0], ['only/0']);
  if (p.take('only', ['one']) !== 'one') bad('候補が1件のときに選べない');
}
// 「かめ」と「たしかめ」のような部分一致を避け、独立した識別語で登場順を確認。
{
  let joins = 0;
  const rnd = seeded(930);
  for (let i = 0; i < 100; i++) {
    const audience = i % 2 ? 'adult' : 'kids';
    const picks = resolvePicks(makeBoard(audience, rnd), {}, rnd);
    picks.aite.words = ['トモダチア', 'トモダチイ'];
    const original = buildStory({ audience, name: '主人公', picks, rnd });
    const alt = buildCoherentStory({ audience, name: '主人公', picks, original });
    if (alt.companion !== 'join') continue;
    joins++;
    const at = alt.lines.findIndex(line => line.stage === 'なかま');
    const early = alt.lines.slice(0, at).map(line => line.text).join('');
    if (picks.aite.words.some(word => early.includes(word))) bad('合流前に仲間を参照した');
    if (picks.aite.words.some(word => !alt.lines[at].text.includes(word))) bad('合流文で全仲間を紹介しなかった');
  }
  if (joins < 10) bad('合流パターンの検証不足');
}

// 初回はジャンル内の未登場8筋を優先。一巡後も直近2筋を避け、抽選の余地を残す。
for (const audience of ['kids', 'adult']) {
  const rnd = seeded(1930), picks = resolvePicks(makeBoard(audience, rnd), {}, rnd);
  const base = buildStory({ audience, name: SETS[audience].names[0], picks, rnd });
  for (const type of Object.keys(SETS[audience].types)) {
    let history = [], repertoire = [];
    const plots = new Set();
    for (let i = 0; i < 8; i++) {
      const alt = buildCoherentStory({ audience, name: SETS[audience].names[0], picks, original: { ...base, type }, history, repertoire });
      plots.add(alt.plot); history = remember(history, alt.variety);
      repertoire = rememberRepertoire(repertoire, alt.repertoire);
    }
    if (plots.size !== 8) bad('同じジャンルで8展開を読む前に再選択した', `${audience}/${type}`);
  }
}

// 50ルートを指定する履歴を作り、各ルートの発見方法・結末を実際に生成する。
// 異なる分岐の行動や解決が混ざらないことを、描かれた文章で検査。
for (const audience of ['kids', 'adult']) {
  const rnd = seeded(audience === 'kids' ? 9011 : 9012), outcomes = new Set();
  const types = { adventure: ['ぼうけん', '冒険'], mystery: ['なぞとき', '謎解き'], mishap: ['ハプニング', 'ハプニング'], wonder: ['ふしぎ', '不思議'], journey: ['ながいぼうけん', '長い一日'] };
  let routes = 0;
  for (const [family, plots] of Object.entries(COHERENT_PLOTS)) for (const plot of plots) {
    for (const route of [{ id: 'base' }, ...(PLOT_BRANCHES[plot.id] || [])]) {
      routes++;
      const sources = new Set(), endings = new Set();
      const repertoire = [
        ...plots.filter(p => p.id !== plot.id).map(p => `plot/${family}/${p.id}`),
        ...[{ id: 'base' }, ...(PLOT_BRANCHES[plot.id] || [])].filter(r => r.id !== route.id).map(r => `route/${plot.id}/${r.id}`),
      ];
      for (let i = 0; i < 60; i++) {
        const picks = resolvePicks(makeBoard(audience, rnd), Object.fromEntries(ROW_KEYS.map(k => [k, i % 2 ? [0, 1, 2] : [0]])), rnd);
        const name = SETS[audience].names[i % SETS[audience].names.length];
        const original = buildStory({ audience, name, picks, rnd });
        original.type = types[family][audience === 'kids' ? 0 : 1];
        const alt = buildCoherentStory({ audience, name, picks, original, repertoire });
        if (alt.plot !== plot.id || alt.route !== route.id) bad('未登場の筋・ルートを優先しない', `${plot.id}/${route.id}`);
        const scenes = { ...plot[audience], ...route[audience] };
        const vars = { ...original.extras, name, mono: picks.mono.words.join('と'), aite: picks.aite.words.join('と') };
        const render = text => text.replace(/\{(\w+)\}/g, (_, key) => vars[key]);
        for (const [stage, key] of [['こうどう', 'action'], ['かいけつ', 'resolution']]) {
          if (!scenes[key].map(render).includes(alt.lines.find(line => line.stage === stage).text)) bad('分岐の因果が混線', `${plot.id}/${route.id}/${stage}`);
        }
        const extra = (route.variation || plot.variation || PLOT_VARIATION[plot.id])[audience];
        const clue = alt.lines.find(line => line.stage === 'てがかり').text;
        const expectedClues = alt.clueSource === 'advice' ? scenes.clue : [extra[alt.clueSource]];
        if (!expectedClues.map(render).includes(clue)) bad('別ルートの手がかりを使用', `${plot.id}/${route.id}`);
        if (alt.outcome !== 'solved' && alt.endingStyle === 'cliche' && ![0, 3].map(j => render(COHERENT_ENDINGS[audience][j])).includes(alt.lines.at(-1).text)) bad('未解決の話を解決済みとして終了', plot.id);
        const body = alt.lines.map(line => line.text).join('');
        for (const key of ROW_KEYS) for (const word of picks[key].words) if (!body.includes(word)) bad('ルートから選択材料が消えた', `${plot.id}/${route.id}/${word}`);
        if (audience === 'kids' && /[\u4e00-\u9fff]/.test(body)) bad('追加ルートに漢字', route.id);
        sources.add(alt.clueSource); endings.add(alt.endingStyle); outcomes.add(alt.outcome);
      }
      if (sources.size !== 3 || endings.size !== 3) bad('ルートの発見・結末の検証不足', `${plot.id}/${route.id}`);
    }
  }
  if (routes !== 50 || outcomes.size !== 3) bad('ルート数・決着の種類不足', { routes, outcomes: [...outcomes] });
  console.log(`routes ${audience}: 50 routes x 60 stories, all discovery/endings, matched clue/action/resolution`);
}

{
  const options = Array.from({ length: 8 }, (_, id) => ({ id: String(id) }));
  const history = options.map(o => 'plot/test/' + o.id);
  let tickets;
  repertoirePicker(list => { tickets = list; return list[0]; }, history).take('plot/test', options);
  const counts = Object.fromEntries(options.map(o => [o.id, tickets.filter(t => t.value.id === o.id).length]));
  if (counts['6'] || counts['7'] || new Set(tickets.map(t => t.value.id)).size !== 6 || counts['0'] <= counts['5']) bad('直近回避・古い候補の重み・選択肢6本の維持', counts);
  const unseen = repertoirePicker(list => list[0], history.slice(1)).take('plot/test', options);
  if (unseen.id !== '0') bad('未登場候補を優先しない');
  const one = repertoirePicker(list => list[0], ['test/x']).take('test', [{ id: 'x' }]);
  if (one.id !== 'x') bad('単一候補で抽選が停止');
  const h = cleanReplay({ kids: { repertoire: [...Array(180).fill('plot/test/0'), null, 3] } }).kids.repertoire;
  if (h.length !== REPERTOIRE_LIMIT || h.some(id => typeof id !== 'string')) bad('筋履歴の正規化・上限', h);
  const migrated = cleanReplay({ adult: { alternate: ['a/plot-adventure/1', 'a/intro/0', 'a/plot-journey/0', 'a/plot-bogus/3'] } });
  if (migrated.adult.repertoire.join() !== 'plot/adventure/rain-shelter,route/rain-shelter/base,plot/journey/delivery,route/delivery/base' || migrated.kids.repertoire.length) bad('旧履歴の対象別移行', migrated);
  const explicit = cleanReplay({ adult: { alternate: ['a/plot-adventure/1'], repertoire: [] } });
  if (explicit.adult.repertoire.length) bad('既存の新履歴を旧履歴で上書き');
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

// 別版の生成は原作のランダム抽選系列を消費しない。
{
  const rnd = seeded(81), b = makeBoard('kids', rnd), picks = resolvePicks(b, {}, rnd);
  const original = buildStory({ audience: 'kids', name: 'はな', picks, rnd });
  const random = Math.random;
  try {
    Math.random = () => { throw new Error('別版が原作と同じ乱数を消費した'); };
    buildCoherentStory({ audience: 'kids', name: 'はな', picks, original });
  } catch (error) { bad(error.message); }
  finally { Math.random = random; }
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
  eq('オッケー', { type: 'ready' }, { type: 'ok' }); eq('スタート', { type: 'ready' }, null); eq('もどる', { type: 'ready' }, { type: 'back' }); eq('つぎ', { type: 'after' }, { type: 'next' });
  eq('はな', name, { type: 'name', value: 'はな' }); eq('オッケー', name, null); eq('オッケー', { ...name, hasCand: true }, { type: 'ok' });
  for (const w of wordsFor(row5)) if (!w) bad('空の受付語');
  // はじめの画面・なまえの もどる・おわり（2026-09-27 追加）
  const top = { type: 'top' };
  eq('こども', top, { type: 'kids' }); eq('おとな', top, { type: 'adult' }); eq('ふつう', top, { type: 'normal' });
  eq('めちゃくちゃ', top, { type: 'mechakucha' }); eq('オッケー', top, { type: 'ok' }); eq('いち', top, null);
  eq('もどる', name, { type: 'back' }); eq('おわり', { type: 'after' }, { type: 'end' }); eq('おわり', row4, null);
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
// 材料の直近2話回避：複数選択・おまかせ・保存復元・両対象の分離。
for (const audience of ['kids', 'adult']) {
  let replay = cleanReplay({});
  const rnd = seeded(721), seen = Object.fromEntries(ROW_KEYS.map(k => [k, new Set()]));
  for (let i = 0; i < 300; i++) {
    const prior = replay[audience].cards, board = makeBoard(audience, rnd, prior);
    for (const k of ROW_KEYS) {
      const forbidden = new Set(prior.flatMap(game => game[k]));
      if (new Set(board.rows[k]).size !== board.cols) bad('材料の盤面内重複', k);
      for (const item of board.rows[k]) {
        const id = SETS[audience].rows[k].pool.indexOf(item);
        if (forbidden.has(id)) bad('直近2話の材料が盤面に再登場', `${audience}/${k}/${id}`);
      }
    }
    const sel = i % 2 ? Object.fromEntries(ROW_KEYS.map(k => [k, [2, 0, 1]])) : {};
    const picks = resolvePicks(board, sel, rnd), ids = cardIds(audience, picks);
    if (i % 2 && JSON.stringify(picks.mono.idx) !== '[2,0,1]') bad('手動選択を変更した', picks.mono);
    for (const k of ROW_KEYS) for (const id of ids[k]) seen[k].add(id);
    replay[audience].cards = [...prior, ids].slice(-2);
    replay = cleanReplay(JSON.parse(JSON.stringify(replay)));
    if (replay[audience === 'kids' ? 'adult' : 'kids'].cards.length) bad('年齢別の材料履歴が混ざった', audience);
  }
  for (const k of ROW_KEYS) if (seen[k].size !== SETS[audience].rows[k].pool.length) bad('材料が永続的に除外された', `${audience}/${k}`);
}
{
  const raw = cleanReplay({ kids: { cards: [null, { mono: [1, 1, -1, '2', 2.5, 9000, 2, 3, 4] }] } });
  if (JSON.stringify(raw.kids.cards[1].mono) !== '[1,2,3]') bad('材料履歴の正規化', raw);
  const pool = SETS.kids.rows.mono.pool;
  try {
    SETS.kids.rows.mono.pool = pool.slice(0, 5);
    const board = makeBoard('kids', () => 0, [{ mono: [0, 1, 2] }, { mono: [3] }]);
    if (board.rows.mono.length !== 4 || board.rows.mono.includes(pool[3])) bad('古い制限から緩められない', board.rows.mono);
    const smallest = makeBoard('kids', () => 0, [{ mono: [0, 1, 2] }, { mono: [3, 4] }]);
    if (smallest.rows.mono.length !== 4) bad('候補不足で盤面が欠ける', smallest.rows.mono);
  } finally { SETS.kids.rows.mono.pool = pool; }
}
console.log('材料履歴: 各対象300話、複数選択・保存復元・候補不足・全候補再登場を確認');
console.log(`runs=${runs} together=${stats.together} join=${stats.join}`);
console.log('型の出現', JSON.stringify(typeCount));
if (fail) { console.error(`失敗 ${fail} 件`); process.exit(1); }
console.log('test-story: OK');
