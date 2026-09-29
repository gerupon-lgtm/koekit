// 試読用。固定した検証乱数で連続10話を生成する。本番の乱数を変更しない。
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadSets, SETS } from '../../story/story-data.js';
import { makeBoard, resolvePicks, cardIds, buildStory } from '../../story/story.js';
import { buildCoherentStory } from '../../story/coherent-story.js';
import { cleanReplay, remember, rememberRepertoire } from '../../story/variety.js';
import { COHERENT_PLOTS } from '../../story/coherent-scenes.js';
import { PLOT_BRANCHES } from '../../story/coherent-branches.js';
await loadSets(path => JSON.parse(readFileSync(new URL(path, new URL('../../story/story-data.js', import.meta.url)), 'utf8')));
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lines = ['# レパートリー拡張の試読集', '', '2026-09-29。検証用の固定乱数で、実装と同じ生成関数から出力した文章。両対象10話を連続生成し、各回で履歴を保存・復元した。面白さや読み味は実際に読んで確認するための資料で、自動検査の合格だけで保証するものではない。', ''];
for (const audience of ['kids', 'adult']) {
  lines.push(`## ${audience === 'kids' ? 'こども' : 'おとな'}：連続10話`, '');
  let replay = cleanReplay(null); const rnd = seeded(audience === 'kids' ? 29001 : 29002), seen = new Set();
  for (let i = 0; i < 10; i++) {
    const h = replay[audience], board = makeBoard(audience, rnd, h.cards);
    const picks = resolvePicks(board, {}, rnd), name = SETS[audience].names[Math.floor(rnd() * SETS[audience].names.length)];
    const original = buildStory({ audience, name, picks, rnd, avoidType: h.type, avoid: new Set(h.scenes.flat()), history: h.original });
    const alt = buildCoherentStory({ audience, name, picks, original, history: h.alternate, repertoire: h.repertoire });
    assert.ok(!seen.has(alt.plot), 'first ten stories repeat plot'); seen.add(alt.plot);
    h.cards = [...h.cards, cardIds(audience, picks)].slice(-2);
    h.type = original.type; h.scenes = [...h.scenes, original.used].slice(-2);
    h.original = remember(h.original, original.variety); h.alternate = remember(h.alternate, alt.variety);
    h.repertoire = rememberRepertoire(h.repertoire, alt.repertoire);
    replay = cleanReplay(JSON.parse(JSON.stringify(replay)));
    lines.push(`### ${i + 1}．${original.type} / ${alt.plot} / ${alt.route}`, '', `材料：${name}／${Object.values(picks).map(p => p.words.join('・')).join('／')}`, '', ...alt.lines.flatMap(l => [l.text, '']));
  }
  console.log(`${audience}: 10 stories, ${seen.size} distinct plots, saved/restored histories`);
}
lines.push('## 同じ材料で雨の3ルートを比較', '', '問題は共通で、手がかり以降を対応するルート内で組み立てる。比較用に履歴を設定して各ルートを選んでいる。', '');
{
  const rnd = seeded(29003), audience = 'adult', name = '田中';
  const board = makeBoard(audience, rnd);
  board.rows.mono[0] = SETS.adult.rows.mono.pool.find(item => item.w === '片方だけの手袋');
  board.rows.aite[0] = SETS.adult.rows.aite.pool.find(item => item.w === 'しんぱいしょうのロボット');
  const picks = resolvePicks(board, Object.fromEntries(Object.keys(board.rows).map(key => [key, [0]])), rnd);
  const original = { ...buildStory({ audience, name, picks, rnd }), type: '冒険' };
  const routes = [{ id: 'base' }, ...PLOT_BRANCHES['rain-shelter']];
  for (const route of routes) {
    const repertoire = [...COHERENT_PLOTS.adventure.filter(p => p.id !== 'rain-shelter').map(p => 'plot/adventure/' + p.id),
      ...routes.filter(r => r.id !== route.id).map(r => 'route/rain-shelter/' + r.id)];
    const alt = buildCoherentStory({ audience, name, picks, original, repertoire });
    assert.equal(alt.route, route.id);
    lines.push(`### ${route.label || '布の屋根で運ぶ'}`, '', ...alt.lines.flatMap(l => [l.text, '']));
  }
}
writeFileSync(new URL('./repertoire-samples.md', import.meta.url), lines.join('\n') + '\n');
