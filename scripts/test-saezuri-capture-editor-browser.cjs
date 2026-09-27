const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.SAEZURI_BASE || 'http://127.0.0.1:8000';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
    '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  ] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'], serviceWorkers: 'block' });
    await context.addInitScript(() => {
      const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.editorMediaRequests = 0;
      navigator.mediaDevices.getUserMedia = async options => {
        window.editorMediaRequests++;
        const stream = await nativeGetUserMedia(options);
        window.editorTracks = stream.getTracks();
        return stream;
      };
      // Real capture/cleanup precedes this deterministic pitch-frame fixture.
      // The real analysis functions build the baseline and comparison variants;
      // fake microphone noise is not used to judge pitch accuracy.
      window.Worker = class {
        constructor(url) { this.url = String(url); this.terminated = false; }
        async postMessage(data) {
          try {
            const { analyzeFrames, quantizeSegments } = await import(new URL('./analyzer.js', this.url).href);
            const { buildAnalysisComparison } = await import(new URL('./analysis-comparison.js', this.url).href);
            const endSeconds = 16 * 60 / data.tempo;
            const frames = Array.from({ length: Math.ceil(endSeconds * 100) }, (_, i) => {
              const time = i / 100;
              const midi = time >= .5 && time < 1.5 ? 60 : time >= 2 && time < 2.5 ? 64 : time >= 2.5 && time < 3 ? 65 : null;
              return { time, kind: midi === null ? 'silence' : 'pitched', ...(midi === null ? {} : { midi }), rms: midi === null ? 0 : .1, timingRms: midi === null ? 0 : .1, confidence: midi === null ? 0 : .99, ...(i === 100 ? { breakBefore: true } : {}) };
            });
            const options = { ...data.options, tempo: data.tempo, endSeconds };
            const result = analyzeFrames(frames, options), quantizationAdjustments = [];
            const notes = quantizeSegments(result.segments, data.tempo, 64, quantizationAdjustments);
            const analysisComparison = buildAnalysisComparison(frames, options, { result, notes, quantizationAdjustments });
            const output = { sessionId: data.sessionId, sampleRate: data.sampleRate, samples: data.samples.length, notes, frames,
              unquantizedNotes: result.segments, empty: false, ratio: result.ratio, unknownSeconds: result.unknownSeconds, analysisMs: 1,
              onsetCorrections: result.onsetCorrections, analysisComparison,
              analysisDiagnostics: { shortWindowFrames: 0, gapDecisions: result.gapDecisions, quantizationAdjustments },
              acousticTiming: { status: 'off', reason: 'fixture' },
            };
            window.editorExpected = structuredClone(output);
            if (!this.terminated) this.onmessage?.({ data: output });
          } catch (error) { this.onerror?.(error); throw error; }
        }
        terminate() { this.terminated = true; }
      };
    });
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('data:')) external.push(request.url()); });
    await page.goto(base + '/probe/saezuri/');
    await page.locator('#score svg').first().waitFor();
    const score = selector => page.locator(`${selector} [data-note-id]`).evaluateAll(nodes => nodes.map(n => [n.dataset.noteId, Number(n.dataset.startTick), Number(n.dataset.midi)]));
    const mainBefore = await score('#score');
    const report = async () => {
      await page.locator('#report').click();
      return JSON.parse(await page.locator('#metrics').innerText());
    };
    const rows = notes => notes.map(n => [n.startTick, n.durationTick, n.midi]);
    await page.locator('#comparison-settings').click();
    await page.locator('#acoustic-sync').uncheck();
    await page.locator('#capture').click();
    await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'recording', null, { timeout: 15000 });
    await page.waitForFunction(() => !!window.editorExpected && document.querySelector('#status').dataset.state === 'idle', null, { timeout: 20000 });
    assert.equal(await page.locator('#capture-variant').count(), 1, 'capture editor variant selector missing');
    const expected = await page.evaluate(() => window.editorExpected);
    assert.deepEqual(rows(expected.notes), [[4, 4, 60], [8, 4, 60], [16, 4, 64], [20, 4, 65]]);
    assert.equal((await report()).prototype, 'ML-T01-v13');
    assert.equal(await page.evaluate(() => window.editorTracks.every(track => track.readyState === 'ended')), true);
    for (const mode of ['detail', 'unsmoothed', 'current']) {
      await page.locator('#capture-variant').selectOption(mode);
      const value = await report();
      assert.deepEqual(rows(value.captureCandidate.notes), expected.analysisComparison.variants.find(v => v.mode === mode).notes, mode);
      assert.deepEqual(value.capture.notes, expected.notes, 'variant selection must preserve the original capture');
      assert.deepEqual(await score('#score'), mainBefore);
    }
    assert.equal(await page.evaluate(() => window.editorMediaRequests), 1, 'variant selection must not request another microphone');
    const baseline = (await report()).captureCandidate.notes;
    const firstId = baseline[0].id, secondId = baseline[1].id, thirdId = baseline[2].id;
    await page.locator('#align-start').click();
    assert.equal((await report()).captureCandidate.notes[0].startTick, 0);
    await page.locator('#capture-variant').selectOption('detail');
    assert.equal((await report()).captureCandidate.notes[0].startTick, 4);
    await page.locator('#capture-variant').selectOption('current');
    assert.equal((await report()).captureCandidate.notes[0].startTick, 0, 'alignment stays with its source');
    await page.locator('#align-start').click();
    assert.deepEqual(rows((await report()).captureCandidate.notes), rows(baseline));
    await page.locator('#capture-note').selectOption(firstId);
    assert.deepEqual(await page.locator('#capture-score [data-editor-selected="true"]').evaluateAll(nodes => [...new Set(nodes.map(n => n.dataset.noteId))]), [firstId]);
    await page.locator('#capture-octave-up').click();
    assert.deepEqual(await page.locator('#capture-score [data-editor-selected="true"]').evaluateAll(nodes => [...new Set(nodes.map(n => n.dataset.noteId))]), [firstId], 'selection survives staff redraw');
    await page.locator('#capture-octave-original').click();
    assert.equal(Number(await page.locator('#capture-edit-start').inputValue()), 5, 'input positions are one-based');
    assert.equal(Number(await page.locator('#capture-edit-length').inputValue()), 4);
    await page.locator('#capture-edit-midi').fill('72');
    await page.locator('#capture-edit-replace').click();
    assert.equal(await page.locator('#capture-edit-confirm').isEnabled(), true);
    assert.equal(await page.locator('#adopt').isDisabled(), true);
    assert.equal(await page.locator('#align-start').isDisabled(), true);
    assert.equal((await score('#capture-score'))[0][2], 72);
    assert.deepEqual((await report()).capture.notes, expected.notes);
    await page.locator('#preview').click();
    await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'playing');
    assert.equal(await page.locator('#capture-edit-confirm').isDisabled(), true);
    await page.locator('#stop').click();
    assert.equal(await page.locator('#capture-edit-confirm').isEnabled(), true);
    await page.locator('#capture-edit-cancel').click();
    assert.deepEqual(rows((await report()).captureCandidate.notes), rows(baseline));
    assert.equal((await score('#capture-score'))[0][2], 60);

    await page.locator('#capture-note').selectOption(firstId);
    await page.locator('#capture-edit-midi').fill('72');
    await page.locator('#capture-edit-replace').click();
    await page.locator('#capture-edit-confirm').click();
    const replaced = (await report()).captureCandidate.notes;
    assert.deepEqual(rows(replaced), [[4, 4, 72], [8, 4, 60], [16, 4, 64], [20, 4, 65]]);
    assert.deepEqual(await score('#score'), mainBefore);

    await page.locator('#capture-variant').selectOption('detail');
    assert.deepEqual(rows((await report()).captureCandidate.notes), expected.analysisComparison.variants.find(v => v.mode === 'detail').notes);
    await page.locator('#capture-edit-midi').fill('66');
    await page.locator('#capture-edit-replace').click();
    await page.locator('#capture-edit-confirm').click();
    const editedDetail = rows((await report()).captureCandidate.notes);
    assert.equal(editedDetail[0][2], 66);
    await page.locator('#capture-variant').selectOption('current');
    assert.deepEqual(rows((await report()).captureCandidate.notes), rows(replaced));
    await page.locator('#capture-variant').selectOption('detail');
    assert.deepEqual(rows((await report()).captureCandidate.notes), editedDetail, 'each source retains its own edits');
    await page.locator('#capture-edit-undo').click();
    assert.deepEqual(rows((await report()).captureCandidate.notes), expected.analysisComparison.variants.find(v => v.mode === 'detail').notes);
    await page.locator('#capture-variant').selectOption('current');
    assert.deepEqual(rows((await report()).captureCandidate.notes), rows(replaced), 'undo in another source must not affect current');

    // Dropdowns are the primary touch path. Staff selection is an additional path.
    await page.locator('#capture-note').selectOption(firstId);
    await page.locator('#capture-split-at').fill('2');
    await page.locator('#capture-edit-split').click();
    await page.locator('#capture-edit-confirm').click();
    const split = (await report()).captureCandidate.notes;
    assert.deepEqual(rows(split).slice(0, 2), [[4, 2, 72], [6, 2, 72]]);
    await page.locator('#capture-note').selectOption(split[0].id);
    await page.locator('#capture-edit-merge').click();
    await page.locator('#capture-edit-confirm').click();
    assert.deepEqual(rows((await report()).captureCandidate.notes), rows(replaced));

    await page.locator('#capture-note').selectOption(thirdId);
    await page.locator('#capture-edit-delete').click();
    await page.locator('#capture-edit-confirm').click();
    assert.equal((await report()).captureCandidate.notes.some(n => n.id === thirdId), false);
    await page.locator('#capture-edit-undo').click();
    assert.deepEqual(rows((await report()).captureCandidate.notes), rows(replaced));

    const invalidProposal = async operation => {
      const before = await score('#capture-score');
      await operation();
      assert.equal(await page.locator('#capture-edit-confirm').isDisabled(), true);
      assert.ok((await page.locator('#capture-edit-status').innerText()).length > 0);
      assert.deepEqual(await score('#capture-score'), before);
      assert.deepEqual(rows((await report()).captureCandidate.notes), rows(replaced));
    };
    await page.locator('#capture-note').selectOption(replaced[0].id);
    await invalidProposal(async () => {
      await page.locator('#capture-edit-start').fill('9');
      await page.locator('#capture-edit-length').fill('4');
      await page.locator('#capture-edit-replace').click();
    });
    await invalidProposal(async () => {
      await page.locator('#capture-edit-start').fill('64');
      await page.locator('#capture-edit-replace').click();
    });
    await page.locator('#capture-note').selectOption(secondId);
    await invalidProposal(() => page.locator('#capture-edit-merge').click());

    await page.locator(`#capture-score [data-note-id="${thirdId}"] ellipse`).first().click();
    assert.equal(await page.locator('#capture-note').inputValue(), thirdId);
    assert.equal(Number(await page.locator('#capture-edit-start').inputValue()), 17);
    assert.deepEqual(await page.locator('#capture-score [data-editor-selected="true"]').evaluateAll(nodes => [...new Set(nodes.map(n => n.dataset.noteId))]), [thirdId]);
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}x${height}`);
    }
    const finalReport = await report();
    assert.deepEqual(finalReport.capture.notes, expected.notes);
    assert.deepEqual(finalReport.capture.analysisComparison, expected.analysisComparison);
    await page.locator('#adopt').click();
    const adopted = await score('#score');
    assert.deepEqual(adopted.map(n => [n[1], n[2]]), [[4, 72], [8, 60], [16, 64], [20, 65]]);
    assert.deepEqual(rows((await report()).captureCandidate.notes), rows(replaced), 'adopted edits remain available in copied diagnostics');

    // Reopen the original numerical capture, not the separately edited candidate.
    // v12 reports used the same trace contract and do not contain raw PCM.
    const previousVersionReport = { ...finalReport, prototype: 'ML-T01-v12' };
    const importDetails = page.locator('details').filter({ has: page.locator('#capture-import-text') });
    if (await importDetails.count() && !(await importDetails.evaluate(node => node.open))) await importDetails.locator('summary').click();
    await page.locator('#capture-import-text').fill(JSON.stringify(previousVersionReport));
    await page.locator('#capture-import-button').click();
    assert.match(await page.locator('#capture-import-status').innerText(), /元の取り込みを開きました/);
    assert.equal(await page.locator('#capture-variant').inputValue(), 'current');
    const reopened = await report();
    assert.deepEqual(reopened.captureCandidate.notes, expected.notes, 'import resumes the original capture, excluding manual edits');
    assert.deepEqual(reopened.capture.notes, expected.notes);
    assert.deepEqual(await score('#score'), adopted, 'import must preserve the adopted main melody');
    for (const mode of ['unsmoothed', 'detail', 'current']) {
      await page.locator('#capture-variant').selectOption(mode);
      assert.deepEqual(rows((await report()).captureCandidate.notes), expected.analysisComparison.variants.find(v => v.mode === mode).notes);
    }
    const candidateBeforeBadImport = (await report()).captureCandidate;
    await page.locator('#capture-import-text').fill('{"capture":');
    await page.locator('#capture-import-button').click();
    assert.match(await page.locator('#capture-import-status').innerText(), /JSON/);
    assert.deepEqual((await report()).captureCandidate, candidateBeforeBadImport);
    assert.deepEqual(await score('#score'), adopted);
    for (const note of candidateBeforeBadImport.notes) {
      await page.locator('#capture-note').selectOption(note.id);
      await page.locator('#capture-edit-delete').click();
      await page.locator('#capture-edit-confirm').click();
    }
    assert.equal((await report()).captureCandidate.notes.length, 0);
    assert.equal(await page.locator('#capture-score [data-note-id]').count(), 0);
    assert.equal(await page.locator('#capture-note').isDisabled(), true);
    await page.locator('#capture-edit-undo').click();
    assert.equal((await report()).captureCandidate.notes.length, 1);
    assert.equal(await page.locator('#capture-note').isEnabled(), true);
    assert.deepEqual((await report()).capture.notes, expected.notes);
    assert.deepEqual(await score('#score'), adopted);
    assert.equal(await page.evaluate(() => window.editorMediaRequests), 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(JSON.stringify({ result: 'PASS', base, realCaptures: 1, variants: 3, manualEdits: 'replace/cancel/confirm, split/merge, delete/undo, overlap/overflow/gap rejection, independent source edits', reportImport: 'v12 trace replay, original capture retained, malformed JSON preserves candidate', viewports: 4, analysis: 'deterministic frames; real-voice accuracy not tested' }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
