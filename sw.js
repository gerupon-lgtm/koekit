// Service Worker（PWA / T-003 / 要件12）＋ キャッシュバスター
//
// キャッシュ方針:
// - アプリ本体（HTML/CSS/JS/フォント/アイコン）: network-first。オンラインなら常に最新を取得し、
//   デプロイのたびに自動で最新化される（＝キャッシュバスター）。オフライン時はキャッシュへフォールバック。
//   さらに APP_CACHE 名に BUILD を含め、デプロイごとに旧キャッシュを破棄する。
// - Voskモデル（Cloudflare R2・別オリジン・約48MB）: SWは一切触らない。vosk-browser 側の Cache Storage に任せる
//   （＝キャッシュバスターの対象外。再取得しない）。
// - vosk.js ライブラリ（同一オリジン・約5.8MB）: STATIC_CACHE に cache-first。毎デプロイでの再取得を避ける。
//   ライブラリを更新したときだけ STATIC_CACHE の版を上げて更新する。
//
// BUILD は scripts/stamp-cache.cjs が各デプロイ前に一意な値へ置換する。

const VERSION = '0.1.0';            // version.json と一致（scripts/check-version 対象）
const BUILD = 'v0.1.0-20260920073647-c31e7fd';         // ← scripts/stamp-cache.cjs がデプロイ毎に置換
const APP_CACHE = 'koekit-app-' + BUILD;
const STATIC_CACHE = 'koekit-static-v2'; // 大きい静的資産（vosk.js等）。中身を変えたときだけ版を上げる

// オフライン初回用に事前キャッシュする最小シェル（すべて小さいアプリ本体）
const SHELL = [
  './src/ui/menu-controls.css', './src/ui/menu-help.js',
  './', './index.html', './styles.css', './manifest.json', './sw-register.js',
  './src/game/progress.js', './src/ui/achievement.js', './src/ui/levelselect.js', './src/ui/certificate.js',
  './src/ui/menu-layout.js', './src/ui/menu-fit.js',
  './src/game/levels.js', './src/game/positions.js', './src/game/phase.js', './src/game/judge.js',
  './src/game/deal.js', './src/game/animals.js', './src/game/roulette.js', './src/ui/board.js',
  './src/audio/sfx.js', './src/log/recorder.js', './src/log/csv.js', './src/log/metrics.js',
  './src/ui/levelintro.js', './src/ui/levelnavigation.js', './src/ui/cardreveal.js', './src/ui/screenawake.js',
  './assets/brand/koekit-symbol.webp',
  './assets/brand/pitarhythm.svg',
  './assets/brand/memorhythm.svg',
  './assets/icons/koekit-180.png', './assets/icons/koekit-192.png',
  './assets/icons/koekit-512.png', './assets/icons/koekit-maskable-512.png',
  './doubutsu/', './doubutsu/index.html', './doubutsu/app.js',
  './kioku/entry.js', './kioku/sequence.js', './src/game/sequence.js', './src/game/sequence-phase.js', './src/ui/sequenceview.js',
  './kioku/', './kioku/?mode=sequence', './kioku/index.html', './kioku/app.js',
  './irodori/', './irodori/index.html', './irodori/styles.css', './irodori/app.js',
  './irodori/help.js', './irodori/board.js', './irodori/palette.js', './irodori/storage.js',
  './irodori/tutorial.js', './irodori/templates.js', './irodori/recipes.js',
  './irodori/vocabulary.js', './irodori/phase.js', './assets/brand/irodorhythm.svg',
  './jintori/', './jintori/index.html', './jintori/styles.css', './jintori/app.js',
  './jintori/view.js', './jintori/rules.js', './jintori/config.js', './jintori/run.js',
  './jintori/commands.js', './jintori/voice.js', './jintori/storage.js',
  './jintori/cpu.js', './jintori/cpu-worker.js', './assets/brand/jintorhythm.svg',
  './jintori/sound.js',
  './src/speech/public-method.js', './src/speech/index.js', './src/speech/config.js', './src/speech/vosk.js',
  './src/speech/vosk-worklet.js', './src/speech/webspeech.js', './src/speech/vocabulary.js', './src/util/emitter.js',
  './src/ui/micstate.js', './assets/fonts/MPLUSRounded1c-Regular.subset.woff2',
  './assets/fonts/MPLUSRounded1c-Bold.subset.woff2',
];

// cache-first にする大きい静的資産（同一オリジン）。ここに載るものは毎デプロイでは再取得しない。
function isStatic(url) {
  // 大きめ・変化の少ない静的資産は cache-first で保持（毎デプロイで再取得しない）。
  // 画像を差し替えたら STATIC_CACHE の版を上げる。
  return url.pathname.includes('/lib/vosk/') || url.pathname.includes('/assets/animals/');
}

// 初めて選ばれる動物もオフライン表示する。ANIMAL_FILESとの同値はtest-sw.cjsで検証。
const STATIC_SHELL = [
  './lib/vosk/vosk.js',
  ...['Lion.png', 'dog.png', 'elephant.png', 'giraffe.png', 'monaka.png',
    'monkey.png', 'panda.png', 'pingu.png', 'rabbit.png', 'tabi1.png', 'tabi2.png']
    .map(file => './assets/animals/' + file),
];
self.addEventListener('install', event => {
  event.waitUntil(Promise.allSettled([
    caches.open(APP_CACHE).then(cache => Promise.allSettled(
      SHELL.map(u => cache.add(new Request(u, { cache: 'reload' }))))),
    caches.open(STATIC_CACHE).then(cache => Promise.allSettled(STATIC_SHELL.map(async u => {
      if (!await cache.match(u)) await cache.add(new Request(u, { cache: 'reload' }));
    }))),
  ]).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => (k.startsWith('koekit-app-') || k.startsWith('koekit-static-')) && k !== APP_CACHE && k !== STATIC_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 別オリジン（R2のモデル等）はSWで触らない＝キャッシュバスター対象外
  if (url.origin !== self.location.origin) return;

  // 大きい静的資産（vosk.js）は cache-first で保持（毎デプロイで再取得しない）
  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req, { cache: 'reload' }).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }))
    );
    return;
  }

  // アプリ本体は network-first（オンラインなら常に最新＝キャッシュバスター）
  event.respondWith(
    fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(APP_CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() =>
      caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
    )
  );
});
