const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const [width, height] of [[390,844], [390,664], [360,640], [320,568]]) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
      await context.addInitScript(() => localStorage.setItem('koekit.progress.v1.doubutsu', '["1","2"]'));
      const live = await context.newPage(), review = await context.newPage();
      const errors = [];
      for (const page of [live, review]) page.on('pageerror', e => errors.push(e.message));
      await live.goto('http://127.0.0.1:8000/doubutsu/');
      await live.locator('#approved-menu-layout').waitFor({ state: 'attached' });
      await live.evaluate(() => document.fonts.ready);
      const state = { mode: 'doubutsu', record: 'partial', screen: 'device' };
      await review.goto('http://127.0.0.1:8000/menu-preview/?proposal=fit-v1#' + encodeURIComponent(JSON.stringify(state)));
      await review.waitForFunction(() => document.querySelector('#fit').textContent.includes('px'));
      const frame = review.frames()[1];
      await frame.evaluate(() => document.fonts.ready);
      const geometry = () => ['.app-title', '#start-play', '.memory-speed-picker', '.memory-level-list', '.unlock-hint', '#highest-title', '.title-footer'].map(s => {
        const e = document.querySelector(s), r = e.getBoundingClientRect();
        return { selector: s, x: r.x, y: r.y, width: r.width, height: r.height, text: e.innerText };
      });
      assert.deepEqual(await live.evaluate(geometry), await frame.evaluate(geometry), 'production equals approved review');
      assert.equal(await live.evaluate(() => document.documentElement.scrollHeight), height);
      await live.screenshot({ path: `.local-tools/approved-pitarhythm-${width}-${height}.png` });
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS production equals approved review at four phone sizes, without scrolling');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
