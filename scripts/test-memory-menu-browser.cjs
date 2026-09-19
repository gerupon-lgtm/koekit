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
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        const speed = page.locator('button[data-speed="true"]');
        await speed.waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await speed.isDisabled(), true);
        assert.equal(await speed.innerText(), '🔒 スピード');
        assert.equal(await page.locator('[data-level]').count(), 5);
        if (sequence) assert.deepEqual(await page.locator('[data-level]').allTextContents(), ['2て', '3て', '4て', '5て', '6て']);
        assert.equal(await page.locator('[data-level]').evaluateAll(es => es.every(e => e.clientWidth >= e.scrollWidth && e.getBoundingClientRect().height >= 44)), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
        const initial = await Promise.all(['.app-title', pitarhythm ? '#start-play' : '.mode-picker', '.memory-speed-picker', '#highest-title'].map(top));
        positions.push(initial);
        await page.screenshot({ path: `.local-tools/menu-${mode}-${width}-${height}.png`, fullPage: true });
        const key = 'koekit.progress.v1.' + (pitarhythm ? 'doubutsu' : sequence ? 'kioku-sequence' : 'kioku-place');
        await page.evaluate(key => localStorage.setItem(key, JSON.stringify(['1','2','3','4','5'])), key);
        await page.reload();
        await speed.waitFor();
        assert.equal(await speed.isDisabled(), false);
        assert.equal(await speed.innerText(), 'スピード');
        await speed.focus();
        await page.keyboard.press('Enter');
        assert.equal(await speed.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-level]').count(), sequence ? 5 : 1);
        assert.equal(await page.locator('[data-level]').first().getAttribute('data-level'), sequence ? 's1' : 'extra');
        const switched = await Promise.all(['.app-title', pitarhythm ? '#start-play' : '.mode-picker', '.memory-speed-picker', '#highest-title'].map(top));
        assert.deepEqual(switched, initial, 'logo and record stay in place when speed unlocks and is selected');
        await page.locator('button[data-speed="false"]').click();
        assert.equal(await page.locator('[data-level].completed').count(), 5);
        assert.equal(await page.locator('[data-level="1"]').getAttribute('aria-label'), sequence ? '通常 2て クリアずみ' : '通常 ひだり・みぎ クリアずみ');
      }
      assert.deepEqual(positions[0], positions[1], 'place and sequence share logo, menu and record positions');
      assert.deepEqual(positions[0], positions[2], 'Pitarhythm shares logo, menu and record positions');
    }
    assert.deepEqual(errors, []);
    console.log('PASS shared menus: labels, locks, keyboard switching, clear marks and aligned layout without scrolling at five viewport sizes');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
