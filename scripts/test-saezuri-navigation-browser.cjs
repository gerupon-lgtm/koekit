const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8014';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const click=id=>page.locator('#'+id).click();const report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
 const back=()=>page.locator('#melody-create [data-screen-back]').click();
 await page.goto(base+'/probe/saezuri/');await click('home-create');await click('new-image');await click('image-settings-open');await page.locator('#image-genre').selectOption('rock');await click('backing-settings-close');
 const image=(await report()).captureEditing;assert.equal(image.pending,true);await back();assert.deepEqual((await report()).captureEditing,image);await click('choose-resume');
 await click('image-settings-open');assert.equal(await page.locator('#image-genre').inputValue(),'rock');await click('backing-settings-close');await back();await click('new-manual');await page.locator('#composer-rest').waitFor();
 assert.equal(await page.locator('#melody-discard').isVisible(),false);assert.equal((await report()).captureEditing.pending,false);
 await page.locator('[data-pitch="0"]').click();await click('capture-edit-confirm');await page.locator('#phrase-name').fill('A');await click('keep-phrase');await page.locator('[data-pitch="2"]').click();
 const current=(await report()).captureEditing;await back();await page.locator('#melody-choose [data-screen-back]').click();await click('home-resume');assert.deepEqual((await report()).captureEditing,current,'navigation preserves draft and session Undo');
 await back();await page.locator('#editor-source details > summary').click();await page.locator('#capture-import-text').fill('{bad');await click('capture-import-button');assert.deepEqual((await report()).captureEditing,current,'invalid import never ends an edit');await click('choose-resume');
 for(const [width,height] of [[320,568],[390,844],[844,390],[1280,800]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#stop').isVisible(),true);}
 await page.setViewportSize({width:390,height:844});await click('discard');await page.locator('#melody-home').waitFor({state:'visible'});assert.equal(await page.locator('#home-resume').isVisible(),false);await click('home-songs');await page.locator('[data-song-open]').click();await click('song-continue');
 const restored=(await report()).captureEditing;assert.equal(restored.inputCandidate.midi,64);assert.equal(restored.undoDepth,0,'end/reopen drops Undo');
 await back();await page.locator('#melody-choose [data-screen-back]').click();await click('home-connect');assert.equal(await page.locator('#phrase-shelf button').count(),1,'song restores its phrase shelf');
 assert.deepEqual(errors,[]);console.log('navigation, empty chord switch, invalid import, save-on-exit, Undo lifecycle, phrase shelf and four widths: PASS');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
