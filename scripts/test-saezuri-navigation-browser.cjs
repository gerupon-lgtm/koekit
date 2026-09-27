const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8014';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});try{
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],serviceWorkers:'block'});
 await context.addInitScript(()=>{window.recognizers=[];window.Vosk={createModel:async()=>({KaldiRecognizer:class{constructor(){this.events={};window.recognizers.push(this);}on(k,f){this.events[k]=f;}acceptWaveform(){}remove(){}}})};});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const click=id=>page.locator('#'+id).click();
 const report=async()=>{await page.evaluate(()=>document.querySelector('#report').click());return JSON.parse(await page.locator('#metrics').textContent());};
 const back=()=>page.locator('#melody-create [data-screen-back]').click();
 const confirm=()=>click('discard-confirm');
 await page.goto(base+'/probe/saezuri/');await click('home-create');await click('new-image');
 const genre=await page.locator('#image-genre option').last().getAttribute('value');await page.locator('#image-genre').selectOption(genre);
 const imageDraft=(await report()).captureEditing;assert.equal(imageDraft.pending,true);
 await back();assert.equal(await page.locator('#melody-choose').isVisible(),true);assert.deepEqual((await report()).captureEditing,imageDraft);
 await click('new-manual');assert.equal(await page.locator('#melody-discard').isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'discard-cancel');
 await click('discard-cancel');assert.deepEqual((await report()).captureEditing,imageDraft);
 await click('choose-resume');assert.equal(await page.locator('#image-genre').inputValue(),genre);
 await back();await click('new-manual');await page.keyboard.press('Escape');assert.deepEqual((await report()).captureEditing,imageDraft);
 await click('new-manual');await confirm();assert.equal((await report()).captureEditing.pending,false);assert.equal(await page.locator('#capture-blocks button').count(),0);
 // Confirmed work also requires permission; failed imports never erase it.
 await page.locator('[data-pitch="0"]').click();await click('capture-edit-confirm');await page.locator('#phrase-name').fill('残すフレーズ');await click('keep-phrase');
 const confirmed=(await report()).captureEditing;assert.ok(confirmed.undoDepth>0);
 await back();await page.locator('#editor-source details > summary').click();await page.locator('#capture-import-text').fill('{bad');await click('capture-import-button');
 assert.equal(await page.locator('#melody-discard').isVisible(),false);assert.deepEqual((await report()).captureEditing,confirmed);
 const saved=await report();await page.locator('#capture-import-text').fill(JSON.stringify(saved));await click('capture-import-button');assert.equal(await page.locator('#melody-discard').isVisible(),true);await click('discard-cancel');
 await click('choose-resume');await click('edit-voice');await page.waitForFunction(()=>document.querySelector('#edit-voice-status').textContent==='声を受け付けています');
 await page.locator('[data-pitch="4"]').click();const pending=(await report()).captureEditing;assert.equal(pending.pending,true);
 await click('discard');assert.match(await page.locator('#discard-title').textContent(),/おわる/);
 await page.evaluate(()=>window.recognizers.at(-1).events.result({result:{text:'オッケー'}}));assert.deepEqual((await report()).captureEditing,pending);
 await click('discard-cancel');await page.waitForFunction(()=>document.querySelector('#edit-voice-status').textContent==='声を受け付けています');assert.deepEqual((await report()).captureEditing,pending);
 await click('discard');await confirm();assert.equal(await page.locator('#melody-home').isVisible(),true);assert.equal(await page.locator('#home-resume').isVisible(),false);
 await click('home-connect');assert.equal(await page.locator('#phrase-shelf button').count(),1,'registered phrase survives editor discard');
 await page.locator('#melody-connect [data-screen-back]').click();await click('home-create');await click('choose-example');
 await back();await click('new-image');await confirm();assert.equal(await page.locator('#capture-blocks button').count(),0);
 // Button roles and compact layout are checked from rendered styles, not class names.
 await page.locator('[data-mode="input"]').click();await page.locator('[data-pitch="0"]').click();
 for(const [width,height] of [[320,568],[390,844],[844,390],[1280,800]]){
  await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`width ${width}`);
  const styles=await page.locator('#capture-edit-confirm').evaluate(n=>({bg:getComputedStyle(n).backgroundColor,border:getComputedStyle(n).borderTopWidth,radius:getComputedStyle(n).borderRadius}));assert.deepEqual(styles,{bg:'rgb(220, 233, 213)',border:'0px',radius:'14px'});
  await click('discard');assert.equal(await page.locator('#discard-confirm').isVisible(),true);assert.equal(await page.evaluate(()=>document.querySelector('#melody-discard').scrollWidth<=document.querySelector('#melody-discard').clientWidth),true);await page.keyboard.press('Escape');
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local-tools/saezuri-v22-controls.png'});await click('discard');await page.screenshot({path:'.local-tools/saezuri-v22-discard.png'});
 assert.deepEqual(errors,[]);console.log('PASS v22: hierarchical back, switch cancel/OK/Escape, confirmed/pending drafts, import validation, end/undo disposal, voice gate, registered phrases and 4 widths');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
