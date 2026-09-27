// 案内の高さ、モード保持、紹介文の間と取消をブラウザで確認する。
const { chromium } = require(process.env.STORY_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.STORY_BASE || 'http://127.0.0.1:8124';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/src/speech/index.js', r => r.fulfill({ contentType: 'application/javascript', body:
      'export function createSpeechInput(){return {on(){},off(){},async start(){},stop(){},dispose(){}}}' }));
    await context.addInitScript(() => {
      window.readings = [];
      let current;
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      Object.defineProperty(window, 'speechSynthesis', { value: {
        getVoices: () => [{ name: 'テスト', voiceURI: 'test', lang: 'ja-JP', localService: true }],
        addEventListener() {},
        speak(u) {
          current = u;
          const entry = { text: u.text, start: performance.now() }; window.readings.push(entry);
          u.onstart?.(); setTimeout(() => { if (current === u) { current = null; entry.end = performance.now(); u.onend?.(); } }, 120);
        },
        cancel() { const old = current; current = null; old?.onend?.(); },
      } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const ready = () => page.waitForFunction(() => !!window.__story && !document.getElementById('go-name').disabled);
    await page.goto(base + '/story/'); await ready();
    assert.equal(await page.locator('[data-v="kids"]').getAttribute('aria-pressed'), 'true');
    for (const mode of ['adult', 'kids']) {
      await page.locator(`[data-v="${mode}"]`).click(); await page.reload(); await ready();
      assert.equal(await page.locator(`[data-v="${mode}"]`).getAttribute('aria-pressed'), 'true', 'saved mode');
    }
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024]]) {
      for (const mode of ['kids', 'adult']) {
        console.log('CHECK layout', width, mode);
        await page.setViewportSize({ width, height });
        await page.locator(`[data-v="${mode}"]`).click();
        await page.locator('[data-key="tts"] [data-v="on"]').click();
        await page.locator('#go-name').click(); await page.locator('#name-omakase').click();
        await page.evaluate(() => document.fonts.ready);
        const top = () => page.locator('#board-btns').evaluate(el => el.getBoundingClientRect().top + scrollY);
        const initial = await top();
        const stable = async () => assert.ok(Math.abs(await top() - initial) < 1, `buttons stable ${width} ${mode}`);
        await page.waitForFunction(() => window.__story.voiceContext()?.type === 'row'); await stable();
        await page.evaluate(() => window.__story.handleText('いち', window.__story.voiceContext())); await stable();
        await page.locator('.brow.active .cell').nth(1).click(); await stable();
        await page.locator('.brow.active .cell').nth(2).click(); await stable();
        await page.waitForFunction(() => window.__story.st.row === 1); await stable();
        await page.locator('#mic-state').click(); await stable();
        await page.locator('#mic-state').click();
        for (let i = 0; i < 3; i++) await page.locator('#ok').click();
        await page.waitForFunction(() => window.__story.voiceContext()?.type === 'ready'); await stable();
        assert.ok(await page.locator('#board-btns').evaluate(el => el.getBoundingClientRect().bottom + scrollY <= innerHeight), 'buttons fit');
        assert.equal(await page.locator('#guide-words').evaluate(el => getComputedStyle(el).fontSize), '15px');
        await page.locator('#start').click();
        assert.equal(await page.locator('.cell.open:not(.dim)').first().evaluate(el => getComputedStyle(el).opacity), '1');
        assert.equal(await page.locator('.cell.open.dim').first().evaluate(el => getComputedStyle(el).opacity), '0.35');
        await page.locator('#end').click();
      }
    }
    // 実際の読み上げ列で紹介文の終了から本文の開始までを計測。
    console.log('CHECK intro gap');
    await page.locator('#go-name').click(); await page.locator('#name-omakase').click();
    for (let i = 0; i < 4; i++) await page.locator('#ok').click();
    await page.evaluate(() => { window.readings = []; });
    await page.locator('#start').click();
    await page.waitForFunction(() => window.readings.some(r => r.text === window.__story.st.story.intro && r.end));
    assert.equal(await page.evaluate(() => window.__story.voiceContext()), null, 'mic stays paused during gap');
    await page.waitForFunction(() => {
      const i = window.readings.findIndex(r => r.text === window.__story.st.story.intro);
      return i >= 0 && window.readings.length > i + 1;
    });
    const gap = await page.evaluate(() => {
      const i = window.readings.findIndex(r => r.text === window.__story.st.story.intro);
      const intro = window.readings[i];
      const first = window.readings[i + 1];
      return first.start - intro.end;
    });
    assert.ok(gap >= 780 && gap < 1600, '800ms pause: ' + gap);
    await page.locator('#end').click();
    // 待機中の stop で次の発話を取り消す（ヘルプ・終了も同じ stop を使う）。
    const canceled = await page.evaluate(async () => {
      const { Reader } = await import('./tts.js'); const reader = new Reader();
      window.readings = [];
      const done = reader.speak([{ text: '紹介文', pauseAfter: 800 }, { text: '続き' }]);
      while (!reader.cancelPause) await new Promise(r => setTimeout(r, 10));
      reader.stop(); const result = await done;
      await new Promise(r => setTimeout(r, 850));
      return !result && !reader.busy && !window.readings.some(r => r.text === '続き');
    });
    assert.ok(canceled);
    console.log('PASS: kids default, saved modes, stable controls at 320/390/768px, clear revealed cards, intro gap ' + Math.round(gap) + 'ms, cancel during gap');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
