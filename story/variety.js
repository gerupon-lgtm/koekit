// 保存するのは候補IDだけ。本文・名前・音声は保存しない。
export const HISTORY_LIMIT = 240;
export function cleanHistory(value) {
  return Array.isArray(value) ? value.filter(id => typeof id === 'string' && id.length < 120).slice(-HISTORY_LIMIT) : [];
}
export function remember(history, used) {
  return [...cleanHistory(history), ...cleanHistory(used)].slice(-HISTORY_LIMIT);
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

export function cleanReplay(value) {
  const result = {};
  for (const audience of ['kids', 'adult']) {
    const raw = value?.[audience];
    result[audience] = {
      original: cleanHistory(raw?.original), alternate: cleanHistory(raw?.alternate),
      scenes: Array.isArray(raw?.scenes) ? raw.scenes.slice(-2).map(list => cleanHistory(list).slice(-8)) : [],
      type: typeof raw?.type === 'string' && raw.type.length < 40 ? raw.type : null,
    };
  }
  return result;
}
