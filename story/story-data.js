// 物語データの読み込み（本体は story/data/kids.json・adult.json。行を足すだけで材料が増える）
// - 画面では fetch、Node の検査ではファイル読み込みで同じ JSON を使う
// - 読み込んだデータは SETS に入り、story.js から参照する

export const ROW_KEYS = ['itsu', 'basho', 'aite', 'mono'];
export const STAGES = ['はじまり', 'できごと', 'ピンチ', 'かいけつ', 'おわり'];
export const EXTRA_KEYS = ['hito', 'komono', 'oto'];
export const AUDIENCES = ['kids', 'adult'];

export const SETS = {};

// JSON を実行時の形に整える（場面は段階の順の配列にする）
export function registerSet(key, json) {
  const scenes = STAGES.map(stage => {
    const list = json.scenes?.[stage];
    if (!Array.isArray(list) || !list.length) throw new Error(`${key}: 場面「${stage}」がありません`);
    return list;
  });
  const extras = {};
  for (const k of EXTRA_KEYS) extras[k] = json.extras?.[k]?.length ? json.extras[k] : [''];
  const shift = {};
  for (const k of ['itsu', 'basho', 'aite']) {
    const v = json.shift?.[k];
    shift[k] = Array.isArray(v) ? v : [v];
  }
  SETS[key] = { ...json, scenes, extras, shift };
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
