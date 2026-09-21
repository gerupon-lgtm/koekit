const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.SEQUENCE_BASE || 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const scenario of ['slow', 'failure', 'leave']) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      let release, failed = scenario === 'failure';
      const gate = new Promise(resolve => { release = resolve; });
      await context.route('**/assets/animals/*.png', async route => {
        if (failed) return route.fulfill({ status: 503, body: 'unavailable' });
        if (scenario !== 'failure') await gate;
        return route.continue();
      });
      await context.route('**/src/speech/index.js', route => route.fulfill({ contentType: 'application/javascript', body:
        "export const METHODS={VOSK:'vosk'};export function createSpeechInput(){return {on(){},start(){window.listening=true},stop(){window.listening=false},dispose(){}}}" }));
      // Run real audio synthesis, recording each oscillator and the highlighted card.
      await context.addInitScript(() => {
        window.notes = [];
        const create = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function () {
          window.notes.push({ key: document.querySelector('#board .focus')?.dataset.key, listening: window.listening });
          return create.call(this);
        };
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/kioku/?mode=sequence');
      await page.locator('#start-play').click();
      await page.locator('#intro-go').click();
      if (scenario === 'failure') {
        await page.getByRole('button', { name: 'えを よみなおす' }).waitFor();
        assert.match(await page.locator('#sequence-status').innerText(), /よめません/);
        failed = false;
        await page.getByRole('button', { name: 'えを よみなおす' }).click();
      } else {
        try {
          assert.equal(await page.locator('#next-btn').isVisible() && await page.locator('#next-btn').isEnabled(), false,
            'images still loading: start must not be available with blank cards');
          if (scenario === 'leave') await page.locator('#to-title').click();
        } finally { release(); }
      }
      if (scenario === 'leave') {
        await page.waitForTimeout(500);
        assert.equal(await page.locator('#title').isVisible(), true);
        assert.equal(await page.locator('#game').isVisible(), false);
        assert.equal(await page.evaluate(() => window.listening), false);
      } else {
        await page.getByRole('button', { name: 'スタート', exact: true }).waitFor();
        assert.equal(await page.locator('#board img').evaluateAll(images => images.length === 9 && images.every(i => i.complete && i.naturalWidth > 0)), true);
        const before = await page.locator('#board').innerHTML();
        await page.getByRole('button', { name: 'スタート', exact: true }).click();
        await page.locator('#confirm-btn').waitFor();
        const notes = await page.evaluate(() => window.notes);
        assert.equal(notes.length, 2, 'one short sound per example step');
        assert.ok(notes.every(note => note.key && !note.listening), 'sound coincides with focus while recognition is stopped');
        assert.equal(await page.locator('#board').innerHTML(), before, 'starting never changes the image set');
        for (const note of notes) await page.locator(`[data-key="${note.key}"]`).click();
        await page.locator('#confirm-btn').click();
        await page.locator('#next-btn').waitFor();
        await page.locator('#next-btn').click();
        await page.getByRole('button', { name: 'スタート', exact: true }).waitFor();
        assert.equal(await page.locator('#board img').evaluateAll(images => images.length === 9 && images.every(i => i.complete && i.naturalWidth > 0)), true);
        await page.getByRole('button', { name: 'スタート', exact: true }).click();
        await page.locator('#to-title').click();
        const stopped = await page.evaluate(() => window.notes.length);
        await page.waitForTimeout(1400);
        assert.equal(await page.evaluate(() => window.notes.length), stopped, 'exit cancels later focus sounds');
      }
      assert.deepEqual(errors, []);
      console.log('PASS sequence images/audio: ' + scenario);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
