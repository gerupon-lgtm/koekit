// プレビュー専用。確定後はこの生成CSSをそのまま採用できる。
export const FIELDS = [
  { key: 'upperHeight', label: 'れんしゅう・モード切り替えの高さ', min: 36, max: 64, value: 44 },
  { key: 'levelHeight', label: '選択ボタンの高さ', min: 40, max: 80, value: 44 },
  { key: 'buttonGap', label: '選択ボタンの間隔', min: 4, max: 20, value: 10 },
  { key: 'sectionGap', label: '上部・各段の間隔', min: 4, max: 16, value: 6 },
  { key: 'logoWidth', label: 'ロゴの幅（画面に収まる範囲）', min: 160, max: 290, value: 220 },
  { key: 'logoOffset', label: 'ロゴを下げる量', min: 0, max: 32, value: 4 },
  { key: 'titleGap', label: '注釈と称号の間隔を追加', min: 0, max: 40, value: 0 },
];
export const DEFAULTS = Object.fromEntries(FIELDS.map(f => [f.key, f.value]));
export function normalize(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  return Object.fromEntries(FIELDS.map(f => {
    const value = Number(input[f.key] ?? f.value);
    return [f.key, Number.isFinite(value) ? Math.max(f.min, Math.min(f.max, Math.round(value))) : f.value];
  }));
}
export function layoutCSS(input) {
  const s = normalize(input);
  return `/* koekit-menu-layout-v1 */
.play-app #title { --menu-gap: ${s.sectionGap}px; --menu-tab-height: ${s.upperHeight}px; }
.play-app #title .app-title { width: min(${s.logoWidth}px, calc(100% - 96px)); height: auto; aspect-ratio: 718 / 196; margin: ${s.logoOffset}px 0 0; }
.play-app #title .wordmark { height: auto; }
.play-app #title .level-picker { flex: 0 0 auto; }
.play-app #title #level-select { height: auto; }
.play-app #title .memory-level-list { flex: none; grid-template-rows: repeat(5, ${s.levelHeight}px); gap: ${s.buttonGap}px; max-height: none; }
.play-app #title .unlock-hint { margin-top: 0; }
.play-app #title #highest-title { margin-top: ${s.titleGap}px; }
.play-app #title .title-footer { margin-top: auto; }
`;
}
