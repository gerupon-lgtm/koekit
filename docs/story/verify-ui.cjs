// 本作だけのブラウザ検査。既存のPlaywrightを使用し、アプリに依存を追加しない。
// STORY_PLAYWRIGHT に既存の playwright モジュールの絶対パスを指定できる。
const { chromium } = require(process.env.STORY_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.STORY_BASE || 'http://127.0.0.1:8124';
const out = path.join(__dirname, 'previews');
fs.mkdirSync(out, { recursive: true });
const speech = `export function createSpeechInput(){const h={};return {on(k,f){h[k]=f},off(k){delete h[k]},async start(w){window.activeWords=w},stop(){window.activeWords=[]},dispose(){}}}`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.route('**/src/speech/index.js', r => r.fulfill({ contentType: 'application/javascript', body: speech }));
    await context.addInitScript(() => {
      window.spoken = [];
      window.mockVoiceList = [{ name: 'テストのこえ', voiceURI: 'test-ja', lang: 'ja-JP', localService: true }];
      let current;
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      Object.defineProperty(window, 'speechSynthesis', { value: localStorage.getItem('story-test-no-tts') ? null : {
        getVoices: () => window.mockVoiceList,
        addEventListener() {},
        speak(u) { current = u; window.spoken.push(u.text); u.onstart?.(); setTimeout(() => { if (current === u) { current = null; u.onend?.(); } }, 30); },
        cancel() { const old = current; current = null; old?.onend?.(); },
      } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const waitReady = () => page.waitForFunction(() => !!window.__story && !document.getElementById('go-name').disabled);
    const noOverflow = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label);
    const say = raw => page.evaluate(raw => { const s = window.__story; s.handleText(raw, s.voiceContext()); }, raw);
    await page.goto(base + '/story/'); await waitReady();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.getElementById('mic-state').dataset.micState === 'listening');
    assert.equal(await page.title(), 'モノガタリズム');
    assert.equal(await page.locator('#home-link').getAttribute('href'), '../');
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024]]) {
      await page.setViewportSize({ width, height }); await noOverflow('title ' + width);
      assert.ok(await page.locator('#go-name').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'start button fits ' + width);
      await page.screenshot({ path: path.join(out, `start-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#help-open').click();
    assert.equal(await page.evaluate(() => window.__story.voiceContext()), null);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.activeWords?.length > 0);
    await page.locator('#mic-state').click();
    assert.equal(await page.locator('#start-guide').getAttribute('data-input'), 'touch');
    assert.equal(await page.locator('#start-guide-words').innerText(), '');
    await page.locator('#go-name').click();
    await page.locator('#names button').first().click();
    await page.locator('#name-ok').click();
    await page.setViewportSize({ width: 320, height: 568 });
    await noOverflow('board 320');
    assert.ok(await page.locator('#ok').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'touch confirm fits 320');
    await page.screenshot({ path: path.join(out, 'board-320.png'), fullPage: true });
    await page.locator('.brow.active .cell').first().click();
    await page.locator('#help-open').click();
    await page.locator('#help-close').click();
    assert.equal(await page.evaluate(() => window.__story.st.sel.itsu.length), 1);
    await page.locator('#quit').click();
    await page.locator('#exit-continue').click();
    assert.equal(await page.evaluate(() => window.__story.st.sel.itsu.length), 1);
    for (let i = 0; i < 4; i++) await page.locator('#ok').click();
    assert.ok(await page.locator('#back').isVisible(), 'ready has touch back');
    await page.locator('#back').click();
    assert.equal(await page.evaluate(() => window.__story.st.done), false);
    await page.locator('#ok').click();
    await page.locator('#start').click();
    await page.locator('#help-open').click();
    const count = await page.evaluate(() => window.spoken.length);
    await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(() => window.spoken.length), count, 'no delayed reading behind help');
    await page.locator('#help-close').click();
    await page.waitForTimeout(2000);
    await noOverflow('story 320');
    assert.ok((await page.locator('#story li').count()) >= 4);
    await page.screenshot({ path: path.join(out, 'story-320.png'), fullPage: true });
    await page.locator('#again').click();
    assert.ok(await page.locator('#s-name').isVisible());
    await page.locator('#nav-back').click();
    assert.ok(await page.locator('#s-start').isVisible());
    // 声の導線、3枚選択の自動進行、終了確認からの復帰。
    await page.locator('#mic-state').click();
    await page.waitForFunction(() => document.getElementById('mic-state').dataset.micState === 'listening');
    await say('オッケー');
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.activeWords.length), 0, 'hidden page keeps microphone paused');
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => window.activeWords?.length > 0);
    await say('おまかせ');
    await page.waitForTimeout(100);
    await say('いち'); await say('に'); await say('さん');
    await page.locator('#quit').click();
    await page.waitForTimeout(850);
    assert.equal(await page.evaluate(() => window.__story.st.row), 0, 'modal pauses automatic advance');
    await page.locator('#exit-continue').click();
    await page.waitForFunction(() => window.__story.st.row === 1);
    await page.locator('#quit').click(); await page.locator('#exit-confirm').click();
    assert.ok(await page.locator('#s-start').isVisible());
    // おとな5列と小画面。めくった直後に終了しても読み上げが復活しない。
    await page.locator('[data-v="adult"]').click(); await page.locator('#go-name').click();
    await page.locator('#name-omakase').click();
    await noOverflow('adult board 320');
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.ok(await page.locator('#ok').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'voice confirm fits 320');
    await page.screenshot({ path: path.join(out, 'adult-board-320.png'), fullPage: true });
    for (let i = 0; i < 4; i++) await page.locator('#ok').click();
    await page.locator('#start').click(); await page.locator('#end').click();
    const endedCount = await page.evaluate(() => window.spoken.length);
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => window.spoken.length), endedCount, 'no reading after exit');
    assert.ok(await page.locator('#s-start').isVisible());
    assert.deepEqual(errors, []);
    // マイク拒否時もタッチ案内に切り替わり、読み上げ非対応でも最後まで遊べる。
    await page.route('**/src/speech/index.js', r => r.fulfill({ contentType: 'application/javascript', body: `export function createSpeechInput(){return {on(){},off(){},start(){return Promise.reject(new Error('denied'))},stop(){},dispose(){}}}` }));
    await page.evaluate(() => localStorage.setItem('story-test-no-tts', 'true'));
    await page.reload(); await waitReady();
    await page.waitForFunction(() => document.getElementById('mic-state').dataset.micState === 'denied');
    assert.equal(await page.locator('#start-guide').getAttribute('data-input'), 'touch');
    assert.equal(await page.locator('#start-guide-words').innerText(), '');
    assert.ok(await page.locator('#voice').isDisabled());
    await page.locator('#go-name').click(); await page.locator('#name-omakase').click();
    for (let i = 0; i < 4; i++) await page.locator('#ok').click();
    await page.locator('#start').click(); await page.waitForTimeout(1000);
    assert.ok((await page.locator('#story li').count()) >= 4);
    await page.locator('#end').click();
    assert.deepEqual(errors, []);
    // 実際に参照した既存ロゴと、新しいロゴのプレビュー。
    await page.setViewportSize({ width: 1020, height: 1320 });
    await page.setContent(`<body style="margin:0;background:#faf5ed;padding:32px;font:16px sans-serif;color:#493f36">${[
      ['ピタリズム', '/assets/brand/pitarhythm.svg'], ['メモリズム', '/assets/brand/memorhythm.svg'],
      ['イロドリズム', '/assets/brand/irodorhythm.svg'], ['ジントリズム', '/assets/brand/jintorhythm.svg'],
      ['サエズリズム', '/assets/brand/saezurhythm.svg'], ['モノガタリズム', '/story/assets/monogatarhythm.svg'],
    ].map(([title, src]) => `<section style="margin-bottom:24px"><p>${title}</p><img style="display:block;width:auto;height:155px;max-width:100%" src="${base}${src}"></section>`).join('')}</body>`);
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    await page.screenshot({ path: path.join(out, 'logo-comparison.png'), fullPage: true });
    await page.locator('img').last().screenshot({ path: path.join(out, 'monogatarhythm.png') });
    await page.setViewportSize({ width: 1020, height: 500 });
    await page.setContent(`<body style="margin:0;background:#faf5ed;padding:32px;font:16px sans-serif;color:#493f36">${[
      ['モノガタリズム', '/story/assets/monogatarhythm.svg'], ['カタリズム（比較案）', '/docs/story/previews/katarhythm.svg'],
    ].map(([title, src]) => `<section style="margin-bottom:28px"><p>${title}</p><img style="display:block;width:auto;height:155px;max-width:100%" src="${base}${src}"></section>`).join('')}</body>`);
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    await page.screenshot({ path: path.join(out, 'name-comparison.png'), fullPage: true });
    console.log('PASS: 320/390/768px, touch/voice navigation, help/exit, back before reveal, automatic advance, delayed reading cancellation, logo previews');
    await context.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
