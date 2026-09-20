const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ serviceWorkers: 'block', viewport: { width: 1920, height: 911 } });
    await page.goto('http://127.0.0.1:8000/menu-preview/?proposal=fit-v1');
    await page.waitForFunction(() => document.querySelector('#fit').textContent.includes('px'));
    assert.match(await page.locator('#fit').innerText(), /390 × 664/);
    await page.setViewportSize({ width: 1200, height: 700 });
    assert.equal(await page.frames()[1].evaluate(() => innerWidth), 390);
    assert.equal(await page.frames()[1].evaluate(() => innerHeight), 664);
    for (const [width, height] of [[390,844], [390,664], [360,640], [320,568]]) {
      await page.setViewportSize({ width, height });
      const positions = [];
      for (const mode of ['doubutsu', 'kioku-place', 'kioku-sequence']) {
        const state = { mode, record: 'partial', screen: 'device' };
        await page.goto('http://127.0.0.1:8000/menu-preview/?proposal=fit-v1#' + encodeURIComponent(JSON.stringify(state)));
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#fit').textContent.includes('px'));
        const frame = page.frames()[1];
        const geometry = await frame.evaluate(() => {
          const rect = s => document.querySelector(s).getBoundingClientRect();
          return { footer: rect('.title-footer').bottom, record: rect('#highest-title').top,
            logo: rect('.app-title').top, scroll: document.documentElement.scrollHeight,
            buttons: [...document.querySelectorAll('[data-level]')].map(e => e.getBoundingClientRect().height),
            gap: parseFloat(getComputedStyle(document.querySelector('#highest-title')).marginTop) };
        });
        assert.equal(geometry.scroll, height);
        assert(geometry.footer <= height - 7, JSON.stringify({mode,width,height,geometry}));
        assert.equal(geometry.gap, 12);
        assert(geometry.buttons.every(h => h >= 44 && Math.abs(h - geometry.buttons[0]) < .1));
        if (height === 844) assert.equal(geometry.buttons[0], 56);
        positions.push(geometry);
      }
      assert.deepEqual(positions[0], positions[1]);
      assert.deepEqual(positions[1], positions[2]);
    }
    console.log('PASS review: fixed phone viewport on PC, 3 modes × 4 sizes fit with aligned records and 12px extra title gap');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
