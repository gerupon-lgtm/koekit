const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.SAEZURI_BASE || 'http://127.0.0.1:8018';
(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
 try {
  for (const engine of ['light', 'simple']) {
   const context = await browser.newContext({ permissions: ['microphone'], serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
   const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
   await page.addInitScript(() => {
    window.synthNodes = []; window.micRequests = 0;
    const make = AudioContext.prototype.createOscillator, get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (...a) => { window.micRequests++; return get(...a); };
    AudioContext.prototype.createOscillator = function () { const osc = make.call(this), row = { ended: false }; window.synthNodes.push(row); osc.addEventListener('ended', () => row.ended = true); return osc; };
   });
   await page.goto(base + '/probe/saezuri/?sound=' + engine); await page.locator('#home-create').click(); await page.locator('#new-manual').click();
   const report = async () => { await page.locator('#report').evaluate(n => n.click()); return JSON.parse(await page.locator('#metrics').textContent()); };
   const press = async midi => { const box = await page.locator(`#piano-keys [data-midi="${midi}"]`).boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12); await page.mouse.down(); };
   const before = await report();
   await press(60); await page.waitForTimeout(150); assert.equal(await page.evaluate(() => synthNodes.filter(n => !n.ended).length), engine === 'light' ? 2 : 1);
   await page.mouse.up(); await page.waitForTimeout(550); assert.equal(await page.evaluate(() => synthNodes.filter(n => !n.ended).length), 0);
   const after = await report(); assert.deepEqual(after.captureEditing, before.captureEditing); assert.equal(await page.evaluate(() => micRequests), 0);
   await page.locator('#screen-settings').click(); await page.locator('#tempo').fill('180'); await page.locator('#tempo').dispatchEvent('change'); await page.locator('#play-count').uncheck(); await page.locator('#settings-close').click();
   await page.locator('#tap-record').click(); await page.waitForFunction(() => document.querySelector('#keyboard-status').textContent.includes('録音中'));
   await press(60); await page.waitForTimeout(400); await page.mouse.up(); await page.locator('#stop').click();
   await page.waitForTimeout(100); assert.equal(await page.evaluate(() => synthNodes.filter(n => !n.ended).length), 0, 'stop cancels keyboard release tails');
   let data = await report(); assert.equal(data.captureEditing.pending, true); assert.ok(data.captureEditing.editCandidate.notes.some(n => n.midi === 60)); assert.equal(data.playback.engine, engine);
   await page.locator('#capture-edit-confirm').click(); await page.waitForFunction(() => document.querySelector('#song-status').dataset.saved === 'true');
   const saved = (await report()).captureCandidate; await page.reload(); await page.locator('#home-songs').click(); await page.locator('[data-song-open]').first().click();
   if (await page.locator('#song-continue').isVisible()) await page.locator('#song-continue').click(); assert.deepEqual((await report()).captureCandidate.notes, saved.notes);
   // Enable a real accompaniment and preserve it through loop/tap/humming paths.
   await page.locator('#keyboard-more>summary').click(); await page.locator('#image-settings-open').click(); await page.locator('#image-enabled').check(); await page.locator('#backing-settings-close').click(); await page.locator('#capture-edit-confirm').click();
   await page.locator('#mic').click(); await page.locator('#backing-loop').click(); await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'playing');
   await page.waitForTimeout(1300); await press(64); await page.waitForTimeout(180); await page.mouse.up();
   await page.waitForTimeout(800); assert.equal(await page.locator('#status').getAttribute('data-state'), 'playing');
   await page.locator('#stop').click(); await page.waitForTimeout(120); assert.equal(await page.evaluate(() => synthNodes.filter(n => !n.ended).length), 0);
   data = await report(); assert.equal(data.playback.engine, engine); assert.ok(data.playback.accompanimentEvents > 0); assert.ok(data.playback.lightVoices.maxActive > 0);
   await page.locator('#mic').click(); await page.locator('#loop-record').click(); await page.waitForFunction(() => ['count-in', 'recording'].includes(document.querySelector('#status').dataset.state));
   assert.equal(await page.locator('#piano-keys').isVisible(), false); await page.locator('#stop').click(); assert.equal(await page.locator('#piano-keys').isVisible(), true);
   await press(60); await page.waitForTimeout(100); await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
   await page.mouse.up(); await page.waitForTimeout(100); assert.equal(await page.evaluate(() => synthNodes.filter(n => !n.ended).length), 0);
   assert.deepEqual(errors, []); await context.close();
   console.log(`PASS ${engine} app: practice, zero mic in tap mode, recording/OK/save/reload, backing loop + held key, humming standby, immediate stop and hidden cleanup`);
  }
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
