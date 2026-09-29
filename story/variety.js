// 保存するのは候補IDだけ。本文・名前・音声は保存しない。
import { ROW_KEYS } from './story-data.js';
export const HISTORY_LIMIT = 240;
export const REPERTOIRE_LIMIT = 160;
export function cleanHistory(value) {
  return Array.isArray(value) ? value.filter(id => typeof id === 'string' && id.length < 120).slice(-HISTORY_LIMIT) : [];
}
export function remember(history, used) {
  return [...cleanHistory(history), ...cleanHistory(used)].slice(-HISTORY_LIMIT);
}
export function rememberRepertoire(history, used) {
  return remember(history, used).slice(-REPERTOIRE_LIMIT);
}

// 筋・分岐は文章の履歴と分離。未登場を先に選び、一巡後は古い候補の重みを増やす。
// 8筋中直近2筋、3ルート中直近1ルートを避ける。全候補一巡の固定順にはしない。
export function repertoirePicker(choose, history = []) {
  const previous = cleanHistory(history).slice(-REPERTOIRE_LIMIT), used = [];
  return { used, take(group, values, avoidRecent = 2) {
    if (!values.length) throw new Error('Empty repertoire: ' + group);
    const options = values.map(value => ({ value, id: group + '/' + value.id }));
    const ids = new Set(options.map(o => o.id));
    const recent = [...previous, ...used].filter(id => ids.has(id));
    const limit = Math.max(0, Math.min(avoidRecent, options.length - 1));
    const blocked = new Set(limit ? recent.slice(-limit) : []);
    const available = options.filter(o => !blocked.has(o.id));
    const unseen = available.filter(o => !recent.includes(o.id));
    const tickets = unseen.length ? unseen : available.flatMap(o =>
      Array(1 + Math.min(16, recent.length - 1 - recent.lastIndexOf(o.id))).fill(o));
    const selected = choose(tickets);
    used.push(selected.id);
    return selected.value;
  } };
}

// 候補不足時は古い制限から緩める。同じ話の転換文は候補が尽きるまで重複させない。
export function varietyPicker(pick, history = []) {
  const previous = cleanHistory(history), used = [];
  return {
    used,
    take(group, values, avoidRecent = 3, unique = false) {
      if (!values.length) throw new Error('Empty story choices: ' + group);
      const prefix = group + '/';
      const limit = Math.max(0, Math.min(avoidRecent, values.length - 1));
      const recent = limit ? [...previous, ...used].filter(id => id.startsWith(prefix)).slice(-limit) : [];
      const inStory = new Set(unique ? used.filter(id => id.startsWith(prefix)) : []);
      const options = values.map((value, i) => ({ value, id: prefix + i }));
      let available;
      do {
        available = options.filter(o => !recent.includes(o.id) && !inStory.has(o.id));
        if (available.length || !recent.length) break;
        recent.shift();
      } while (true);
      const selected = pick(available.length ? available : options);
      used.push(selected.id);
      return selected.value;
    },
  };
}

// 2026-09-28版が保存した配列番号を、当時の並びに従って固定IDへ移す。
// カタログの今後の並べ替えで過去の番号の意味を変えないため、移行表は固定する。
const LEGACY_PLOTS = {
  adventure: ['flying', 'rain-shelter', 'balloon', 'bridge'],
  mystery: ['storage', 'swapped-bags', 'footprints', 'mirror-letter'],
  mishap: ['sticky', 'cart-wheel', 'mixed-labels', 'festival-lights'],
  wonder: ['greeting', 'shadows', 'tiny-things', 'colors'],
  journey: ['delivery', 'detour', 'shared-load', 'ticket'],
};
function restoreRepertoire(raw) {
  if (Array.isArray(raw?.repertoire)) return cleanHistory(raw.repertoire).slice(-REPERTOIRE_LIMIT);
  const routes = new Set(['rain-shelter', 'storage', 'sticky', 'greeting', 'delivery']);
  return cleanHistory(raw?.alternate).flatMap(id => {
    const match = /^a\/plot-([a-z]+)\/([0-3])$/.exec(id);
    const plot = match && LEGACY_PLOTS[match[1]]?.[Number(match[2])];
    return plot ? [`plot/${match[1]}/${plot}`, ...(routes.has(plot) ? [`route/${plot}/base`] : [])] : [];
  }).slice(-REPERTOIRE_LIMIT);
}

export function cleanReplay(value) {
  const result = {};
  for (const audience of ['kids', 'adult']) {
    const raw = value?.[audience];
    result[audience] = {
      original: cleanHistory(raw?.original), alternate: cleanHistory(raw?.alternate),
      repertoire: restoreRepertoire(raw),
      scenes: Array.isArray(raw?.scenes) ? raw.scenes.slice(-2).map(list => cleanHistory(list).slice(-8)) : [],
      cards: Array.isArray(raw?.cards) ? raw.cards.slice(-2).map(game => Object.fromEntries(ROW_KEYS.map(key => [key,
        Array.isArray(game?.[key]) ? [...new Set(game[key].filter(id => Number.isInteger(id) && id >= 0 && id < 4096))].slice(0, 3) : [],
      ]))) : [],
      type: typeof raw?.type === 'string' && raw.type.length < 40 ? raw.type : null,
    };
  }
  return result;
}
