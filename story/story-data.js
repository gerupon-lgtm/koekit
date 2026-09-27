// 物語データの読み込み（本体は story/data/kids.json・adult.json。行を足すだけで材料が増える）
// - 画面では fetch、Node の検査ではファイル読み込みで同じ JSON を使う
// - 読み込んだデータは SETS に入り、story.js から参照する

export const ROW_KEYS = ['itsu', 'basho', 'aite', 'mono'];
export const FIRST_STAGE = 'はじまり';
export const LAST_STAGE = 'おわり';
export const EXTRA_KEYS = ['hito', 'komono', 'oto'];
export const AUDIENCES = ['kids', 'adult'];

export const SETS = {};

// 「(よりみち)」→ { stage: 'よりみち', optional: true }
function parseFlow(key, typeName, flow) {
  return flow.map(raw => {
    const m = /^[(（](.+)[)）]$/.exec(raw.trim());
    return { stage: m ? m[1] : raw.trim(), optional: !!m };
  });
}

// JSON を実行時の形に整え、書き間違いがあれば理由つきで止める
export function registerSet(key, json) {
  const scenes = json.scenes || {};
  for (const [stage, list] of Object.entries(scenes)) {
    if (!Array.isArray(list) || !list.length) throw new Error(`${key}: 場面「${stage}」が空です`);
  }
  const types = {};
  for (const [name, t] of Object.entries(json.types || {})) {
    const flow = parseFlow(key, name, t.flow || []);
    for (const s of flow) if (!scenes[s.stage]) throw new Error(`${key}: 型「${name}」の場面「${s.stage}」がありません`);
    if (flow[0]?.stage !== FIRST_STAGE || flow[0].optional) throw new Error(`${key}: 型「${name}」の最初は ${FIRST_STAGE}`);
    if (flow.at(-1)?.stage !== LAST_STAGE || flow.at(-1).optional) throw new Error(`${key}: 型「${name}」の最後は ${LAST_STAGE}`);
    types[name] = { name, intro: t.intro || '', flow };
  }
  if (!Object.keys(types).length) throw new Error(`${key}: 型（types）がありません`);
  const extras = {};
  for (const k of EXTRA_KEYS) extras[k] = json.extras?.[k]?.length ? json.extras[k] : [''];
  const shift = {};
  for (const k of ['itsu', 'basho', 'aite']) {
    const v = json.shift?.[k];
    shift[k] = Array.isArray(v) ? v : [v];
  }
  SETS[key] = { ...json, scenes, types, extras, shift };
  return SETS[key];
}

// readJson(相対パス) → JSON。既定は fetch（このファイルからの相対パス）
export async function loadSets(readJson = path => fetch(new URL(path, import.meta.url)).then(r => {
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
})) {
  for (const key of AUDIENCES) registerSet(key, await readJson(`./data/${key}.json`));
  return SETS;
}
