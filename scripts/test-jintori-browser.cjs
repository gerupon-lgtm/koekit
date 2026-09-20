const { chromium, webkit } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.JINTORI_BASE || 'http://127.0.0.1:8000';
(async () => {
  const browser = await (process.env.JINTORI_ENGINE === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({ channel: 'chrome', headless: true }));
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.route('**/src/speech/index.js', route => route.fulfill({ contentType: 'application/javascript', body: `
      export function createSpeechInput(){const h={}; window.say=s=>h.result?.(s); return {on(k,f){h[k]=f},off(k,f){if(h[k]===f)delete h[k]},start(w){window.listening=w},stop(){window.listening=[]},dispose(){}};}
    ` }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/jintori/');
    await page.getByRole('button', { name: 'ふたり', exact: true }).click();
    await page.getByRole('button', { name: '6 × 6', exact: true }).click();
    await page.getByRole('button', { name: 'はじめから', exact: true }).click();
    await page.getByRole('button', { name: 'あお', exact: true }).click();
    await page.getByRole('button', { name: 'いろをオッケー', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'あお', exact: true }).isDisabled(), true);
    await page.evaluate(() => window.say('スタート'));
    await page.getByRole('button', { name: 'ストップ', exact: true }).click();
    await page.locator('#board [data-cell]').first().waitFor();
    assert.equal(await page.locator('#title').isVisible(), false, 'title is hidden during play');
    await page.waitForFunction(() => !document.querySelector('#game').hidden && !document.querySelector('#board').getAttribute('aria-busy'));
    const key = await page.evaluate(() => Object.keys(localStorage).find(k => k.startsWith('koekit.jintori.v1.')));
    const stored = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    const before = await stored();
    assert.equal(before.active.colorsBySide[1], 6);
    assert.notEqual(before.active.colorsBySide[2], 6);
    await page.getByRole('button', { name: /^きょうか/ }).click();
    const legal = await page.locator('[data-cell].legal').first().getAttribute('data-cell');
    await page.locator(`[data-cell="${legal}"]`).click();
    assert.equal(await page.locator('.cell.placing').count(), 1, 'one placement preview');
    assert.ok(await page.locator('.cell.flipping').count() > 0, 'captures are marked separately');
    assert.equal(await page.locator('.cell.placing .preview-mark').innerText(), '＋');
    assert.equal(await page.locator('.cell.flipping .preview-mark').first().innerText(), '↻');
    assert.equal(await page.locator('.cell.placing.flipping').count(), 0);
    await page.screenshot({ path: '.local-tools/jintori-move-preview.png' });
    assert.equal(await page.locator('#confirm-move').isDisabled(), false);
    assert.deepEqual((await stored()).active.match.cells, before.active.match.cells);
    await page.evaluate(() => window.say('もどす'));
    assert.equal(await page.locator('#confirm-move').isDisabled(), true);
    await page.locator(`[data-cell="${legal}"]`).click();
    await page.locator('#confirm-move').click();
    await page.waitForTimeout(1000);
    const after = await stored();
    assert.equal(after.active.match.moveNumber, 1);
    assert.deepEqual(after.active.inventoryBySide, before.active.inventoryBySide, 'cancelled special does not consume inventory');
    await page.reload();
    await page.getByRole('button', { name: 'ふたり', exact: true }).click();
    await page.getByRole('button', { name: 'つづきから', exact: true }).click();
    assert.equal((await stored()).active.match.moveNumber, 1);
    for (const [width, height] of [[320,568], [390,844], [768,1024]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('#confirm-move').evaluate(e => e.getBoundingClientRect().bottom <= innerHeight), true);
      await page.screenshot({ path: `.local-tools/jintori-game-${width}.png` });
    }
    await page.getByRole('button', { name: 'ゲームをおわる', exact: true }).click();
    await page.getByRole('button', { name: 'おわる', exact: true }).click();
    assert.equal((await stored()).active, null);
    assert.equal(await page.locator('#title').isVisible(), true, 'title returns after exit');
    assert.equal(await page.locator('#game').isVisible(), false, 'board hides after exit');
    assert.deepEqual(errors, []);
    console.log('jintori browser: color setup, preview/confirm, cancel, resume, responsive and exit passed');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
