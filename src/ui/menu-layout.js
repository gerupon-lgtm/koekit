// 実画面で確認した寸法ルール。本番とプレビューで同じCSSを使用する。
export const FIELDS = [
  { key: 'upperHeight', label: '場所／順番の切り替えの高さ', min: 36, max: 64, value: 44 },
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

// 2026-09-20 承認済み7ボタン配置。実画面の比較画像と同じ寸法。
export const continuousMenuCSS = `
.play-app #title {--menu-gap:12px; --menu-tab-height:48px; gap:12px;}
.play-app #title .app-title {width:min(290px,calc(100% - 96px));height:auto;aspect-ratio:718/196;margin:19px 0 0;}
.play-app #title .wordmark {height:auto;}
.play-app #title .level-picker {flex:0 0 auto;}
.play-app #title #level-select {height:auto;gap:12px;}
.play-app #title .memory-level-list {flex:none;grid-template-rows:repeat(7,56px);gap:16px;max-height:none;}
.play-app #title .unlock-hint {margin:0;font-size:13px;}
.play-app #title #highest-title {margin-top:12px;}
.play-app #title .title-footer {margin-top:auto;}
.play-app #level-select .start-entry {background:#e7ddef;color:#3d2f4a;}
.play-app #level-select .speed-entry {background:#e7ddef;color:#3d2f4a;}
.play-app #level-select .speed-entry:disabled {background:#e9e5df;color:#79736c;opacity:1;}
.mode-placeholder {height:48px;flex-shrink:0;}
@media(max-height:810px){
.play-app #title {gap:8px;--menu-tab-height:44px;}
.play-app #title .app-title {margin-top:8px;}
.play-app #title #level-select {gap:8px;}
.play-app #title .memory-level-list {grid-template-rows:repeat(7,44px);gap:10px;}
.mode-placeholder {height:44px;}
.play-app #title #highest-title {margin-top:12px;}
}

.play-app #title #level-select #start-play {width:100%;height:100%;font-size:24px;border-radius:20px;padding:2px 12px;background:#e7ddef;color:#3d2f4a;}
@media(max-height:620px){
.play-app #title {gap:2px;}
.play-app #title .app-title {margin-top:0;}
.play-app #title #level-select {gap:6px;}
.play-app #title .memory-level-list {gap:7px;}
}

/* 4作品の比較画像で承認された配置。短い画面は上記のコンパクト配置。 */
@media(min-height:780px){
.play-app #title {position:relative;display:block;height:100svh;min-height:100svh;padding:0 16px;}
.play-app #title .app-title {position:absolute;top:58px;left:50%;transform:translateX(-50%);width:min(380px,calc(100% - 32px));height:auto;margin:0;}
.play-app #title .mode-picker,.play-app #title .mode-placeholder {position:absolute;top:176px;left:50%;transform:translateX(-50%);width:min(420px,calc(100% - 32px));height:44px;margin:0;}
.play-app #title .level-picker {position:absolute;top:229px;left:50%;transform:translateX(-50%);width:min(420px,calc(100% - 32px));margin:0;}
.play-app #title #level-select {gap:8px;}
.play-app #title .memory-level-list {grid-template-rows:repeat(7,clamp(44px,calc((100svh - 476px) / 7),52px));gap:12px;}
.play-app #title #highest-title {position:absolute;bottom:64px;left:50%;transform:translateX(-50%);width:min(420px,calc(100% - 32px));height:58px;min-height:58px;margin:0;}
.play-app #title .title-footer {position:absolute;bottom:max(8px,env(safe-area-inset-bottom));left:0;width:100%;margin:0;}
}
`;
