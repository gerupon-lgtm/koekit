const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.SAEZURI_BASE || 'http://127.0.0.1:8000';
(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
 try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', permissions: ['microphone'] });
  // The fake microphone's changing noise isn't a melody fixture. Supply a
  // deterministic tone to the real analysis worker for candidate UI checks.
  await context.addInitScript(()=>{
   const NativeWorker=window.Worker;
   window.Worker=class extends NativeWorker {
    postMessage(data,transfer){
     if(data.samples && data.options?.windowSize===1024){
      for(let i=0;i<data.samples.length;i++)data.samples[i]=i<data.sampleRate*.125?0:.2*Math.sin(2*Math.PI*440*i/data.sampleRate);
     }
     super.postMessage(data,transfer);
    }
   };
  });
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url()); });
  await page.goto(base + '/probe/saezuri/');
  await page.locator('#score svg').first().waitFor();
  assert.equal(await page.locator('#acoustic-sync').isChecked(),true);
  assert.equal(await page.locator('#adaptive-window').isChecked(),true);
  assert.equal(Number(await page.locator('#gap').inputValue()),.1);
  await page.locator('#acoustic-sync').uncheck();
  assert.equal(await page.locator('#count-volume').inputValue(),'1');
  await page.locator('#count-volume').selectOption('2');
  assert.ok(await page.locator('[data-note-id]').count() > 0);
  await page.locator('#play').click();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'playing');
  await page.waitForTimeout(500);
  await page.locator('#stop').click();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'idle');
  const countedPlayback=JSON.parse(await page.locator('#metrics').innerText()).playback;
  assert.equal(countedPlayback.countSound,true);
  assert.equal(countedPlayback.countVolume,2);
  assert.ok(countedPlayback.countEvents>=1);
  await page.locator('#play-count').uncheck();
  await page.locator('#play').click();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'playing');
  await page.waitForTimeout(500);
  await page.locator('#stop').click();
  assert.equal(JSON.parse(await page.locator('#metrics').innerText()).playback.countEvents,0);
  await page.locator('#play-count').check();
  await page.locator('#play').click();
  await page.locator('#stop').click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#status').getAttribute('data-state'), 'idle');
  await page.locator('#capture').click();
  assert.equal(await page.locator('#note-mode').isDisabled(),true);
  assert.equal(await page.locator('#adaptive-window').isDisabled(),true);
  assert.equal(await page.locator('#count-volume').isDisabled(),true);
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'count-in');
  await page.waitForFunction(() => document.querySelector('#capture-position').textContent.includes('マイクの準備待ち'));
  await page.locator('#mic').click();
  assert.equal(await page.locator('#status').getAttribute('data-state'), 'idle');
  assert.equal(await page.locator('#capture').isDisabled(), true);
  await page.locator('#mic').click();
  await page.locator('#tempo').fill('180');
  await page.locator('#analysis-options summary').click();
  await page.locator('#window-size').selectOption('1024');
  await page.locator('#timing-adjust').fill('80');
  await page.locator('#capture').click();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'recording');
  await page.waitForFunction(() => document.querySelector('#capture-position').textContent.includes('録音'));
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'idle', { timeout: 20000 });
  const captureReport = JSON.parse(await page.locator('#metrics').innerText());
  assert.ok(captureReport.capture.samples > 0);
  assert.equal(captureReport.capture.samples, Math.round(captureReport.capture.sampleRate * 16 / 3));
  assert.ok(captureReport.capture.frames.count > 0);
  assert.equal(captureReport.captureOptions.boundaryMode, 'energy-gated');
  assert.equal(captureReport.captureOptions.windowSize, 1024);
  assert.equal(captureReport.prototype, 'ML-T01-v15');
  assert.equal(captureReport.captureOptions.noteMode, 'sustain');
  assert.equal(captureReport.captureOptions.smoothingMs, 80);
  assert.equal(captureReport.capture.recordCount, true);
  assert.equal(captureReport.capture.timing.countTimes.length, 22);
  assert.ok(captureReport.capture.timing.correctionSeconds >= 0.08);
  assert.equal(captureReport.captureOptions.manualMs,80);
  assert.equal(captureReport.captureOptions.countVolume,2);
  assert.equal(await page.evaluate(()=>localStorage.getItem('saezuri.capture.manualMs')),'80');
  assert.ok(captureReport.capture.notes.length>0);
  const mainKey=await page.locator('#score-key-label').getAttribute('data-fifths');
  const captureKey=Number(await page.locator('#capture-key-label').getAttribute('data-fifths'));
  await page.locator(captureKey<7?'#capture-key-sharp':'#capture-key-flat').click();
  const selectedKey=await page.locator('#capture-key-label').getAttribute('data-fifths');
  assert.equal(await page.locator('#score-key-label').getAttribute('data-fifths'),mainKey);
  const candidateReport=JSON.parse(await page.locator('#metrics').innerText());
  assert.deepEqual(candidateReport.captureCandidate.notes,captureReport.capture.notes);
  await page.locator('#capture-octave-up').click();
  const raisedReport=JSON.parse(await page.locator('#metrics').innerText());
  assert.deepEqual(raisedReport.captureCandidate.notes,captureReport.capture.notes);
  assert.equal(raisedReport.displayOctaves.capture,1);
  assert.equal(raisedReport.displayOctaves.score,0);
  await page.locator('#align-start').click();
  const alignedReport=JSON.parse(await page.locator('#metrics').innerText());
  assert.equal(alignedReport.captureCandidate.notes[0].startTick,0);
  assert.ok(alignedReport.capture.notes[0].startTick>0);
  await page.locator('#capture-edit-confirm').click();
    await page.locator('#adopt').click();
  assert.equal(await page.locator('#score-key-label').getAttribute('data-fifths'),selectedKey);
  assert.equal(await page.locator('#score-octave-up').getAttribute('aria-pressed'),'true');
  const workerBoundaries = await page.evaluate(async () => {
   const results = [];
   for (const boundaryMode of ['window-start','energy-gated']) {
    const result = await new Promise((resolve,reject) => {
     const worker = new Worker('./worker.js', {type:'module'});
     const timer = setTimeout(() => { worker.terminate(); reject(new Error('worker timeout')); }, 10000);
     worker.onerror = error => { clearTimeout(timer); worker.terminate(); reject(new Error(error.message)); };
     worker.onmessage = ({data}) => {clearTimeout(timer); worker.terminate(); resolve(data);};
     const samples = Float32Array.from({length:96000}, (_, i) => i >= 24000 && i < 72000 ? 0.2 * Math.sin(2 * Math.PI * 261.6255653 * i / 48000) : 0);
     worker.postMessage({samples,sampleRate:48000,tempo:180,sessionId:1,options:{boundaryMode}},[samples.buffer]);
    });
    results.push(result.notes.map(n => [n.startTick,n.durationTick]));
   }
   return results;
  });
  assert.deepEqual(workerBoundaries, [[[5,13]],[[6,12]]]);
  // Actual media stream returned late must be stopped, never resurrect a cancelled request.
  await page.evaluate(() => {
   const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia = async options => {
    const stream = await getUserMedia(options); window.delayedStream = stream;
    await new Promise(resolve => { window.releaseMedia = resolve; }); return stream;
   };
  });
  await page.locator('#capture').click();
  await page.waitForFunction(() => !!window.releaseMedia);
  await page.locator('#stop').click();
  await page.evaluate(() => window.releaseMedia());
  await page.waitForFunction(() => window.delayedStream.getTracks().every(t => t.readyState === 'ended'));
  assert.equal(await page.locator('#status').getAttribute('data-state'), 'idle');
  await page.locator('#empty').click();
  await page.locator('#propose').click();
  await page.locator('#play').click();
  await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
   await page.locator('#stop').click();
  assert.equal(await page.locator('#score [data-note-id]').count(), 0);
  await page.locator('#confirm').click();
  assert.equal(await page.locator('#score [data-note-id]').count(), 1);
  await page.locator('#undo').click();
  assert.equal(await page.locator('#score [data-note-id]').count(), 0);
  // Pin C for the explicit C-sharp -> C-natural accidental check.
  while(Number(await page.locator('#score-key-label').getAttribute('data-fifths'))!==0){
   const fifths=Number(await page.locator('#score-key-label').getAttribute('data-fifths'));
   await page.locator(fifths>0?'#score-key-flat':'#score-key-sharp').click();
  }
  await page.locator('#score-key-sharp').click(); await page.locator('#score-key-flat').click();
  for (const pitch of ['61', '60']) {
   await page.locator('#pitch').selectOption(pitch);
   await page.locator('#propose').click(); await page.locator('#confirm').click();
  }
  assert.equal(await page.locator('#score [data-note-id] text').allTextContents().then(values => values.includes('♮')), true);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true})));
  await page.locator('#play').click();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'playing');
  await page.locator('#stop').click();
  assert.equal(await page.locator('#status').getAttribute('data-state'), 'idle');
  const render = await page.evaluate(async () => {
   const { scheduleVoice } = await import('./audio.js');
   const results = {};
   for (const instrument of ['sine', 'piano', 'wood', 'soft']) {
    const ctx = new OfflineAudioContext(1, 48000, 48000);
    scheduleVoice(ctx, ctx.destination, { midi: 60, time: 0.1, duration: 0.5, instrument });
    const data = (await ctx.startRendering()).getChannelData(0);
    results[instrument] = { peak: data.reduce((a,b) => Math.max(a,Math.abs(b)),0), before: data.slice(0,4700).some(x => x !== 0), after: data.slice(35000).some(x => x !== 0) };
   }
   return results;
  });
  for (const r of Object.values(render)) { assert.ok(r.peak > 0.01 && r.peak < 1); assert.equal(r.before, false); assert.equal(r.after, false); }
  for (const [width, height] of [[320,568], [390,844], [844,390], [1280,800]]) {
   await page.setViewportSize({width,height});
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
   assert.ok(await page.locator('#stop').evaluate(e => e.getBoundingClientRect().bottom <= innerHeight));
  }
  await page.setViewportSize({width:320,height:568});
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#example').click();
  await page.evaluate(() => scrollTo(0,0));
  await page.screenshot({path:'.local-tools/saezuri-probe.png',fullPage:true});
  let longPlayback = null;
  if (process.env.SAEZURI_LONG === '1') {
   const longTempo = Number(process.env.SAEZURI_LONG_TEMPO || 180);
   assert.ok([60,120,180].includes(longTempo));
   await page.locator('#length').selectOption('129');
   await page.locator('#tempo').fill(String(longTempo));
   await page.locator('#play').click();
   await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'idle', null, {timeout:516*60/longTempo*1000+18000});
   longPlayback = JSON.parse(await page.locator('#metrics').innerText()).playback;
   assert.equal(longPlayback.reason, 'ENDED');
   assert.equal(longPlayback.finalTick, 2064);
   assert.equal(longPlayback.events, longPlayback.notes);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(JSON.stringify({ result: 'PASS', browsers: ['Chrome'], viewports: 4, offlineAudio: render, capture: {samples:captureReport.capture.samples, sampleRate:captureReport.capture.sampleRate, frames:captureReport.capture.frames.count, analysisMs:captureReport.capture.analysisMs}, longPlayback, externalRequests: external.length }));
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
