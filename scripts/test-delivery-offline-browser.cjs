const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const base = process.env.DELIVERY_BASE || 'http://127.0.0.1:8000';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(root, '.local-tools', 'browsers');
const { chromium, webkit } = require('../.local-tools/node_modules/playwright');

// Read the native module graph, including worker/worklet URLs, without importing it in Node.
function requiredPaths() {
  const pending = fs.readdirSync(path.join(root, 'delivery')).filter(file => /\.(js|css|html)$/.test(file)).map(file => '/delivery/' + file);
  pending.push('/assets/brand/deliverhythm.svg', ...['empty', 'one', 'two'].map(state => `/assets/delivery/robot-${state}.webp`), ...['package', 'destination', 'obstacle'].map(piece => `/assets/delivery/${piece}.svg`));
  const found = new Set();
  while (pending.length) {
    const item = pending.pop(); if (found.has(item)) continue;
    found.add(item);
    const file = path.join(root, item.slice(1));
    assert.ok(fs.existsSync(file), `Referenced local file exists: ${item}`);
    if (!/\.(js|css|html)$/.test(item)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const patterns = [/\b(?:from\s*|import\s*)['"]([^'"]+)['"]/g, /new URL\(\s*['"]([^'"]+)['"]/g, /(?:src|href)=["']([^"']+)["']/g, /url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g];
    for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
      const target = match[1];
      if (!target.startsWith('.') || target.endsWith('/')) continue;
      const resolved = new URL(target, 'http://local' + item).pathname;
      // The browser stores the installed SW itself; it is not an app-cache asset.
      if (resolved !== '/sw.js') pending.push(resolved);
    }
  }
  return [...found].sort();
}
async function finishBasicTutorial(page) {
  await page.waitForFunction(() => document.querySelectorAll('#level-list button').length === 4);
  await page.locator('#new').click();
  await page.locator('#game').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#stage-label').textContent === 'れんしゅう');
  for (const [direction, count] of [['down', '1'], ['right', '2'], ['down', '1']]) {
    await page.locator(`[data-direction="${direction}"]`).click();
    await page.locator('#step-count').selectOption(count);
    await page.locator('#add-command').click();
  }
  assert.equal(await page.locator('#sequence button').count(), 3);
  await page.locator('#execute').click();
  await page.locator('#result').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#result-heading').textContent(), 'できた！');
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('koekit.delivery.v1.progress')));
  assert.equal(progress.value.tutorialCompletion.basic, true);
  assert.deepEqual(progress.value.easy.clearedLevelIds, []);
  assert.deepEqual(progress.value.hard.clearedLevelIds, []);
}
function monitor(context) {
  const writes = [], model = [], errors = [];
  context.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push({ method: request.method(), url: request.url() });
    if (/model\.tar\.gz/.test(request.url())) model.push(request.url());
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  return { writes, model, errors };
}
(async () => {
  const defects = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const observed = monitor(context);
    await context.addInitScript(() => { try { localStorage.setItem('koekit.microphone.enabled', 'false'); } catch {} });
    const page = await context.newPage();
    await page.goto(base + '/delivery/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const paths = requiredPaths();
    // No explicit fetch of modules or images before this assertion: SW installation must cache them.
    const missing = await page.evaluate(async paths => {
      const results = await Promise.all(paths.map(async item => [item, !!await caches.match(item)]));
      return results.filter(([, cached]) => !cached).map(([item]) => item);
    }, paths);
    assert.deepEqual(missing, [], 'SW precaches Delivery and its shared import graph');
    const sprites = await page.evaluate(async () => {
      return Promise.all(['empty', 'one', 'two'].map(async state => {
        const image = new Image(); image.src = `/assets/delivery/robot-${state}.webp`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, 256, 256).data;
        let transparent = 0, solid = 0;
        for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) transparent++; if (data[i] > 128) solid++; }
        return { state, width: image.naturalWidth, height: image.naturalHeight, transparent, solid };
      }));
    });
    for (const sprite of sprites) { assert.equal(sprite.width, 256); assert.equal(sprite.height, 256); assert.ok(sprite.transparent > 0 && sprite.solid > 0); }
    await context.setOffline(true);
    await page.reload();
    await page.locator('#new').waitFor({ state: 'visible' });
    await finishBasicTutorial(page);
    assert.deepEqual(observed.model, [], 'Mic OFF never primes/downloads the speech model');
    assert.deepEqual(observed.writes, [], 'No audio or other POST/PUT requests');
    assert.deepEqual(observed.errors, []);
    console.log(`PASS: SW precache ${paths.length} files; three 256px alpha sprites; offline reload + touch tutorial, microphone OFF (voice offline unverified)`);
    await context.close();

    // Keep the real Vosk adapter/library. Block actual model acquisition at the network boundary.
    const failure = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const failed = monitor(failure);
    await failure.addInitScript(() => { try { localStorage.setItem('koekit.microphone.enabled', 'true'); } catch {} });
    await failure.route('**/model.tar.gz*', route => route.abort('failed'));
    const failurePage = await failure.newPage();
    await failurePage.goto(base + '/delivery/');
    await failurePage.waitForFunction(() => document.querySelectorAll('#level-list button').length === 4);
    await failurePage.locator('#new').click();
    await failurePage.locator('#game').waitFor({ state: 'visible' });
    assert.equal(await failurePage.locator('#mic-state').getAttribute('data-mic-state'), 'restarting', 'Model startup is loading, not falsely listening');
    let failureNotice = false;
    try { await failurePage.locator('#mic-notice').waitFor({ state: 'visible', timeout: 70000 }); failureNotice = true; }
    catch (error) {
      console.error('Real model failure diagnostics:', JSON.stringify({ modelRequests: failed.model, pageErrors: failed.errors, mic: await failurePage.locator('#mic-state').getAttribute('aria-label') }));
      defects.push('Real Vosk model fetch failure does not leave startup or display touch fallback within 70 seconds');
    }
    assert.ok(failed.model.length > 0, 'The real model acquisition was attempted and intercepted');
    if (failureNotice) assert.match(await failurePage.locator('#mic-state').getAttribute('aria-label'), /タッチ|利用でき|使え|オフ/);
    // Return to title through the actual termination confirmation, then touch-start anew.
    await failurePage.locator('#quit').click();
    await failurePage.locator('#dialog-actions').getByRole('button', { name: 'おわる', exact: true }).click();
    await failurePage.locator('#title').waitFor({ state: 'visible' });
    await finishBasicTutorial(failurePage);
    assert.deepEqual(failed.writes, [], 'Model failure causes no external audio POST');
    assert.deepEqual(failed.errors, []);
    console.log(`PASS: touch tutorial completion after real Vosk model-load network failure; no network writes; failure notice=${failureNotice}`);
    await failure.close();
  } finally { await browser.close(); }

  const installedWebkit = fs.existsSync(webkit.executablePath());
  if (installedWebkit) {
    const browser = await webkit.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      const observed = monitor(context);
      await context.addInitScript(() => { try { localStorage.setItem('koekit.microphone.enabled', 'false'); } catch {} });
      const page = await context.newPage(); await page.goto(base + '/delivery/'); await finishBasicTutorial(page);
      assert.deepEqual(observed.errors, []); assert.deepEqual(observed.writes, []); assert.deepEqual(observed.model, []);
      console.log('PASS: installed WebKit touch tutorial smoke, microphone OFF (not device Safari acceptance)');
      await context.close();
    } finally { await browser.close(); }
  } else console.log('SKIP: WebKit binary is not installed; no download attempted');
  assert.deepEqual(defects, [], 'Real model failure must announce touch fallback');
})().catch(error => { console.error(error); process.exitCode = 1; });
