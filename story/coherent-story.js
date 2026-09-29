// 同じ材料から作る別版。原作本文・選択・履歴・Math.random を変更しない。
import { COHERENT_PLOTS, COHERENT_ENDINGS } from './coherent-scenes.js';
import { NARRATIVE } from './narrative.js';
import { PLOT_VARIATION } from './coherent-variation.js';
import { varietyPicker, repertoirePicker } from './variety.js';
import { PLOT_BRANCHES } from './coherent-branches.js';

const FAMILIES = {
  'ぼうけん': 'adventure', '冒険': 'adventure',
  'なぞとき': 'mystery', '謎解き': 'mystery',
  'ハプニング': 'mishap', 'ふしぎ': 'wonder', '不思議': 'wonder',
  'ながいぼうけん': 'journey', '長い一日': 'journey',
};

// 原作ごとに固定した候補選択。別版を見ることが次回の原作の抽選に影響しない。
function choicesFor(input) {
  let seed = 2166136261;
  for (const ch of JSON.stringify(input)) seed = Math.imul(seed ^ ch.codePointAt(0), 16777619) >>> 0;
  return list => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return list[Math.floor(seed / 4294967296 * list.length)];
  };
}

export function buildCoherentStory({ audience, name, picks, original, history = [], repertoire = [] }) {
  if (!['kids', 'adult'].includes(audience)) throw new Error('Unknown audience');
  const family = FAMILIES[original.type];
  if (!family) throw new Error('Unknown story type: ' + original.type);
  const choose = choicesFor({ audience, name, picks, original });
  const picker = varietyPicker(choose, history);
  const plots = repertoirePicker(choose, repertoire);
  const take = (key, values, limit = 3, unique = false) => picker.take('a/' + key, values, limit, unique);
  const plot = plots.take('plot/' + family, COHERENT_PLOTS[family]);
  const branches = PLOT_BRANCHES[plot.id];
  const route = branches ? plots.take('route/' + plot.id, [{ id: 'base' }, ...branches], 1) : { id: 'base' };
  const scenes = { ...plot[audience], ...route[audience] };
  const extra = (route.variation || plot.variation || PLOT_VARIATION[plot.id])[audience], prose = NARRATIVE[audience];
  const outcome = route.outcome || plot.outcome || 'solved';
  const words = Object.fromEntries(['itsu', 'basho', 'aite', 'mono'].map(key => [key, picks[key].words.slice()]));
  const vars = { ...original.extras, name, aite: words.aite.join('と'), mono: words.mono.join('と') };
  const fill = text => text.replace(/\{(\w+)\}/g, (_, key) => {
    if (typeof vars[key] !== 'string') throw new Error('Missing story value: ' + key);
    return vars[key];
  });
  const format = take('format', ['standard', 'incident', 'detour'], 1);
  const soloProblems = scenes.problem.filter(text => !text.includes('{aite}'));
  const companion = soloProblems.length ? take('companion', ['together', 'join'], 1) : 'together';
  // 合流前の段落だけ主人公単独にする。仲間の名前を先に出したり「たち」と呼ばない。
  const problem = companion === 'join' ? choose(soloProblems).replaceAll('{name}たち', '{name}') : choose(scenes.problem);
  const clueSource = take('clue-source', ['advice', 'self', 'companion'], 1);
  const clue = clueSource === 'advice' ? choose(scenes.clue) : extra[clueSource];
  const endingStyle = take('ending-style', ['cliche', 'echo', 'after'], 1);
  // 未解決・目的変更の話を「困り事は片づいた」で締めない。定番の終わり自体は残す。
  const endings = outcome === 'solved' ? COHERENT_ENDINGS[audience] : [COHERENT_ENDINGS[audience][0], COHERENT_ENDINGS[audience][3]];
  const ending = endingStyle === 'cliche' ? take(outcome === 'solved' ? 'ending' : 'ending-neutral', endings, 2) : extra[endingStyle];
  const templates = [];
  const add = (stage, text) => templates.push({ stage, text });
  if (format === 'incident') {
    add('はじまり', '{itsu}、{basho}。' + problem + (companion === 'together' ? take('cast', prose.cast, 1) : ''));
  } else {
    add('はじまり', companion === 'join' ? take('solo', prose.solo) : take('opening', prose.opening, 6));
    add('できごと', problem);
  }
  if (companion === 'join') add('なかま', take('arrival', prose.arrival));
  if (format === 'detour') add('よりみち', extra.beat);
  add('てがかり', clue);
  add('こうどう', choose(scenes.action));
  add('かいけつ', choose(scenes.resolution));
  add('おわり', ending);
  const actionIndex = templates.findIndex(t => t.stage === 'こうどう');
  // 選択順は維持しつつ、転換を入れる区切りを変える。行動以降は時間・場所を動かさない。
  const seq = Object.fromEntries(['itsu', 'basho'].map(key => {
    const slots = Array.from({ length: actionIndex }, (_, i) => i + 1), changes = [];
    for (let i = 1; i < words[key].length; i++) {
      const at = choose(slots); slots.splice(slots.indexOf(at), 1); changes.push(at);
    }
    return [key, templates.map((_, i) => words[key][changes.filter(at => at <= i).length])];
  }));
  const lines = [];
  templates.forEach((template, i) => {
    vars.itsu = seq.itsu[i]; vars.basho = seq.basho[i];
    const changes = i ? ['itsu', 'basho'].filter(key => seq[key][i] !== seq[key][i - 1]) : [];
    const solo = companion === 'join' && i <= templates.findIndex(t => t.stage === 'なかま');
    const shift = key => {
      let text = take('shift-' + key, prose[key], 4, true);
      if (solo) text = text.replaceAll('{name}たち', '{name}').replaceAll('みんなで', '').replaceAll('一行は', '{name}は');
      lines.push({ stage: null, shift: true, text: fill(text) });
    };
    if (changes.length === 2 && choose([true, false])) shift('both');
    else {
      if (changes.length === 2 && choose([true, false])) changes.reverse();
      for (const key of changes) shift(key === 'itsu' ? 'time' : 'place');
    }
    lines.push({ stage: template.stage, shift: false, text: fill(template.text) });
  });
  return { lines, intro: take('intro', prose.intro, 2),
    type: original.type, family, plot: plot.id, route: route.id, outcome, repertoire: plots.used, stages: templates.map(t => t.stage), seq,
    extras: { ...original.extras }, companion, format, clueSource, endingStyle, variety: picker.used };
}
