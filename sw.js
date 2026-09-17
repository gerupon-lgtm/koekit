// Service Worker（PWA / T-003 / 要件12）
//
// - アプリシェル（HTML/CSS/JS/フォント/アイコン）をキャッシュし、オフラインで起動する
// - キャッシュ名に version を含める。更新時に古いキャッシュを破棄する
//   （VERSION は version.json の値と一致させる。scripts/check-version.cjs で同値検証）
// - 日本語モデル（Cloudflare R2・別オリジン・約48MB）はここでは事前キャッシュしない。
//   vosk-browser が自前で Cache Storage に載せる（field-check-results.md）。

const VERSION = '0.1.0'; // ← version.json と一致させる（反映先: implementation-guide 9節）
const CACHE = 'koekit-v' + VERSION;

// 起動に要る最小のアプリシェル。残り（src配下・lib・worklet等）は fetch時に随時キャッシュする。
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './doubutsu/',
  './doubutsu/index.html',
  './doubutsu/app.js',
  './assets/fonts/MPLUSRounded1c-Regular.subset.woff2',
  './assets/fonts/MPLUSRounded1c-Bold.subset.woff2',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // 一部が404でも install を止めない（addAll は全成功必須のため個別に入れる）
      .then(cache => Promise.allSettled(SHELL.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 別オリジン（R2のモデル等）はSWで触らない。vosk-browser 側のキャッシュに任せる。
  if (url.origin !== self.location.origin) return;

  // 同一オリジンは cache-first。無ければ取得してキャッシュに載せる（次回オフライン可）。
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        // 正常な同一オリジン応答のみ複製してキャッシュ
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => {
        // オフラインでナビゲーションに失敗したらトップへフォールバック
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
