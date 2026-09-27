// STORY_BASE でローカル／公開先を指定。実マイク・読み上げはこの検査の対象外。
const { chromium } = require(process.env.STORY_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.STORY_BASE || 'http://127.0.0.1:8124';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => {
      localStorage.setItem('koekit.microphone.enabled', 'false');
      localStorage.setItem('koekit.story.settings', JSON.stringify({ tts: false, audience: 'kids', order: 'normal', rate: 1 }));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/');
    assert.equal(await page.locator('.app-card').count(), 7);
    assert.equal(await page.locator('a.app-card').count(), 6);
    assert.equal(await page.locator('.coming-soon .app-status').innerText(), '近日公開予定');
    assert.equal(await page.locator('.coming-soon a,.coming-soon button').count(), 0);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    for (const file of ['/story/', '/story/data/kids.json', '/story/data/adult.json', '/story/assets/monogatarhythm.svg']) {
      assert.ok(await page.evaluate(async file => !!await caches.match(file), file), 'cached: ' + file);
    }
    await context.setOffline(true);
    await page.locator('a[href="./story/"]').click();
    await page.waitForFunction(() => !!window.__story && !document.getElementById('go-name').disabled);
    assert.equal(await page.title(), 'モノガタリズム');
    await page.locator('#go-name').click();
    await page.locator('#names button').first().click();
    await page.locator('#name-ok').click();
    for (let i = 0; i < 4; i++) await page.locator('#ok').click();
    await page.locator('#start').click();
    assert.ok(await page.locator('#story li').count() >= 4);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#end').click();
    await page.locator('#home-link').click();
    assert.equal(await page.locator('.app-card').count(), 7);
    assert.deepEqual(errors, []);
    console.log('PASS: ' + base + ' seven cards, coming-soon label, offline first story visit, touch creation, home return');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
