const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const [width, height] of [[390,844], [390,780], [390,664], [360,640], [360,620], [320,568]]) for (const mode of ['doubutsu', 'kioku-place', 'kioku-sequence']) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
      await context.addInitScript(mode => localStorage.setItem('koekit.progress.v1.' + mode, '["1","2"]'), mode);
      const live = await context.newPage();
      const errors = [];
      live.on('pageerror', e => errors.push(e.message));
      await live.goto('http://127.0.0.1:8000/' + (mode === 'doubutsu' ? 'doubutsu/' : mode === 'kioku-place' ? 'kioku/' : 'kioku/?mode=sequence'));
      await live.locator('#approved-menu-layout').waitFor({ state: 'attached' }).catch(error => { throw new Error(`${mode} ${width}x${height}: ${errors.join('; ')} ${error.message}`); });
      await live.evaluate(() => document.fonts.ready);
      const review = await context.newPage();
      review.on('pageerror', e => errors.push(e.message));
      const state = { mode, record: 'partial', screen: 'device' };
      await review.goto('http://127.0.0.1:8000/menu-preview/?proposal=fit-v1#' + encodeURIComponent(JSON.stringify(state)));
      await review.waitForFunction(() => document.querySelector('#fit').textContent.includes('px'));
      const frame = review.frames()[1];
      await frame.evaluate(() => document.fonts.ready);
      const geometry = () => ['.app-title', '#start-play', '.memory-level-list', '.unlock-hint', '#highest-title', '.title-footer'].map(s => {
        const e = document.querySelector(s), r = e.getBoundingClientRect();
        return { selector: s, x: r.x, y: r.y, width: r.width, height: r.height, text: e.innerText };
      });
      assert.deepEqual(await live.evaluate(geometry), await frame.evaluate(geometry), 'production equals approved review');
      assert.equal(await live.evaluate(() => document.documentElement.scrollHeight), height);
      assert.ok(await live.locator('.title-footer').evaluate(e => e.getBoundingClientRect().bottom <= innerHeight - 7));
      assert.equal(await live.locator('.memory-level-list button').count(), 7);
      assert.equal(await live.locator('.memory-speed-picker').count(), 0);
      assert.equal(await live.locator('#start-play').innerText(), '▶ はじめから あそぶ');
      assert.equal(await live.locator('#speed-play').isDisabled(), true);
      assert.equal(await live.locator('.memory-level-list button').evaluateAll(es => es.every(e => e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight)), true);
      const heights = await live.locator('.memory-level-list button').evaluateAll(es => es.map(e => e.getBoundingClientRect().height));
      assert.equal(new Set(heights).size, 1);
      assert.ok(heights[0] >= 44);
      await live.screenshot({ path: `.local-tools/approved-${mode}-${width}-${height}.png` });
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS all 3 production modes equal approved review at six phone sizes, without scrolling');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
