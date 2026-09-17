// レベル定義（静的データ / data-model.md 4節・要件8.6）
//
// レベル4（四隅）は斜め4語を切り出して測るために設けた段。
// レベル3から直接9枚へ進めない（要件8.6）。フェーズ0で使うのは '0'（ルーレット）のみ。

/** 位置語キー（9語）。レベル5・延長で使う。 */
export const ALL_POSITIONS = [
  'up', 'down', 'left', 'right', 'center',
  'upleft', 'upright', 'downleft', 'downright',
];

export const LEVELS = [
  { id: '0',     layout: 'roulette', cards: 0, vocab: [] },
  { id: '1',     layout: 'lr',       cards: 2, vocab: ['left', 'right'] },
  { id: '2',     layout: 'ud',       cards: 2, vocab: ['up', 'down'] },
  { id: '3',     layout: 'plus',     cards: 5, vocab: ['up', 'down', 'left', 'right', 'center'] },
  { id: '4',     layout: 'corners',  cards: 4, vocab: ['upleft', 'upright', 'downleft', 'downright'] },
  { id: '5',     layout: 'grid3x3',  cards: 9, vocab: [...ALL_POSITIONS] },
  { id: 'extra', layout: 'grid3x3',  cards: 9, vocab: [...ALL_POSITIONS], speedFactor: 1.5 },
];

export function getLevel(id) {
  return LEVELS.find(l => l.id === id) || null;
}
