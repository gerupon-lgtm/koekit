// Service Worker 登録（各ページから type="module" で読み込む）。
// import.meta.url 基準で sw.js を解決するため、ルート/サブディレクトリのどちらから読んでも
// 同じルートスコープの SW を登録する。
if ('serviceWorker' in navigator) {
  // sw.js はルートにあるため、既定スコープ（sw.js のあるディレクトリ = /koekit/）で
  // /koekit/ 配下全体を対象にできる。scope は指定しない。
  const swUrl = new URL('./sw.js', import.meta.url).href;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl).catch(() => {
      /* 登録失敗してもアプリは動く（オフライン起動だけ効かない） */
    });
  });
}
