// イロドリズム パレット定義 — docs/irodori/screens.md「パレット」に一致
// index がデータの色番号（cells に保存）。並びは似た色を離してある（色覚配慮NR-07）。
// ※ index＝データ値。順序を変えると保存済みデータと非互換になる。

export const COLORS = [
  { name: 'あか',     hex: '#E2413A' }, // 0
  { name: 'みずいろ', hex: '#5CC4E6' }, // 1
  { name: 'きいろ',   hex: '#F5D21F' }, // 2
  { name: 'むらさき', hex: '#8A5CC4' }, // 3
  { name: 'みどり',   hex: '#3FA34D' }, // 4
  { name: 'ピンク',   hex: '#F29AC0' }, // 5
  { name: 'あお',     hex: '#2F6FD6' }, // 6
  { name: 'オレンジ', hex: '#F08C2E' }, // 7
  { name: 'きみどり', hex: '#A8D24A' }, // 8
  { name: 'ちゃいろ', hex: '#9C6B3F' }, // 9
  { name: 'しろ',     hex: '#FFFFFF' }, // 10
  { name: 'くろ',     hex: '#2B2B2B' }, // 11
];

export const ERASE = -1;   // 消しゴム（未着色 null に戻す）。色indexとは別の特別値
export function colorHex(index) {
  return (index == null || index === ERASE) ? null : (COLORS[index]?.hex ?? null);
}
export function colorName(index) {
  if (index === ERASE) return 'けす';
  return index == null ? '' : (COLORS[index]?.name ?? '');
}
