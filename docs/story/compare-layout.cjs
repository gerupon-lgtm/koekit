// 同一画面サイズで、既存作品と本作のタイトル配置・ロゴの描画寸法を実測する。
const { chromium } = require(process.env.STORY_PLAYWRIGHT || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.STORY_BASE || 'http://127.0.0.1:8124';
const stage = process.argv[2] === 'before' ? 'before' : 'after';
const out = path.join(__dirname, 'previews');
const apps = [
  { route: 'doubutsu', title: 'ピタリズム', logo: '#title .wordmark', caption: null, menu: '.level-picker' },
  { route: 'kioku', title: 'メモリズム', logo: '#title .wordmark', caption: null, menu: '.level-picker' },
  { route: 'irodori', title: 'イロドリズム', logo: '.ir-logo img', caption: '.ir-logo + .ir-intro', menu: '.ir-menu' },
  { route: 'jintori', title: 'ジントリズム', logo: '#title .wordmark', caption: '.title-caption', menu: '#menu-options' },
  { route: 'story', title: 'モノガタリズム', logo: '.wordmark', caption: '.lead', menu: '.menu-options' },
];
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const results = [], shots = [];
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(() => {
      localStorage.setItem('koekit.microphone.enabled', 'false');
      localStorage.setItem('koekit.story.settings', JSON.stringify({ tts: 'off' }));
    });
    for (const [width, height] of [[320,568], [390,664], [390,780], [390,844], [768,1024]]) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height });
      for (const app of apps) {
        await page.goto(`${base}/${app.route}/`);
        await page.locator(app.logo).waitFor({ state: 'visible' });
        await page.evaluate(() => document.fonts.ready);
        await page.locator(app.logo).evaluate(img => img.decode());
        if (app.route === 'story') await page.waitForFunction(() => !!window.__story && !document.getElementById('go-name').disabled);
        const geometry = await page.evaluate(app => {
          const rect = selector => {
            const el = selector && document.querySelector(selector); if (!el) return null;
            const { x,y,width,height } = el.getBoundingClientRect();
            return { x,y,width,height };
          };
          const img = document.querySelector(app.logo), box = img.getBoundingClientRect();
          const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
          return { logo: rect(app.logo), paintedLogo: { width: img.naturalWidth * scale, height: img.naturalHeight * scale }, caption: rect(app.caption), menu: rect(app.menu), overflow: document.documentElement.scrollWidth > innerWidth };
        }, app);
        results.push({ viewport: `${width}x${height}`, app: app.title, ...geometry });
        if (width === 390 && height === 844 && ['irodori','jintori','story'].includes(app.route)) {
          const png = await page.screenshot();
          fs.writeFileSync(path.join(out, `layout-${app.route}-${stage}.png`), png);
          shots.push({ title: app.title, image: png.toString('base64') });
        }
      }
      await page.close();
    }
    const collage = await context.newPage();
    await collage.setViewportSize({ width: 1218, height: 894 });
    await collage.setContent(`<body style="margin:0;padding:12px;background:#eae2d6;display:flex;gap:12px;font:16px sans-serif;color:#493f36">${shots.map(s => `<section><p style="margin:0 0 10px;text-align:center">${s.title}</p><img width="390" height="844" src="data:image/png;base64,${s.image}"></section>`).join('')}</body>`);
    await collage.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    await collage.screenshot({ path: path.join(out, `layout-comparison-${stage}.png`) });
    fs.writeFileSync(path.join(out, `layout-measurements-${stage}.json`), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results.filter(r => ['ジントリズム','モノガタリズム'].includes(r.app)), null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
