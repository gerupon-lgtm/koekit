// 位置キーの共有メタ（両アプリ共通）
// - 3×3グリッドのセル(r,c)
// - 矢印の回転角(deg)。基準の矢印は上向き(0)。中央(center)は矢印ではなく中点なので deg=null。
export const POS = {
  up:        { r: 1, c: 2, deg: 0 },
  down:      { r: 3, c: 2, deg: 180 },
  left:      { r: 2, c: 1, deg: 270 },
  right:     { r: 2, c: 3, deg: 90 },
  center:    { r: 2, c: 2, deg: null },
  upleft:    { r: 1, c: 1, deg: 315 },
  upright:   { r: 1, c: 3, deg: 45 },
  downleft:  { r: 3, c: 1, deg: 225 },
  downright: { r: 3, c: 3, deg: 135 },
};

// 位置語キー（9語）。レベル5・延長で使う。
export const ALL_POSITIONS = [
  'up', 'down', 'left', 'right', 'center',
  'upleft', 'upright', 'downleft', 'downright',
];
