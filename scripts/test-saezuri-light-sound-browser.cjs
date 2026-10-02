const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const origin = process.env.SAEZURI_BASE || 'http://127.0.0.1:8018';
const output = path.resolve(__dirname, '../.local-tools/light-sound-check');
fs.mkdirSync(output, { recursive: true });
(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
 try {
  const context = await browser.newContext({ permissions: ['microphone'], serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  const page = await context.newPage(), errors = [], failed = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('requestfailed', r => failed.push(r.url()));
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto(origin + '/probe/light-sound/?testDuration=1');
  const pcm = await page.evaluate(async () => {
   const { createLightVoice, lightVoiceStats, stopLightVoices } = await import('../saezuri/light-voice.js');
   const rate = 48000, rms = (samples, from, to) => Math.sqrt(samples.slice(from * rate, to * rate).reduce((sum, v) => sum + v * v, 0) / ((to - from) * rate));
   const render = async (engine, instrument, duration, midi = 60, velocity = 70) => {
    const audio = new OfflineAudioContext(1, rate * 2, rate);
    const voice = createLightVoice(audio, audio.destination, { engine, instrument, duration, midi, velocity, time: .1 });
    const data = (await audio.startRendering()).getChannelData(0);
    return { data, count: voice.oscillatorCount, end: voice.endTime, stats: lightVoiceStats(audio), finite: data.every(Number.isFinite), peak: Math.max(...data.slice(0, 9600).map(Math.abs)) };
   };
   const results = [];
   for (const engine of ['light', 'simple']) for (const instrument of ['piano', 'wood', 'soft', 'sine', 'lead', 'fm-piano', 'synth-bass', 'strings', 'brass']) {
    const short = await render(engine, instrument, .35), long = await render(engine, instrument, 1.3);
    let prefixDifference = 0;
    for (let i = .12 * rate; i < .43 * rate; i++) prefixDifference = Math.max(prefixDifference, Math.abs(short.data[i] - long.data[i]));
    results.push({ engine, instrument, count: short.count, finite: short.finite && long.finite, peak: short.peak, prefixDifference, head: rms(short.data, .101, .16), before: rms(short.data, 0, .099), tail: rms(short.data, .48, .55), silence: rms(short.data, 1, 1.2), activeAfter: short.stats.active });
   }
   for (const midi of [36, 48, 96, 120]) { const a = await render('light', 'piano', .35, midi); results.push({ midi, finite: a.finite, count: a.count }); }
   const heldAudio = new OfflineAudioContext(1, rate * 2, rate), held = createLightVoice(heldAudio, heldAudio.destination, { midi: 60, engine: 'light' });
   heldAudio.suspend(.65).then(() => { held.release(); held.release(); heldAudio.resume(); });
   const heldData = (await heldAudio.startRendering()).getChannelData(0);
   const cancelAudio = new OfflineAudioContext(1, rate, rate);
   createLightVoice(cancelAudio, cancelAudio.destination, { midi: 60, time: .5, duration: .3 }); stopLightVoices(cancelAudio);
   const canceled = (await cancelAudio.startRendering()).getChannelData(0);
   const quiet = await render('simple', 'piano', .35, 60, 35), loud = await render('simple', 'piano', .35);
   return { results, held: { sounding: rms(heldData, .4, .6), tail: rms(heldData, .72, .85), silence: rms(heldData, 1.2, 1.4), activeAfter: lightVoiceStats(heldAudio).active }, canceled: canceled.every(v => v === 0), velocityRatio: rms(quiet.data, .15, .4) / rms(loud.data, .15, .4) };
  });
  for (const row of pcm.results) {
   assert.ok(row.finite, JSON.stringify(row)); assert.ok(row.count <= 2);
   if (row.engine) { assert.ok(row.peak > 1e-5 && row.peak < 1); assert.ok(row.prefixDifference < 1e-6, 'decay independent of note duration'); assert.ok(row.head > 1e-4); assert.equal(row.before, 0); assert.ok(row.tail > 1e-5, 'release retained'); assert.equal(row.silence, 0); assert.equal(row.activeAfter, 0); }
  }
  assert.ok(pcm.held.sounding > .005 && pcm.held.tail > 1e-4); assert.equal(pcm.held.silence, 0); assert.equal(pcm.held.activeAfter, 0); assert.ok(pcm.canceled);
  assert.ok(Math.abs(pcm.velocityRatio - .5 ** .8) < 1e-5);
  console.log('PASS native PCM: 18 tone/engine pairs, duration-independent decay, release, held note, cancellation, velocity, low/high notes');
  // Native AudioContext: a phrase end must wait for its final release.
  const transportResult = await page.evaluate(async () => {
   const token = new URL(document.querySelector('script[type=module]').src).searchParams.get('v'), suffix = token ? '?v=' + token : '';
   const { ProbeTransport } = await import('../saezuri/audio.js' + suffix);
   const { lightVoiceStats } = await import('../saezuri/light-voice.js' + suffix);
   const audio = new AudioContext(); await audio.resume(); const seen = [];
   const ended = await new Promise(resolve => { const t = new ProbeTransport(audio, (reason, metrics) => resolve({ reason, metrics, now: audio.currentTime, anchor: t.anchor, active: lightVoiceStats(audio).active }), null, { engine: 'light' });
    t.start([{ midi: 60, startTick: 0, durationTick: 1 }], { totalTicks: 1, tempo: 120, lead: .1 });
    setTimeout(() => seen.push({ active: t.active, voices: lightVoiceStats(audio).active }), 350);
   }); await audio.close(); return { ended, seen };
  });
  assert.equal(transportResult.ended.reason, 'ENDED'); assert.deepEqual(transportResult.seen, [{ active: true, voices: 1 }]);
  assert.ok(transportResult.ended.now - transportResult.ended.anchor >= .55); assert.equal(transportResult.ended.active, 0);
  const loopResult = await page.evaluate(async () => {
   const token = new URL(document.querySelector('script[type=module]').src).searchParams.get('v'), suffix = token ? '?v=' + token : '';
   const { ProbeTransport } = await import('../saezuri/audio.js' + suffix), { lightVoiceStats } = await import('../saezuri/light-voice.js' + suffix);
   const audio = new AudioContext(); await audio.resume(); const t = new ProbeTransport(audio, () => {}, null, { engine: 'light' });
   t.start([{ midi: 60, startTick: 0, durationTick: 2 }], { totalTicks: 4, tempo: 120, lead: .1, loop: true });
   await new Promise(resolve => setTimeout(resolve, 665)); const overlap = lightVoiceStats(audio).active, events = t.metrics.events;
   t.stop(false); const afterStop = lightVoiceStats(audio).active; await audio.close(); return { overlap, events, afterStop };
  });
  assert.ok(loopResult.overlap >= 2 && loopResult.events >= 2, 'next loop head overlaps the previous release'); assert.equal(loopResult.afterStop, 0);
  for (const engine of ['light', 'simple', 'classic']) {
   await page.locator('#engine').selectOption(engine);
   for (const mode of ['held', 'repeat']) {
    await page.locator('#mode').selectOption(mode); await page.locator('#count').selectOption('16'); await page.locator('#listen').click();
    await page.waitForFunction(() => !document.getElementById('heard').hidden, null, { timeout: 10000 }); await page.locator('#clean').click();
   }
  }
  await page.locator('#engine').selectOption('light'); await page.locator('#mode').selectOption('song'); assert.equal(await page.locator('#count').isDisabled(), true);
  await page.locator('#listen').click(); await page.waitForFunction(() => !document.getElementById('heard').hidden, null, { timeout: 12000 }); await page.locator('#glitch').click();
  await page.locator('[data-audition=piano]').click(); await page.locator('[data-audition=soft]').click(); await page.locator('#stop').click();
  await page.locator('#listen').click(); await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.match(await page.locator('#status').textContent(), /画面が隠れた/); await page.evaluate(() => { delete document.hidden; });
  for (const width of [320, 390, 844]) {
   await page.setViewportSize({ width, height: 844 });
   const geometry = await page.evaluate(() => {
    const stop = document.getElementById('stop').getBoundingClientRect(), heading = document.querySelector('h1').getBoundingClientRect(), boxes = [...document.querySelectorAll('.buttons button')].map(b => b.getBoundingClientRect()).filter(b => b.width > 0 && b.height > 0);
    return { overflow: document.documentElement.scrollWidth > innerWidth, stop: (stop.left + stop.right) / 2, heading: (heading.left + heading.right) / 2, touching: boxes.some((a, i) => boxes.slice(i + 1).some(b => a.left < b.right + 7.9 && a.right + 7.9 > b.left && a.top < b.bottom + 7.9 && a.bottom + 7.9 > b.top)) };
   }); assert.ok(!geometry.overflow && !geometry.touching); assert.ok(Math.abs(geometry.stop - width / 2) < 1 && Math.abs(geometry.heading - width / 2) < 1);
  }
  await page.locator('#result-options>summary').click(); await page.locator('#device').fill('PC Chrome automated; phone not verified');
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export').click(); const download = await downloadPromise; await download.saveAs(path.join(output, 'result.json'));
  const record = JSON.parse(fs.readFileSync(path.join(output, 'result.json'))); assert.equal(record.records.filter(r => r.status === 'completed').length, 7); assert.equal(record.records.filter(r => r.heard === true).length, 6); assert.equal(record.records.filter(r => r.heard === false).length, 1);
  for (const row of record.records.filter(r => r.status === 'completed')) { assert.ok(row.metrics.events + row.metrics.accompanimentEvents > 0); assert.equal(row.metrics.engine, row.engine); }
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#result-options>summary').click(); await page.locator('.more-sounds>summary').click(); await page.screenshot({ path: path.join(output, 'probe-390.png'), fullPage: true });
  fs.writeFileSync(path.join(output, 'pcm-metrics.json'), JSON.stringify(pcm, null, 2));
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  console.log('PASS probe: real 16-note held/repeat on 3 engines, Am/F/C/G with count/drums, tail lifetime, switching/stop/hidden, JSON, three widths; PC only');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
