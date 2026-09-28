// 実ブラウザの乱数・本番と同じ抽選関数を監査する。統計値は診断用で、完全性の証明ではない。
// STORY_BASE / STORY_PLAYWRIGHT / STORY_AUDIT_OUTPUT を指定可能。統計の閾値で不定期失敗させない。
const { chromium } = require(process.env.STORY_PLAYWRIGHT || 'playwright');
const { writeFileSync } = require('node:fs');
const base = process.env.STORY_BASE || 'http://127.0.0.1:8124';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/src/speech/index.js', r => r.fulfill({ contentType: 'application/javascript', body:
      'export function createSpeechInput(){return {on(){},off(){},async start(){},stop(){},dispose(){}}}' }));
    await context.addInitScript(() => {
      if (!localStorage.getItem('koekit.story.settings')) localStorage.setItem('koekit.story.settings', JSON.stringify({ tts: 'off' }));
    });
    const page = await context.newPage();
    await page.goto(base + '/story/');
    await page.waitForFunction(() => window.__story && !document.querySelector('#go-name').disabled);
    const report = await page.evaluate(async () => {
      const { makeBoard, resolvePicks } = await import('/story/story.js');
      const { SETS, ROW_KEYS } = await import('/story/story-data.js');
      const check = (ok, why) => { if (!ok) throw new Error(why); };
      const distribution = counts => {
        const total = counts.reduce((a, b) => a + b, 0), expected = total / counts.length;
        return { counts, total, minPercent: 100 * Math.min(...counts) / total,
          maxPercent: 100 * Math.max(...counts) / total,
          chiSquare: counts.reduce((s, n) => s + (n - expected) ** 2 / expected, 0), df: counts.length - 1,
          maxAbsZ: Math.max(...counts.map(n => Math.abs(n - expected) / Math.sqrt(expected * (1 - 1 / counts.length)))) };
      };
      const sample = (random, n) => {
        const bins = Array(100).fill(0), pairs = Array(100).fill(0), low = Array(256).fill(0);
        let sum = 0, square = 0, cross = 0, prev, first, min = 1, max = 0, consecutiveEqual = 0, beyond32 = 0;
        for (let i = 0; i < n; i++) {
          const x = random(); check(Number.isFinite(x) && x >= 0 && x < 1, 'random range');
          bins[Math.floor(x * 100)]++; low[Math.floor(x * 2 ** 32) & 255]++;
          if (i) { cross += prev * x; pairs[Math.floor(prev * 10) * 10 + Math.floor(x * 10)]++; if (x === prev) consecutiveEqual++; }
          else first = x;
          if (!Number.isInteger(x * 2 ** 32)) beyond32++;
          sum += x; square += x * x; min = Math.min(min, x); max = Math.max(max, x); prev = x;
        }
        const m = n - 1, sx = sum - prev, sy = sum - first;
        return { n, mean: sum / n, variance: square / n - (sum / n) ** 2, min, max, consecutiveEqual, beyond32,
          lag1Correlation: (cross - sx * sy / m) / Math.sqrt((square - prev ** 2 - sx ** 2 / m) * (square - first ** 2 - sy ** 2 / m)),
          bins: distribution(bins), adjacentPairs: distribution(pairs), low8: distribution(low) };
      };
      const math = sample(Math.random, 1000000);
      // 非公開関数の本体を対象ファイルからそのまま読み、複製したアルゴリズムではなく実装を検査。
      const source = await (await fetch('/story/coherent-story.js')).text();
      const functionText = source.match(/function choicesFor\(input\) \{[\s\S]*?\n\}/)?.[0];
      check(functionText, 'choicesFor source not found');
      const choicesFor = new Function(functionText + '; return choicesFor;')();
      const indexed = new Proxy({ length: 2 ** 32 }, { get: (target, key) => key === 'length' ? target.length : Number(key) / 2 ** 32 });
      const choose = choicesFor({ audit: 'fixed-seed' });
      const alternate = sample(() => choose(indexed), 1000000);
      const firstBySeed = Array(20).fill(0), secondBySeed = Array(20).fill(0), seedPairs = Array(400).fill(0);
      const twenty = Array.from({ length: 20 }, (_, i) => i);
      for (let i = 0; i < 100000; i++) {
        const pick = choicesFor({ audit: i }), a = pick(twenty), b = pick(twenty);
        firstBySeed[a]++; secondBySeed[b]++; seedPairs[a * 20 + b]++;
      }
      alternate.seedSweep = { first: distribution(firstBySeed), second: distribution(secondBySeed), pairs: distribution(seedPairs) };
      const boards = {};
      for (const audience of ['kids', 'adult']) {
        const set = SETS[audience], n = 100000, rows = {};
        for (const key of ROW_KEYS) {
          const words = set.rows[key].pool.map(x => x.w);
          check(new Set(words).size === words.length, audience + '/' + key + ' duplicate pool');
          rows[key] = { words, selected: Array(words.length).fill(0), columns: Array(set.cols).fill(0),
            positions: Array.from({ length: set.cols }, () => Array(words.length).fill(0)), repeats: 0, previous: null };
        }
        for (let i = 0; i < n; i++) {
          const board = makeBoard(audience), picks = resolvePicks(board, {});
          for (const key of ROW_KEYS) {
            const row = rows[key], words = board.rows[key].map(x => x.w);
            check(new Set(words).size === set.cols, 'board duplicate');
            words.forEach((word, col) => row.positions[col][row.words.indexOf(word)]++);
            const word = picks[key].words[0];
            row.selected[row.words.indexOf(word)]++; row.columns[picks[key].idx[0]]++;
            if (word === row.previous) row.repeats++; row.previous = word;
          }
        }
        for (const key of ROW_KEYS) {
          const row = rows[key]; delete row.previous;
          row.selected = distribution(row.selected); row.columns = distribution(row.columns);
          row.positions = row.positions.map(distribution); row.repeatPercent = row.repeats / (n - 1) * 100;
        }
        const board = makeBoard(audience), manual = Object.fromEntries(ROW_KEYS.map(k => [k, [set.cols - 1, 0]]));
        const picks = resolvePicks(board, manual, () => { throw new Error('manual selection rerolled'); });
        for (const key of ROW_KEYS) check(JSON.stringify(picks[key].idx) === JSON.stringify(manual[key]), 'manual selection changed');
        for (const value of [0, 1 - Number.EPSILON]) {
          const edge = resolvePicks(board, {}, () => value);
          for (const key of ROW_KEYS) check(edge[key].idx[0] === (value ? set.cols - 1 : 0), 'edge column');
        }
        boards[audience] = { n, rows, manualAndEdges: 'passed' };
      }
      return { math, alternate, boards };
    });
    // 実際のボタンハンドラも通す（統計量の検査は上の100,000回の純粋関数で行う）。
    report.ui = {};
    for (const audience of ['kids', 'adult']) {
      await page.evaluate(a => localStorage.setItem('koekit.story.settings', JSON.stringify({ audience: a, tts: 'off' })), audience);
      await page.reload();
      await page.waitForFunction(() => window.__story && !document.querySelector('#go-name').disabled);
      report.ui[audience] = await page.evaluate(() => {
        const names = {}, columns = {}, boardKeys = new Set();
        let previous = [];
        for (let i = 0; i < 300; i++) {
          document.querySelector('#go-name').click(); document.querySelector('#name-omakase').click();
          const st = window.__story.st; names[st.name] = (names[st.name] || 0) + 1;
          for (const game of previous) for (const [key, words] of Object.entries(game)) {
            if (st.board.rows[key].some(item => words.includes(item.w))) throw new Error('recent material in board');
          }
          boardKeys.add(JSON.stringify(st.board.rows));
          for (let row = 0; row < 4; row++) document.querySelector(i % 2 ? '#ok' : '#omakase').click();
          document.querySelector('#start').click();
          for (const [key, pick] of Object.entries(st.picks)) {
            if (!pick.omakase || pick.words[0] !== st.board.rows[key][pick.idx[0]].w) throw new Error('UI pick mismatch');
            columns[key] ||= Array(st.board.cols).fill(0); columns[key][pick.idx[0]]++;
          }
          previous = [...previous, Object.fromEntries(Object.entries(st.picks).map(([key, pick]) => [key, pick.words]))].slice(-2);
        }
        return { n: 300, names, columns, uniqueBoards: boardKeys.size, recentMaterialsExcluded: true };
      });
    }
    Object.assign(report, { base, browser: browser.version(), date: new Date().toISOString() });
    if (process.env.STORY_AUDIT_OUTPUT) writeFileSync(process.env.STORY_AUDIT_OUTPUT, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ browser: report.browser,
      math: { mean: report.math.mean, variance: report.math.variance, correlation: report.math.lag1Correlation, maxZ: report.math.bins.maxAbsZ },
      alternate: { mean: report.alternate.mean, correlation: report.alternate.lag1Correlation, maxZ: report.alternate.bins.maxAbsZ,
        seedPairMaxZ: report.alternate.seedSweep.pairs.maxAbsZ },
      key: report.boards.adult.rows.mono, ui: report.ui }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
