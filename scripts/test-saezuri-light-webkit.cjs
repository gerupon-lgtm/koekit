const path = require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(__dirname, '../.local-tools/browsers');
const { webkit } = require('../.local-tools/node_modules/playwright'), assert = require('node:assert/strict');
const base = process.env.SAEZURI_BASE || 'http://127.0.0.1:8018';
(async () => {
 const browser = await webkit.launch({ headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/probe/light-sound/?testDuration=1');
  const supported = await page.evaluate(() => typeof AudioContext === 'function' && typeof OfflineAudioContext === 'function');
  if (!supported) { assert.deepEqual(errors, []); console.log('PARTIAL Windows WebKit: UI loads; Web Audio unavailable, audio untested'); return; }
  const pcm = await page.evaluate(async () => {
   const { createLightVoice } = await import('../saezuri/light-voice.js'); const results = [];
   for (const engine of ['light', 'simple']) for (const instrument of ['piano', 'wood', 'soft']) {
    const audio = new OfflineAudioContext(1, 48000, 48000), voice = createLightVoice(audio, audio.destination, { midi: 60, time: .1, duration: .25, engine, instrument });
    const data = (await audio.startRendering()).getChannelData(0), energy = (start, end) => data.slice(start * 48000, end * 48000).reduce((sum, v) => sum + v * v, 0);
    results.push({ engine, instrument, finite: data.every(Number.isFinite), head: energy(.11, .25), tail: energy(.4, .5), silence: energy(.8, 1), count: voice.oscillatorCount });
   } return results;
  });
  for (const row of pcm) { assert.ok(row.finite && row.head > 0 && row.tail > 0); assert.equal(row.silence, 0); assert.ok(row.count <= 2); }
  for (const engine of ['light', 'simple']) {
   await page.locator('#engine').selectOption(engine); await page.locator('#listen').click();
   await page.waitForFunction(() => !document.getElementById('heard').hidden); await page.locator('#clean').click();
   await page.goto(base + '/probe/saezuri/?sound=' + engine); await page.locator('#home-create').click(); await page.locator('#new-manual').click();
   const press = async () => { const rect = await page.locator('#piano-keys [data-midi="60"]').boundingBox(); await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height - 12); await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.up(); };
   await press(); assert.equal(await page.locator('#piano-keys [data-held]').count(), 0);
   await page.locator('#screen-settings').click(); await page.locator('#play-count').uncheck(); await page.locator('#settings-close').click();
   await page.locator('#tap-record').click(); await page.waitForFunction(() => document.querySelector('#keyboard-status').textContent.includes('録音中'));
   await press(); await page.locator('#stop').click(); await page.locator('#capture-edit-confirm').click(); await page.locator('#report').evaluate(n => n.click());
   const data = JSON.parse(await page.locator('#metrics').textContent()); assert.equal(data.captureCandidate.source, 'tap'); assert.equal(data.captureCandidate.notes[0].midi, 60);
   await page.goto(base + '/probe/light-sound/?testDuration=1');
  }
  assert.deepEqual(errors, []); console.log('PASS Windows WebKit: 6 native PCM cases/release, 2 engines live, practice + tap recording/OK; not iPhone performance');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
