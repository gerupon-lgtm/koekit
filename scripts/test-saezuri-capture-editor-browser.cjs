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
    await page.goto(base + '/probe/saezuri/?view=full');
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
    assert.equal((await report()).prototype, 'ML-T01-v23');
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
    await page.locator('#capture-pitch-up').click();
    await page.locator('#capture-next').click();
    await page.locator('#capture-pitch-down').click();
    let r=await report();
    assert.deepEqual(r.captureEditing.editCandidate.notes.map(n=>n.midi),[61,59,64,65]);
    assert.deepEqual(r.captureCandidate.notes,baseline);
    assert.deepEqual(await score('#score'),mainBefore);
    assert.equal(r.captureEditing.undoDepth,2);
    assert.ok(await page.locator('#capture-score .capture-note-draft').count());
    assert.ok((await page.locator('#capture-score text').allTextContents()).some(t=>t==='♯' || t==='♭'));
    await page.locator('#preview').click();
    await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
    r=await report();assert.deepEqual(r.playback.pitches,[61,59,64,65]);assert.equal(r.playback.draft,true);
    assert.equal(await page.locator('#capture-pitch-up').isDisabled(),true);
    await page.locator('#stop').click();
    await page.locator('#capture-edit-confirm').click();
    assert.equal(await page.locator('#review').isVisible(),true);
    assert.deepEqual((await score('#score')).map(n=>n[2]),[61,59,64,65]);
    const confirmedScore=await score('#score');
    await page.locator('#capture-edit-undo').click();
    r=await report();assert.deepEqual(r.captureEditing.editCandidate.notes.map(n=>n.midi),[61,60,64,65]);
    assert.deepEqual(await score('#score'),confirmedScore);
    assert.equal(await page.locator('#adopt').isDisabled(),true);
    await page.locator('#capture-edit-cancel').click();
    assert.equal((await report()).captureEditing.pending,false);
    await page.locator('#capture-blocks button').nth(2).click();
    assert.equal(await page.locator('#capture-note').inputValue(),thirdId);
    await page.locator('#capture-pitch-up').click();
    await page.locator('#capture-edit-confirm').click();
    // Detailed operations still act on the same draft and can be undone.
    await page.locator('#capture-edit-details summary').click();
    await page.locator('#capture-split-at').fill('2');await page.locator('#capture-edit-split').click();
    assert.equal((await report()).captureEditing.editCandidate.notes.length,5);
    await page.locator('#capture-edit-merge').click();
    assert.equal((await report()).captureEditing.editCandidate.notes.length,4);
    await page.locator('#capture-edit-cancel').click();
    await page.locator('#capture-edit-delete').click();
    assert.equal((await report()).captureEditing.editCandidate.notes.length,3);
    await page.locator('#capture-edit-undo').click();
    assert.equal((await report()).captureEditing.pending,false);
    await page.locator('#capture-note').selectOption(firstId);
    const beforeInvalid=await score('#capture-score');
    await page.locator('#capture-edit-length').fill('8');await page.locator('#capture-edit-replace').click();
    assert.match(await page.locator('#capture-edit-status').innerText(),/重なり/);
    assert.deepEqual(await score('#capture-score'),beforeInvalid);
    await page.locator('#capture-edit-details summary').click();
    for(const [width,height] of [[320,568],[390,844],[844,390],[1280,800]]) {
      await page.setViewportSize({width,height});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}x${height}`);
    }
    const finalReport=await report();
    assert.deepEqual(finalReport.capture.notes,expected.notes);
    assert.deepEqual(finalReport.capture.analysisComparison,expected.analysisComparison);
    await page.locator('#adopt').click();
    assert.equal((await report()).captureEditing.undoDepth,0);
    assert.equal(await page.locator('#review').isHidden(),true);
    await page.locator('#edit-score').click();
    assert.equal((await report()).captureEditing.undoDepth,0);
    await page.locator('#capture-pitch-down').click();await page.locator('#capture-edit-confirm').click();
    await page.locator('#adopt').click();
    const adopted=await score('#score');
    const details=page.locator('details').filter({has:page.locator('#capture-import-text')});
    await details.locator('summary').click();
    await page.locator('#capture-import-text').fill(JSON.stringify({...finalReport,prototype:'ML-T01-v12'}));
    await page.locator('#capture-import-button').click();
    assert.deepEqual((await report()).captureCandidate.notes,expected.notes);
    assert.deepEqual(await score('#score'),adopted);
    await page.locator('#discard').click();
    await page.locator('#capture-import-text').fill('{"capture":');await page.locator('#capture-import-button').click();
    assert.match(await page.locator('#capture-import-status').innerText(),/JSON/);
    assert.equal(await page.evaluate(()=>window.editorMediaRequests),1);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log(JSON.stringify({result:'PASS',base,realCaptures:1,variants:3,draft:'multiple edits / preview / confirm / continued editing / undo after confirmation / end / reopen',viewports:4}));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
