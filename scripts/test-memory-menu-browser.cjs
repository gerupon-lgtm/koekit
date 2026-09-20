const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const top = selector => page.locator(selector).evaluate(e => e.getBoundingClientRect().top + scrollY);
    for (const [width, height] of [[320,568], [360,640], [390,664], [390,844], [768,1024]]) {
      await page.setViewportSize({ width, height });
      const positions = [];
      for (const mode of ['place', 'sequence', 'doubutsu']) {
        const sequence = mode === 'sequence';
        const pitarhythm = mode === 'doubutsu';
        await page.goto('http://127.0.0.1:8000/' + (pitarhythm ? 'doubutsu/' : 'kioku/' + (sequence ? '?mode=sequence' : '')));
        await page.locator('[data-level]').first().waitFor(); // 動的import完了前のreloadを避ける。
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        const speed = page.locator('#speed-play');
        await speed.waitFor().catch(error => { throw new Error(`${mode} ${width}x${height}: ${errors.join('; ')} ${error.message}`); });
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await speed.isDisabled(), true);
        assert.equal(await speed.innerText(), '🔒 スピード');
        assert.equal(await page.locator('[data-level]').count(), 5);
        if (sequence) assert.deepEqual(await page.locator('[data-level]').allTextContents(), ['2て', '3て', '4て', '5て', '6て']);
        assert.equal(await page.locator('[data-level]').evaluateAll(es => es.every(e => e.clientWidth >= e.scrollWidth && e.getBoundingClientRect().height >= 44)), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
        if (pitarhythm) {
          const geometry = await page.locator('[data-level]').evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; }));
          for (let i = 1; i < geometry.length; i++) {
            assert(Math.abs(geometry[i].height - geometry[0].height) < .1, 'equal button heights');
            const gap = geometry[i].top - geometry[i - 1].bottom;
            assert(gap >= 6.9 && gap <= 20.1, 'approved responsive gaps');
          }
          assert(geometry[0].height <= 70, 'received button height remains the upper limit');
          for (const selector of ['#start-play', '#speed-play']) {
            const h = await page.locator(selector).evaluate(e => e.getBoundingClientRect().height);
            assert(h >= 44 && h <= 58, 'approved upper control height');
          }
        }
        const initial = await Promise.all(['.app-title', '#start-play', '#speed-play', '#highest-title'].map(top));
        positions.push(initial);
        await page.screenshot({ path: `.local-tools/menu-${mode}-${width}-${height}.png`, fullPage: true });
        const key = 'koekit.progress.v1.' + (pitarhythm ? 'doubutsu' : sequence ? 'kioku-sequence' : 'kioku-place');
        await page.evaluate(key => localStorage.setItem(key, JSON.stringify(['1','2','3','4','5'])), key);
        await page.reload();
        await speed.waitFor().catch(error => { throw new Error(`${mode} ${width}x${height}: ${errors.join('; ')} ${error.message}`); });
        assert.equal(await speed.isDisabled(), false);
        assert.equal(await speed.innerText(), '▶ スピード');
        assert.equal(await speed.isEnabled(), true);
        assert.equal(await page.locator('[data-level]').count(), 5);
        await speed.focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('#level-intro').evaluate(e => e.open), true);
        await page.locator('#intro-back').click();
        assert.equal(await page.locator('.memory-speed-picker').count(), 0);
        assert.equal(await page.locator('[data-level].completed').count(), 5);
        assert.equal(await page.locator('[data-level="1"]').getAttribute('aria-label'), sequence ? '2て クリアずみ' : 'ひだり・みぎ クリアずみ');
      }
      assert.deepEqual(positions[0], positions[1], 'place and sequence share positions');
      assert.deepEqual(positions[0], positions[2], 'both games share positions');
    }
    assert.deepEqual(errors, []);
    console.log('PASS shared menus: labels, locks, keyboard speed entry, clear marks and aligned layout without scrolling at five viewport sizes');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
