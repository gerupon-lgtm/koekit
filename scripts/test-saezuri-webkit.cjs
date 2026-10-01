// WebKit on Windows + generated MediaStream. This is not an iPhone microphone test.
const path = require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(__dirname, '../.local-tools/browsers');
const { webkit } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.SAEZURI_BASE || 'http://127.0.0.1:8000';
(async () => {
 const browser = await webkit.launch({headless:true});
 try {
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url()); });
  await page.goto(base + '/probe/saezuri/?view=full');
  await page.locator('#score svg').first().waitFor();
  assert.equal(await page.evaluate(() => isSecureContext), true);
  const capabilities = await page.evaluate(() => ({
   getUserMedia: typeof navigator.mediaDevices?.getUserMedia,
   audioContext: typeof globalThis.AudioContext,
   streamDestination: typeof globalThis.AudioContext?.prototype.createMediaStreamDestination,
   audioWorklet: typeof AudioWorkletNode,
  }));
  if (capabilities.audioContext !== 'function') {
   assert.deepEqual(errors, []);
   assert.deepEqual(external, []);
   console.log(JSON.stringify({result:'PARTIAL',engine:'WebKit on Windows',base,passed:['score rendering'],audio:'UNTESTED: AudioContext unavailable in this engine',capabilities,errors,externalRequests:external.length}));
   return;
  }
  await page.locator('#play').click();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'playing');
  await page.locator('#stop').click();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'idle');
  if (capabilities.getUserMedia !== 'function' || capabilities.streamDestination !== 'function') {
   assert.deepEqual(errors, []);
   assert.deepEqual(external, []);
   console.log(JSON.stringify({result:'PARTIAL',engine:'WebKit on Windows',base,passed:['score rendering','playback start/stop'],capture:'UNTESTED: media capture API unavailable in this engine',capabilities,errors,externalRequests:external.length}));
   return;
  }
  await page.evaluate(() => {
   window.testStreams = [];
   window.testAudio = [];
   navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext();
    await ctx.resume();
    const tone = ctx.createOscillator(), gain = ctx.createGain(), output = ctx.createMediaStreamDestination();
    tone.frequency.value = 440;
    gain.gain.value = 0.2;
    tone.connect(gain).connect(output);
    tone.start();
    testAudio.push(ctx);
    testStreams.push(output.stream);
    return output.stream;
   };
  });
  await page.locator('#tempo').fill('180');
  await page.locator('#count-sound').uncheck();
  await page.locator('#capture').click();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'count-in');
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'idle', null, {timeout:25000});
  const report = JSON.parse(await page.locator('#metrics').innerText());
  assert.ok(report.capture, await page.locator('#status').innerText());
  assert.equal(report.capture.samples, Math.round(report.capture.sampleRate * 16 / 3));
  assert.ok(report.capture.frames.pitched > 0);
  assert.equal(await page.locator('#review').isVisible(), true);
  assert.ok(await page.evaluate(() => testStreams.every(s => s.getTracks().every(t => t.readyState === 'ended'))));
  await page.locator('#preview').click();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'playing');
  await page.locator('#stop').click();
  await page.locator('#capture').click();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'count-in');
  await page.locator('#mic').click();
  assert.equal(await page.locator('#status').getAttribute('data-state'), 'idle');
  assert.ok(await page.locator('#capture').isDisabled());
  assert.ok(await page.evaluate(() => testStreams.every(s => s.getTracks().every(t => t.readyState === 'ended'))));
  await page.evaluate(() => Promise.all(testAudio.map(c => c.close())));
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(JSON.stringify({result:'PASS',engine:'WebKit on Windows',input:'generated 440Hz MediaStream, not physical microphone',base,capture:report.capture,errors,externalRequests:external.length}));
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
