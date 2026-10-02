const { chromium } = require('../.local-tools/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.FM_BASE_URL || 'http://127.0.0.1:8018/probe/fm-polyphony/';
const output = path.resolve(__dirname, '../.local-tools/fmopelab-dx7ii-review-20261002/public-check');
fs.mkdirSync(output, { recursive: true });
(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true });
 const errors = [], failed = [];
 try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => {
   const error = request.failure()?.errorText;
   // The shared stop cancels WAV downloads that have not finished buffering.
   if (error === 'net::ERR_ABORTED' && /\/samples\/.*\.wav/.test(request.url())) return;
   failed.push({ url: request.url(), error });
  });
  page.on('response', response => { if(response.status() >= 400 && response.url().startsWith(base)) failed.push({url:response.url(),status:response.status()}); });
  await page.goto(base + '?testDuration=2');
  assert.equal(await page.evaluate(() => isSecureContext), true);
  await page.locator('#device').fill('PC Chrome automated verification; not a smartphone');
  const manifest = await page.evaluate(async () => (await fetch('./samples/index.json')).json());
  assert.deepEqual(manifest.notes, [48, 52, 55]); assert.equal(manifest.voices.length, 6);
  for (const width of [320, 390, 844]) {
   await page.setViewportSize({ width, height: 844 });
   await page.locator('#bass-samples').evaluate(element => element.open = true);
   const layout = await page.evaluate(() => {
    const stop = document.getElementById('stop').getBoundingClientRect();
    const boxes = [...document.querySelectorAll('#bass-buttons button')].map(element => element.getBoundingClientRect());
    const touching = boxes.some((a, index) => boxes.slice(index + 1).some(b => a.left < b.right + 7 && a.right + 7 > b.left && a.top < b.bottom + 7 && a.bottom + 7 > b.top));
    return { overflow: document.documentElement.scrollWidth > innerWidth, stopCenter: (stop.left + stop.right) / 2, viewportCenter: innerWidth / 2, touching };
   });
   assert.equal(layout.overflow, false); assert.equal(layout.touching, false); assert.ok(Math.abs(layout.stopCenter - layout.viewportCenter) <= 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const sampleRequests = [];
  page.on('request', request => { if (/\/samples\/.*\.wav/.test(request.url())) sampleRequests.push(request.url()); });
  for (const preset of manifest.voices) {
   await page.locator(`[data-bass="${preset.file}"]`).click();
   await page.waitForFunction(() => document.getElementById('status').textContent.includes('を鳴らしています。'));
   assert.equal(await page.locator('#stop').isEnabled(), true);
   await page.locator('#stop').click();
   await page.waitForFunction(() => document.getElementById('status').textContent === '停止しました。');
  }
  // Switching samples shares the same stop path; only the selected file keeps playing.
  await page.locator('[data-bass]').nth(0).click();
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('SmoohBassを鳴らしています'));
  await page.locator('[data-bass]').nth(1).click();
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('StringBassを鳴らしています'));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('画面が隠れた'));
  await page.evaluate(() => { delete document.hidden; });
  await page.locator('#bass-samples').evaluate(element => element.open = false);
  for (const mode of ['held', 'repeat']) {
   await page.locator('#mode').selectOption(mode); await page.locator('#measure').click();
   await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('測定完了'), null, { timeout: 90000 });
   assert.equal(await page.locator('#results tr').count(), 7);
   console.log(JSON.stringify({ cpuRows: 7, scenario: 'mixed', mode }));
  }
  for (const [scenario, mode, count] of [['mixed', 'held', 6], ['mixed', 'repeat', 6], ['single', 'held', 16]]) {
   await page.locator('#scenario').selectOption(scenario); await page.locator('#mode').selectOption(mode); await page.locator('#count').selectOption(String(count));
   await page.locator('#listen').click();
   await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('試聴が終わりました'), null, { timeout: 20000 });
   if(scenario === 'single') { assert.equal(await page.locator('#results tr').count(), 1); assert.match(await page.locator('#results').textContent(), /未測定/); }
   console.log(JSON.stringify({ live: { scenario, mode, count } }));
  }
  await page.locator('#listen').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('鳴らしています'));
  await page.locator('#stop').click();
  await page.waitForFunction(() => document.getElementById('stop').disabled);
  await page.locator('#measure').click(); await page.locator('#stop').click();
  await page.waitForTimeout(250); assert.equal(await page.locator('#measure').isEnabled(), true);
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export').click();
  const download = await downloadPromise;
  const label = base.startsWith('https:') ? 'published' : 'local';
  await download.saveAs(path.join(output, label + '-result.json'));
  const data = JSON.parse(fs.readFileSync(path.join(output, label + '-result.json')));
  assert.equal(data.rows.length, 14);
  for (const row of data.rows) assert.ok(row.peak > 1e-6 && row.peak < 1 && Number.isFinite(row.p95Ratio));
  const completed = data.live.filter(row => row.status === 'completed'); assert.equal(completed.length, 3);
  for (const row of completed) { assert.equal(row.renderedFrames, row.sampleRate * 2); assert.ok(row.signalFrames > 0 && row.peak < 1); assert.equal(row.heard, null); }
  assert.equal(data.live.filter(row => row.status === 'stopped').length, 1);
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  assert.ok(sampleRequests.length >= 6);
  const mainUrl = await page.locator('script[type=module]').getAttribute('src');
  const token = new URL(mainUrl, base).searchParams.get('v');
  if (token) for (const request of sampleRequests) assert.equal(new URL(request).searchParams.get('v'), token);
  await page.screenshot({ path: path.join(output, label + '-390.png'), fullPage: true });
  console.log(JSON.stringify({ base, desktopOnly: true, cpuRows: 14, liveCases: 3, wavCases: 6, sampleSwitchAndHiddenStop: true, manualStop: true, workerCancel: true, widths: [320, 390, 844], cacheToken: token, errors, failed }));
 } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
