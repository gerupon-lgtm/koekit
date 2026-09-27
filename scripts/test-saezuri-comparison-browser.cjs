const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.SAEZURI_BASE || 'http://127.0.0.1:8000';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
    '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  ] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'], serviceWorkers: 'block' });
    // Exercise real capture/cleanup and the UI contract with deliberately different
    // analysis variants. The fake microphone is not a pitch-accuracy fixture.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async text => { window.copiedComparison = text; },
      } });
      const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async options => {
        const stream = await nativeGetUserMedia(options);
        window.comparisonTracks = stream.getTracks();
        return stream;
      };
      window.Worker = class {
        constructor(url) {
          if (!String(url).endsWith('/worker.js')) throw new Error('Unexpected worker fixture target');
          this.terminated = false;
        }
        postMessage(data) {
          window.comparisonCaptureMetadata = { samples: data.samples.length, options: data.options };
          const notes = [
            { id: 'current-0', startTick: 0, durationTick: 4, midi: 60, origin: 'detected', completedRanges: [] },
            { id: 'current-1', startTick: 8, durationTick: 4, midi: 64, origin: 'detected', completedRanges: [] },
          ];
          const analysisComparison = {
            input: 'same-pitch-frames', noteColumns: ['startTick', 'durationTick', 'midi'],
            variants: [
              { mode: 'current', noteMode: data.options.noteMode, smoothingMs: data.options.smoothingMs, empty: false, segmentCount: 2, notes: [[0, 4, 60], [8, 4, 64]], onsetCorrections: [], gapDecisions: [], quantizationAdjustments: [] },
              { mode: 'detail', noteMode: 'detail', smoothingMs: data.options.smoothingMs, empty: false, segmentCount: 3, notes: [[0, 2, 59], [2, 2, 60], [8, 4, 64]], onsetCorrections: [], gapDecisions: [], quantizationAdjustments: [] },
              { mode: 'unsmoothed', noteMode: 'detail', smoothingMs: 0, empty: false, segmentCount: 4, notes: [[0, 1, 59], [1, 1, 61], [2, 2, 60], [8, 4, 64]], onsetCorrections: [], gapDecisions: [], quantizationAdjustments: [] },
            ],
            pitchTrace: { columns: ['time', 'kind', 'midi', 'rms', 'confidence'], rows: '[0,"pitched",60.1,0.1,0.95]\n[0.02,"pitched",59.9,0.11,0.96]' },
          };
          const result = { sessionId: data.sessionId, sampleRate: data.sampleRate, samples: data.samples.length,
            notes, frames: [{ time: 0, kind: 'pitched', midi: 60.1, rms: .1, confidence: .95 }],
            empty: false, ratio: 1, unknownSeconds: 0, analysisMs: 1, analysisComparison,
            analysisDiagnostics: { shortWindowFrames: 0, gapDecisions: [], quantizationAdjustments: [] },
            acousticTiming: { status: 'off', reason: 'fixture' },
          };
          window.comparisonExpected = structuredClone(result);
          window.finishComparisonAnalysis = () => {
            if (!this.terminated) this.onmessage?.({ data: result });
          };
        }
        terminate() { this.terminated = true; }
      };
    });
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('data:')) external.push(request.url()); });
    await page.goto(base + '/probe/saezuri/');
    await page.locator('#score svg').first().waitFor();
    assert.equal(await page.locator('#comparison-settings').count(), 1, 'comparison settings button is missing');
    assert.ok((await page.locator('#analysis-comparison').innerText()).length > 0);
    const scoreRows = () => page.locator('#score [data-note-id]').evaluateAll(nodes => nodes.map(n => [n.dataset.noteId, n.dataset.startTick, n.dataset.midi]));
    const originalScore = await scoreRows();
    await page.locator('#analysis-options summary').click();
    await page.locator('#tempo').fill('180');
    await page.locator('#note-mode').selectOption('detail');
    await page.locator('#smoothing').selectOption('0');
    await page.locator('#gap').fill('0.3');
    await page.locator('#window-size').selectOption('1024');
    await page.locator('#boundary-mode').selectOption('window-start');
    await page.locator('#adaptive-window').uncheck();
    await page.locator('#timing-adjust').fill('80');
    await page.locator('#processing').check();
    for (const id of ['acoustic-sync', 'count-sound', 'record-count']) await page.locator('#' + id).uncheck();
    await page.locator('#ratio').fill('0.1');
    await page.locator('#rms').fill('0.02');
    await page.locator('#count-volume').selectOption('0.5');
    await page.locator('#comparison-settings').click();
    for (const [id, expected] of Object.entries({ tempo: 120, smoothing: 120, gap: .1, 'window-size': 4096, 'timing-adjust': 0, ratio: .5, rms: .008, 'count-volume': .5 })) {
      assert.equal(Number(await page.locator('#' + id).inputValue()), expected, id);
    }
    assert.equal(await page.locator('#note-mode').inputValue(), 'sustain');
    assert.equal(await page.locator('#boundary-mode').inputValue(), 'energy-gated');
    for (const id of ['adaptive-window', 'acoustic-sync', 'count-sound', 'record-count']) assert.equal(await page.locator('#' + id).isChecked(), true, id);
    assert.equal(await page.locator('#processing').isChecked(), false);
    assert.deepEqual(await scoreRows(), originalScore);

    await page.locator('#capture').click();
    assert.equal(await page.locator('#comparison-settings').isDisabled(), true);
    assert.equal(await page.locator('#analysis-comparison').innerText(), '今回の取り込みを待っています。');
    await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'recording', null, { timeout: 15000 });
    assert.equal(await page.locator('#comparison-settings').isDisabled(), true);
    await page.waitForFunction(() => !!window.finishComparisonAnalysis, null, { timeout: 20000 });
    assert.equal(await page.locator('#status').getAttribute('data-state'), 'analyzing');
    assert.equal(await page.locator('#comparison-settings').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.comparisonTracks.every(track => track.readyState === 'ended')), true);
    await page.evaluate(() => window.finishComparisonAnalysis());
    await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'idle');
    assert.equal(await page.locator('#comparison-settings').isEnabled(), true);
    assert.equal(await page.locator('#analysis-comparison').innerText(), '同じ入力の比較：現在の設定 2音 ／ 細かい変化 3音 ／ ならしなし 4音。比較結果と音程推移を記録に含めました。');

    const report = JSON.parse(await page.locator('#metrics').innerText());
    const expected = await page.evaluate(() => window.comparisonExpected);
    assert.equal(report.prototype, 'ML-T01-v13');
    assert.ok(report.capture.samples > 0);
    assert.deepEqual(report.capture.analysisComparison, expected.analysisComparison);
    assert.deepEqual(report.captureCandidate.notes, expected.notes);
    assert.deepEqual(report.capture.notes, expected.notes);
    assert.deepEqual(await scoreRows(), originalScore, 'comparison must not replace the main melody');
    assert.deepEqual(await page.locator('#capture-score [data-note-id]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.midi))), [60, 64]);
    await page.locator('#conditions').fill('Windows 比較記録のコピー確認');
    await page.locator('#copy-capture-report').click();
    const copied = JSON.parse(await page.evaluate(() => window.copiedComparison));
    assert.equal(copied.conditions, 'Windows 比較記録のコピー確認');
    assert.deepEqual(copied.capture.analysisComparison, expected.analysisComparison);
    const trace = copied.capture.analysisComparison.pitchTrace;
    assert.equal(trace.rows.split('\n').filter(Boolean).map(line => JSON.parse(line)).length, 2);
    assert.deepEqual(copied.captureCandidate.notes, expected.notes);
    await page.locator('#adopt').click();
    assert.deepEqual(await page.locator('#score [data-note-id]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.midi))), [60, 64], 'only the current candidate may be adopted');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(JSON.stringify({ result: 'PASS', base, realCapture: true, analysis: 'synthetic response contract; pitch accuracy is not tested', comparison: '3 variants, JSONL copied, current candidate retained', settings: 'preset and recording lock', externalRequests: external.length }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
