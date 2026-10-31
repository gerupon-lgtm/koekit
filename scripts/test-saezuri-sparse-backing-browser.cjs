const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const {startNewPart,openProjectPart,revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage({viewport:{width:390,height:740},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 const click=s=>page.locator(s).click(),report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
 await page.goto(base+'/probe/saezuri/');await startNewPart(page);await click('[data-mode="backing"]');
 await page.locator('#image-rhythm').selectOption('whole');await click('#image-settings-open');await page.locator('#image-enabled').check();await page.locator('#image-drums').selectOption('hat-half-front');await click('#backing-settings-close');
 let r=await report();assert.equal(r.captureEditing.pending,true);assert.equal(r.captureEditing.editCandidate.accompaniment.rhythm,'whole');assert.equal(r.captureEditing.editCandidate.accompaniment.drumPattern,'hat-half-front');
 await click('#preview');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');await click('#stop');await click('#capture-edit-confirm');
 await page.locator('#image-rhythm').selectOption('halves');await click('#image-settings-open');await page.locator('#image-drums').selectOption('hat-half-back');await click('#backing-settings-close');
 await click('#capture-edit-confirm');r=await report();assert.equal(r.captureCandidate.accompaniment.rhythm,'halves');assert.equal(r.captureCandidate.accompaniment.drumPattern,'hat-half-back');
 await click('#image-settings-open');await page.locator('#image-drums').selectOption('none');await click('#backing-settings-close');await click('#capture-edit-confirm');
 await page.locator('[data-chord-bar="0"]').click();await click('#chord-count-start');await page.waitForFunction(()=>document.querySelector('#chord-metronome').dataset.state==='running');await click('#chord-count-stop');await click('#chord-close');
 await click('#capture-edit-undo');r=await report();assert.equal(r.captureEditing.editCandidate.accompaniment.drumPattern,'hat-half-back');assert.equal(r.captureCandidate.accompaniment.drumPattern,'none');await click('#capture-edit-confirm');
 await page.locator('#image-rhythm').selectOption('whole');await click('#capture-edit-undo');r=await report();assert.equal(r.captureCandidate.accompaniment.rhythm,'halves');
 await click('#image-settings-open');await click('#image-sounds');await page.locator('#sound-drums').selectOption('none');await click('#sounds-close');
 await page.locator('#image-drums').selectOption('auto');r=await report();assert.equal(r.captureEditing.editCandidate.accompaniment.sounds.drums,'none','auto preserves explicit drum mute');assert.equal(await page.locator('#image-drums').inputValue(),'none');
 await page.locator('#image-drums').selectOption('hat-half-back');r=await report();assert.equal(r.captureEditing.editCandidate.accompaniment.sounds.drums,'acoustic','explicit hat selection enables its sound');await click('#backing-settings-close');await click('#capture-edit-confirm');
 for(const [width,height] of [[320,568],[390,740],[740,390],[1280,800]]){
  await page.setViewportSize({width,height});await click('#image-settings-open');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const selector of ['#backing-settings-close','#backing-settings-stop']){const b=await page.locator(selector).boundingBox();assert.ok(b.y>=0&&b.y+b.height<=height+1);}
  await page.locator('#image-drums').scrollIntoViewIfNeeded();const box=await page.locator('#image-drums').boundingBox();assert.ok(box.width>150&&box.height>=44);await click('#backing-settings-close');
 }
 await page.setViewportSize({width:390,height:740});await page.screenshot({path:'.local-tools/sparse-backing-main.png',fullPage:true});await click('#image-settings-open');await page.screenshot({path:'.local-tools/sparse-backing-settings.png',fullPage:true});await click('#backing-settings-close');
 await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');await page.reload();await click('#home-songs');await page.locator('[data-song-open]').first().click();await openProjectPart(page);await click('[data-mode="backing"]');
 r=await report();assert.equal(r.captureCandidate.accompaniment.rhythm,'halves');assert.equal(r.captureCandidate.accompaniment.drumPattern,'hat-half-back');
 // Render the shipped voices through the native audio engine. Sustained harmony
 // stays audible between the two strikes; hats have the requested accents.
 const pcm=await page.evaluate(async()=>{
  const {accompanimentEvents}=await import('/saezuri/music/accompaniment.js'),{scheduleVoice}=await import('./audio.js'),{blankPattern}=await import('./entry-session.js');
  const rows=[],rate=24000,rms=(data,a,b)=>{let sum=0;for(let i=Math.round(a*rate);i<Math.round(b*rate);i++)sum+=data[i]**2;return Math.sqrt(sum/Math.round((b-a)*rate));};
  for(const rhythm of ['whole','halves'])for(const engine of ['classic','light','simple']){
   const p=blankPattern();p.accompaniment={enabled:true,genre:'nursery',rhythm,progression:'home',drumPattern:'none'};
   const ctx=new OfflineAudioContext(1,Math.round(2.5*rate),rate);for(const n of accompanimentEvents(p).filter(e=>e.startTick<16))scheduleVoice(ctx,ctx.destination,{...n,time:.1+n.startTick*.125,duration:n.durationTick*.125,engine});
   const data=(await ctx.startRendering()).getChannelData(0);rows.push({rhythm,engine,heldRms:rms(data,1.7,1.9),peak:Math.max(...data),finite:data.every(Number.isFinite)});
  }
  const hats=[];for(const drumPattern of ['hat-half-front','hat-half-back']){
   const p=blankPattern();p.accompaniment={enabled:true,genre:'nursery',rhythm:'whole',progression:'home',drumPattern};const ctx=new OfflineAudioContext(1,2*rate,rate);
   for(const n of accompanimentEvents(p).filter(e=>e.part==='drums'&&e.startTick<16))scheduleVoice(ctx,ctx.destination,{...n,time:.1+n.startTick*.125,duration:.125});
   const data=(await ctx.startRendering()).getChannelData(0);hats.push({drumPattern,front:rms(data,.1,.145),back:rms(data,1.1,1.145)});
  }return {rows,hats};
 });
 for(const row of pcm.rows)assert.ok(row.finite&&row.peak<1&&row.heldRms>.0001,JSON.stringify(row));
 assert.ok(pcm.hats[0].front>pcm.hats[0].back*1.1,JSON.stringify(pcm));assert.ok(pcm.hats[1].back>pcm.hats[1].front*1.1);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',check:'held harmony, half hats, independent Donkama, confirm/undo/save/reload, 4 viewport sizes, native PCM',pcm}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

