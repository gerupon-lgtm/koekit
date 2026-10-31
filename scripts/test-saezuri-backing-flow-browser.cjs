const {chooseBackingRhythm,chooseBackingGenre,chooseProgression}=require('./saezuri-browser-controls.cjs');
const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const {revealCreationControl,openProjectPart}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage({viewport:{width:390,height:740},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const click=selector=>page.locator(selector).click(),report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
 await page.goto(base+'/probe/saezuri/');await click('#home-create');await click('#sequence-create');await click('#new-manual');
 await revealCreationControl(page,'[data-pitch="0"]');await click('[data-pitch="0"]');await click('#capture-edit-confirm');
 const original=(await report()).captureCandidate.notes;
 await click('[data-mode="backing"]');
 assert.equal(await page.locator('#image-genre').isVisible(),false);assert.equal(await page.locator('#image-rhythm').isVisible(),false);assert.equal(await page.locator('#image-suggest').isVisible(),true);await click('#image-settings-open');await page.locator('#image-enabled').check();await click('#backing-settings-close-bottom');await click('#capture-edit-confirm');
 const {PRESETS}=await import('../saezuri/music/accompaniment.js');
 for(const genre of ['nursery','pop','rock','ballad']){
  await chooseBackingGenre(page,genre);assert.equal(await page.locator('#image-rhythm').inputValue(),PRESETS[genre].rhythm);
  await click('#image-suggest');assert.equal(await page.locator('#progression-choice option').count(),4);
  const before=(await report()).captureEditing;
  await page.locator('#progression-choice').selectOption('3');await click('#progression-listen-candidate');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
  assert.deepEqual((await report()).captureEditing,before,'audition keeps the current candidate and history');await click('#progression-stop');
  if(await page.locator('#progression-use').isDisabled())for(const value of ['0','1','2']){await page.locator('#progression-choice').selectOption(value);if(await page.locator('#progression-use').isEnabled())break;}await click('#progression-use');assert.equal(await page.locator('#progression-suggestions').isVisible(),false);
  let r=await report();assert.equal(r.captureEditing.pending,true);assert.deepEqual(r.captureEditing.editCandidate.notes,original);assert.equal(r.captureEditing.editCandidate.accompaniment.genre,genre);
  await click('#capture-edit-confirm');r=await report();assert.equal(r.captureCandidate.accompaniment.genre,genre);assert.equal(r.captureCandidate.accompaniment.enabled,true);assert.deepEqual(r.captureCandidate.notes,original);
 }
 await chooseBackingGenre(page,'pop');await chooseBackingRhythm(page,'tutorial');await click('#image-suggest');await chooseProgression(page,'home');await click('#progression-use');await click('#capture-edit-confirm');
 assert.match(await page.locator('#image-summary').textContent(),/ポップ・はずむ8ビート/);assert.deepEqual((await report()).captureCandidate.notes,original);
 await page.screenshot({path:'.local-tools/shared-backing-production.png',fullPage:true});
 await click('[data-mode="input"]');await revealCreationControl(page,'#image-settings-open');await click('#image-settings-open');
 assert.equal(await page.locator('#image-genre').isVisible(),false,'genre edits stay outside orchestration settings');assert.equal(await page.locator('#image-rhythm').isVisible(),true);assert.equal(await page.locator('#image-genre').count(),1);await click('#backing-settings-close');
 await click('[data-mode="backing"]');
 for(const [width,height] of [[320,568],[390,640],[1280,800]]){
  await page.setViewportSize({width,height});await click('#image-suggest');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const close=await page.locator('#progression-close').boundingBox(),stop=await page.locator('#progression-stop').boundingBox(),sheet=await page.locator('#progression-suggestions').boundingBox();
  assert.ok(close.y>=0&&close.y+close.height<height);assert.ok(stop.y>=0&&stop.y+stop.height<=height);assert.ok(stop.width>=44);
  const controls=await page.locator('.progression-listen').locator('button').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};}));assert.ok(controls[1].left-controls[0].right>=7);
  await click('#progression-close');
 }
 const image=await browser.newPage({viewport:{width:390,height:740},serviceWorkers:'block'});image.on('pageerror',e=>errors.push(e.message));await image.goto(base+'/probe/saezuri/');await image.locator('#home-create').click();await image.locator('#sequence-create').click();await image.locator('#new-image').click();await image.locator('#image-word-type').selectOption('pop');
 for(let i=0;i<8;i++)await image.locator('#image-next').click();
 const imageReport=async()=>{await image.locator('#report').evaluate(n=>n.click());return JSON.parse(await image.locator('#metrics').textContent());};
 assert.equal((await imageReport()).captureEditing.editCandidate.accompaniment.imageArrangement.patternId,'pop-eight-beat');await image.locator('#capture-edit-confirm').click();await image.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');
 await image.reload();await image.locator('#home-songs').click();await image.locator('[data-song-open]').click();if(await image.locator('#song-continue').isVisible())await image.locator('#song-continue').click();await openProjectPart(image);await image.locator('#melody-create').waitFor({state:'visible'});assert.equal((await imageReport()).captureCandidate.accompaniment.imageArrangement.patternId,'pop-eight-beat');
 assert.deepEqual(errors,[]);console.log('PASS shared production genre selectors, all four genres and fourth candidates, pop pattern and saved image variant, audition/stage/confirm, practice access and sheet layout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
