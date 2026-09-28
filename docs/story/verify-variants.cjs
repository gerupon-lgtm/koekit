// 原作／別版の切替、読み上げ取消、旧モード維持を検証する。
const { chromium } = require(process.env.STORY_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.STORY_BASE || 'http://127.0.0.1:8124';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const c = await browser.newContext({ viewport: { width: 320, height: 568 }, serviceWorkers: 'block' });
    await c.route('**/src/speech/index.js', r => r.fulfill({ contentType: 'application/javascript', body:
      'export function createSpeechInput(){return {on(){},off(){},async start(){},stop(){},dispose(){}}}' }));
    await c.addInitScript(() => {
      window.spoken = [];
      let current;
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      Object.defineProperty(window, 'speechSynthesis', { value: {
        getVoices: () => [{ name: 'テスト', voiceURI: 'test', lang: 'ja-JP', localService: true }], addEventListener() {},
        speak(u) { current = u; window.spoken.push(u.text); u.onstart?.(); setTimeout(() => { if (u === current) { current = null; u.onend?.(); } }, 60); },
        cancel() { const old = current; current = null; old?.onend?.(); },
      } });
    });
    const p = await c.newPage(); p.setDefaultTimeout(15000);
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    const original = p.locator('[data-story-version="original"]');
    const coherent = p.locator('[data-story-version="coherent"]');
    const reveal = async () => {
      await p.locator('#go-name').click(); await p.locator('#name-omakase').click();
      for (let i = 0; i < 4; i++) await p.locator('#ok').click();
      await p.locator('#start').click();
    };
    await p.goto(base + '/story/'); await p.waitForFunction(() => window.__story && !document.getElementById('go-name').disabled);
    for (const audience of ['kids', 'adult']) {
      await p.locator(`[data-v="${audience}"]`).click(); await p.locator('[data-key="tts"] [data-v="off"]').click();
      await reveal();
      assert.equal(await original.getAttribute('aria-pressed'), 'true');
      const raw = await p.locator('#story').innerText();
      const materials = await p.locator('#picks').innerText();
      const cards = await p.locator('#board').innerHTML();
      for (const width of [320, 390, 768]) {
        await p.setViewportSize({ width, height: width === 320 ? 568 : 844 });
        await coherent.click();
        assert.equal(await coherent.getAttribute('aria-pressed'), 'true');
        assert.notEqual(await p.locator('#story').innerText(), raw);
        assert.equal(await p.locator('#picks').innerText(), materials);
        assert.equal(await p.locator('#board').innerHTML(), cards);
        const alt = await p.locator('#story').innerText();
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await original.click(); assert.equal(await p.locator('#story').innerText(), raw);
        await coherent.click(); assert.equal(await p.locator('#story').innerText(), alt);
        await original.click();
      }
      assert.equal(await p.evaluate(() => window.spoken.length), 0, 'TTS off remains silent');
      await p.locator('#end').click();
      await p.locator('[data-v="mechakucha"]').click(); await reveal();
      assert.equal(await p.locator('#story-switch').isVisible(), false);
      assert.equal(await p.locator('#story-version-label').isVisible(), false);
      await p.locator('#end').click(); await p.locator('[data-v="normal"]').click();
    }
    // 自動読み上げ予約前に切替し、原作の予約が後から割り込まない。
    await p.locator('[data-key="tts"] [data-v="on"]').click(); await reveal();
    await p.evaluate(() => { window.spoken = []; document.querySelector('[data-story-version="coherent"]').click(); });
    await p.waitForFunction(() => window.__story.voiceContext()?.type === 'after');
    const texts = await p.evaluate(() => window.spoken);
    assert.ok(texts.length > 4);
    assert.equal(texts[0], await p.locator('#intro').innerText());
    assert.ok(!texts.some(text => /^今回は/.test(text)), 'old auto reading canceled');
    await p.waitForFunction(() => Math.abs(document.documentElement.scrollHeight - innerHeight - scrollY) < 3);
    // 読み上げ途中に切替を連打しても、表示中の版の発話だけが続く。
    await p.evaluate(() => {
      document.querySelector('[data-story-version="original"]').click();
      document.querySelector('[data-story-version="coherent"]').click();
      window.spoken = [];
      document.querySelector('[data-story-version="original"]').click();
    });
    await p.waitForFunction(() => window.__story.voiceContext()?.type === 'after');
    assert.equal(await p.evaluate(() => window.spoken[0]), await p.locator('#intro').innerText());
    assert.equal(await original.getAttribute('aria-pressed'), 'true');
    // 別版の途中停止・ヘルプ・ホーム帰還。
    await p.evaluate(() => { document.querySelector('[data-story-version="coherent"]').click(); document.getElementById('help-open').click(); });
    let count = await p.evaluate(() => window.spoken.length); await p.waitForTimeout(1000);
    assert.equal(await p.evaluate(() => window.spoken.length), count);
    await p.locator('#help-close').click();
    await p.evaluate(() => { document.getElementById('read').click(); document.getElementById('stop').click(); });
    count = await p.evaluate(() => window.spoken.length); await p.waitForTimeout(250);
    assert.equal(await p.evaluate(() => window.spoken.length), count);
    await p.locator('#end').click(); await reveal();
    assert.equal(await original.getAttribute('aria-pressed'), 'true', 'new story starts with original');
    await p.locator('#end').click();
    // 実際のリロードを挟み、両対象の履歴が残ること・原作と別版が混ざらないことを確認。
    await p.locator('[data-key="tts"] [data-v="off"]').click();
    for (const audience of ['kids', 'adult']) {
      await p.locator(`[data-v="${audience}"]`).click();
      let previousType = null, previousIntro = null, previousCards = [];
      for (let i = 0; i < 8; i++) {
        await reveal();
        const raw = await p.locator('#story').innerText();
        const originalHistory = await p.evaluate(a => JSON.parse(localStorage.getItem('koekit.story.settings')).replay[a], audience);
        const boardIds = await p.evaluate(async () => {
          const { SETS } = await import('/story/story-data.js');
          const board = window.__story.st.board;
          return Object.fromEntries(Object.entries(board.rows).map(([k, items]) => [k, items.map(it => SETS[board.audience].rows[k].pool.indexOf(it))]));
        });
        for (const prior of previousCards) for (const [key, ids] of Object.entries(prior)) {
          assert.ok(ids.every(id => !boardIds[key].includes(id)), 'recent materials excluded even after reload');
        }
        previousCards = originalHistory.cards;
        assert.ok(previousCards.length > 0 && previousCards.length <= 2);
        assert.notEqual(originalHistory.type, previousType);
        previousType = originalHistory.type;
        await coherent.click();
        const intro = await p.locator('#intro').innerText();
        assert.notEqual(intro, previousIntro); previousIntro = intro;
        const saved = await p.evaluate(() => localStorage.getItem('koekit.story.settings'));
        const history = JSON.parse(saved).replay[audience];
        assert.deepEqual(history.original, originalHistory.original, 'alternate does not consume original history');
        assert.ok(history.alternate.length > 0 && history.alternate.length <= 240);
        await original.click(); assert.equal(await p.locator('#story').innerText(), raw);
        await coherent.click();
        assert.equal(await p.evaluate(() => localStorage.getItem('koekit.story.settings')), saved, 'cached switches do not record new history');
        await p.reload(); await p.waitForFunction(() => window.__story && !document.getElementById('go-name').disabled);
        assert.deepEqual(await p.evaluate(a => JSON.parse(localStorage.getItem('koekit.story.settings')).replay[a], audience), history);
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: two fixed variants, all materials/cards preserved, 320/390/768px, both audiences, chaotic mode unchanged, reading cancellation and completion');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
