// きおくめくりの配置デール（KM-010）。そのレベルのセル（位置キー）へ絵を割り当て、対象を1つ選ぶ。
// 絵の素材が未用意のため、当面は A〜I の文字を「絵」とみなす仮置き。毎試行ランダムに呼ぶ。

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

/** Fisher–Yates シャッフル（rng を注入可能＝テスト用）。 */
export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {string[]} keys そのレベルの位置キー（セル）
 * @param {{letters?:string[], rng?:()=>number}} [opts]
 * @returns {{ map: Record<string,string>, targetKey: string, targetLetter: string }}
 *   map: 位置キー→絵（文字）／targetKey: 探す位置／targetLetter: 探す絵
 */
export function deal(keys, { letters = LETTERS, rng = Math.random } = {}) {
  const chosen = shuffle(letters, rng).slice(0, keys.length); // 別々の絵（重複なし）
  const map = {};
  keys.forEach((k, i) => { map[k] = chosen[i]; });
  const targetKey = keys[Math.floor(rng() * keys.length)];
  return { map, targetKey, targetLetter: map[targetKey] };
}
