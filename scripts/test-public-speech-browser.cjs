const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const game of ['doubutsu', 'kioku']) for (const method of ['webspeech', 'unknown', 'webspeech-local']) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(() => {
      localStorage.setItem('koekit.method', 'webspeech');
      window.remoteStarts = 0;
      // processLocally非対応のブラウザを再現。ネイティブ認識を開始しない。
      window.SpeechRecognition = class { start() { window.remoteStarts++; } };
    });
    // 実音声や大きなモデルを取得せず、取得失敗でもタッチが使えることを確認。
    await context.route('https://*.r2.dev/**', route => route.abort());
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (!['GET','HEAD'].includes(r.method())) writes.push(r.url()); });
    await page.goto(`http://127.0.0.1:8000/${game}/?method=${method}`);
    await page.locator('[data-level="1"]').click();
    await page.locator('#intro-go').click();
    assert.equal(await page.locator(game === 'doubutsu' ? '#spin-btn' : '#next-btn').isVisible(), true);
    await page.locator('#to-title').click();
    if (game === 'doubutsu') {
      await page.locator('#to-panel').click();
      assert.equal(await page.locator('input[value="webspeech"]').count(), 0);
      assert.equal(await page.locator(`input[value="${method === 'webspeech-local' ? method : 'vosk'}"]`).isChecked(), true);
    }
    assert.equal(await page.evaluate(() => window.remoteStarts), 0);
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    await context.close();
  }
  await browser.close(); console.log('public speech URL/storage/local fallback + touch: passed');
})().catch(e => { console.error(e); process.exit(1); });
