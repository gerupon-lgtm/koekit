// 同じ材料から作る別版。原作本文・選択・履歴・Math.random を変更しない。
import { COHERENT_PLOTS, COHERENT_ENDINGS } from './coherent-scenes.js';

const FAMILIES = {
  'ぼうけん': 'adventure', '冒険': 'adventure',
  'なぞとき': 'mystery', '謎解き': 'mystery',
  'ハプニング': 'mishap', 'ふしぎ': 'wonder', '不思議': 'wonder',
  'ながいぼうけん': 'journey', '長い一日': 'journey',
};
const STAGES = ['はじまり', 'できごと', 'てがかり', 'こうどう', 'かいけつ', 'おわり'];

// 原作ごとに固定した候補選択。別版を見ることが次回の原作の抽選に影響しない。
function choicesFor(input) {
  let seed = 2166136261;
  for (const ch of JSON.stringify(input)) seed = Math.imul(seed ^ ch.codePointAt(0), 16777619) >>> 0;
  return list => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return list[Math.floor(seed / 4294967296 * list.length)];
  };
}

export function buildCoherentStory({ audience, name, picks, original }) {
  if (!['kids', 'adult'].includes(audience)) throw new Error('Unknown audience');
  const kids = audience === 'kids';
  const family = FAMILIES[original.type];
  if (!family) throw new Error('Unknown story type: ' + original.type);
  const choose = choicesFor({ audience, name, picks, original });
  const plot = choose(COHERENT_PLOTS[family]);
  const words = Object.fromEntries(['itsu', 'basho', 'aite', 'mono'].map(key => [key, picks[key].words.slice()]));
  const vars = { ...original.extras, name, aite: words.aite.join('と'), mono: words.mono.join('と') };
  const fill = text => text.replace(/\{(\w+)\}/g, (_, key) => {
    if (typeof vars[key] !== 'string') throw new Error('Missing story value: ' + key);
    return vars[key];
  });
  // 問題→手がかり→試み→解決は同じ場面セットから取り、途中で問題をすり替えない。
  const templates = [
    kids ? '{itsu}。{name}は、{basho}で{aite}といっしょにいました。てもとにあるのは、{mono}です。'
      : '{itsu}。{name}は、{basho}で{aite}と合流した。手元には、{mono}があった。',
    ...['problem', 'clue', 'action', 'resolution'].map(key => choose(plot[audience][key])),
    choose(COHERENT_ENDINGS[audience]),
  ];
  // 移動・時間の切替は手がかり／行動に入る前まで。行動の結果が出る途中で場所を飛ばさない。
  const seq = Object.fromEntries(['itsu', 'basho'].map(key => [key,
    templates.map((_, i) => words[key][Math.floor(Math.min(i, 3) * words[key].length / 4)])]));
  const lines = [];
  templates.forEach((template, i) => {
    vars.itsu = seq.itsu[i]; vars.basho = seq.basho[i];
    if (i > 0 && seq.itsu[i] !== seq.itsu[i - 1]) {
      lines.push({ stage: null, shift: true, text: fill(kids
        ? 'やがて、つぎの{itsu}になりました。{name}たちは、まだとちゅうです。'
        : 'やがて、次の{itsu}を迎えた。{name}たちの用事は、まだ続いていた。') });
    }
    if (i > 0 && seq.basho[i] !== seq.basho[i - 1]) {
      lines.push({ stage: null, shift: true, text: fill(kids
        ? '{name}たちは、つづきをたしかめるため、{basho}へむかいました。'
        : '{name}たちは、次の手順を進めるために{basho}へ向かった。') });
    }
    lines.push({ stage: STAGES[i], shift: false, text: fill(template) });
  });
  return { lines, intro: kids ? 'もうひとつのおはなしです。' : '同じカードで、もうひとつのお話です。',
    type: original.type, family, plot: plot.id, stages: STAGES.slice(), seq, extras: { ...original.extras }, companion: 'together' };
}
