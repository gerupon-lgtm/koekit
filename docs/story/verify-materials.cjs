// 長い追加候補を番号で選んだ状態にし、両版の本文と小画面のカード内表示を確認。
const { chromium } = require(process.env.STORY_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.STORY_BASE || 'http://127.0.0.1:8124';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const audience of ['kids', 'adult']) for (const width of [320, 390, 768]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      await context.route('**/src/speech/index.js', r => r.fulfill({ contentType: 'application/javascript', body:
        'export function createSpeechInput(){return {on(){},off(){},async start(){},stop(){},dispose(){}}}' }));
      await context.addInitScript(a => localStorage.setItem('koekit.story.settings', JSON.stringify({ audience: a, tts: 'off' })), audience);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/story/');
      await page.waitForFunction(() => window.__story && !document.querySelector('#go-name').disabled);
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: '.cell {animation:none!important}' });
      const result = await page.evaluate(async () => {
        const { SETS } = await import('/story/story-data.js');
        const issues = [], seen = new Set();
        for (let i = 0; i < 12; i++) {
          document.querySelector('#go-name').click(); document.querySelector('#name-omakase').click();
          const st = window.__story.st, set = SETS[st.board.audience];
          // 抽選は既存テストで検査。ここでは全追加候補を確実に表示し、最後は最長の候補にする。
          st.board.rows.aite[0] = set.rows.aite.pool[16 + (i === 11 ? 6 : i)];
          st.board.rows.mono[0] = set.rows.mono.pool[14 + (i === 11 ? 8 : i % 9)];
          for (const key of ['itsu', 'basho', 'aite', 'mono']) st.sel[key] = [0];
          for (let row = 0; row < 4; row++) document.querySelector('#ok').click();
          document.querySelector('#start').click();
          for (const cell of document.querySelectorAll('.cell.open:not(.dim)')) {
            const word = cell.querySelector('.word'), a = word.getBoundingClientRect(), b = cell.getBoundingClientRect();
            if (a.left < b.left - 1 || a.right > b.right + 1 || a.bottom > b.bottom + 1 || a.top < b.top - 1) issues.push(word.textContent);
          }
          const checkStory = version => {
            if (document.documentElement.scrollWidth > innerWidth) issues.push(version + ' page overflow');
            for (const key of ['aite', 'mono']) {
              const word = st.picks[key].words[0]; seen.add(word);
              if (!st.story.lines.some(line => line.text.includes(word))) issues.push(version + ' missing ' + word);
            }
          };
          checkStory('original');
          document.querySelector('[data-story-version="coherent"]').click();
          checkStory('alternate');
        }
        return { issues, seen: seen.size };
      });
      assert.deepEqual(result.issues, []); assert.equal(result.seen, 20); assert.deepEqual(errors, []);
      if (width === 320 && !process.env.STORY_BASE) await page.screenshot({ path: `docs/story/previews/personal-materials-${audience}-320.png`, fullPage: true });
      console.log('PASS', audience, width, 'all 20 additions, both variants, card bounds');
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
