const {chooseBackingRhythm}=require('./saezuri-browser-controls.cjs');
const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const {startNewPart,openProjectPart,revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage({viewport:{width:390,height:740},hasTouch:true,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 const click=s=>page.locator(s).click(),report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
 const roots=async()=>{const r=await report();return page.evaluate(async p=>{const {chordAtTick}=await import('/saezuri/music/chord-timing.js');return [0,4,8,12,16].map(t=>chordAtTick(p,t).root)},r.captureEditing.editCandidate??r.captureCandidate)};
 await page.goto(base+'/probe/saezuri/');await page.evaluate(async()=>{const {setMicrophoneEnabled}=await import('/src/speech/microphone.js');setMicrophoneEnabled(false);});await startNewPart(page);await click('[data-mode="backing"]');await chooseBackingRhythm(page,'whole');await click('[data-chord-bar="0"]');
 await click('#chord-grid [data-root="0"][data-quality="major"]');await click('#chord-use');
 await click('[data-chord-beat="2"]');await click('#chord-grid [data-root="7"][data-quality="major"]');await click('#chord-use');assert.deepEqual(await roots(),[0,0,7,7,5]);
 const before=await report();await click('#chord-single-preview');await page.waitForFunction(old=>{document.querySelector('#report').click();const value=JSON.parse(document.querySelector('#metrics').textContent);return value.chordAudition?.timestamp&&value.chordAudition.timestamp!==old},before.chordAudition?.timestamp);await click('#stop');assert.deepEqual((await report()).captureEditing,before.captureEditing);
 await click('#chord-confirm');assert.match(await page.locator('[data-chord-bar="0"]').textContent(),/C→G/);
 await click('[data-chord-bar="0"]');await click('[data-chord-beat="1"]');await click('#chord-grid [data-root="2"][data-quality="minor"]');await click('#chord-use');assert.deepEqual(await roots(),[0,2,7,7,5]);
 await click('#chord-remove');assert.deepEqual(await roots(),[0,0,7,7,5]);
 await click('[data-chord-beat="3"]');await click('#chord-grid [data-root="5"][data-quality="major"]');await click('#chord-use');assert.deepEqual(await roots(),[0,0,7,5,5]);
 for(const [width,height] of [[320,568],[390,740],[740,390],[1280,800]]){
  await page.setViewportSize({width,height});await page.locator('#chord-beats').scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const b of await page.locator('[data-chord-beat]').all()){const box=await b.boundingBox();assert.ok(box.width>=44&&box.height>=44);}
  const y=await page.evaluate(()=>scrollY);await click('[data-chord-beat="2"]');assert.ok(Math.abs(await page.evaluate(()=>scrollY)-y)<3,'selecting a beat keeps the page position');
 }
 await page.setViewportSize({width:390,height:740});await page.locator('#chord-beats').scrollIntoViewIfNeeded();await page.screenshot({path:'.local-tools/chord-beats-phone.png'});await click('#chord-confirm');
 await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');await page.reload();await click('#home-songs');await page.locator('[data-song-open]').first().click();await openProjectPart(page);await click('[data-mode="backing"]');
 assert.deepEqual(await roots(),[0,0,7,5,5]);assert.match(await page.locator('[data-chord-bar="0"]').textContent(),/C→G→F/);
 const events=await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(r=>/\/audio\.js\?/.test(r.name)).name,{ProbeTransport}=await import(url),start=ProbeTransport.prototype.start;ProbeTransport.prototype.start=function(notes,options){window.lastBacking=options.accompaniment;return start.call(this,notes,options);};return true;});
 await revealCreationControl(page,'#backing-loop');await click('#backing-loop');await page.waitForFunction(()=>window.lastBacking?.length);const bass=await page.evaluate(()=>lastBacking.filter(e=>e.part==='bass'&&e.startTick<16).map(e=>[e.startTick,e.durationTick,e.midi%12]));assert.deepEqual(bass,[[0,8,0],[8,4,7],[12,4,5]]);await click('#stop');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',check:'touch beat controls, C/G/F, removal, audition without commit, OK, save/reload, real loop events, 4 viewports and stable scroll',events}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
