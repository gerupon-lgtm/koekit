const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8018';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});try{
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
 const click=async id=>{await revealCreationControl(page,'#'+id);await page.locator('#'+id).click();};
 const pending=async()=>{const r=await report();return r.captureEditing.editCandidate??r.captureCandidate;};
 const recipe=p=>JSON.stringify(p.accompaniment.imageArrangement);
 await page.goto(base+'/probe/saezuri/');await click('home-create');await click('new-image');
 assert.equal(await page.locator('#image-words select').count(),3);let r=await report();assert.equal(r.captureEditing.pending,true);assert.equal(r.captureEditing.undoDepth,1);
 for(let i=0;i<12;i++)await click('image-next');r=await report();assert.equal(r.captureEditing.undoDepth,1);assert.equal(r.captureEditing.accepted,false);
 await click('preview');assert.equal(await page.locator('#image-next').isDisabled(),true);assert.equal(await page.locator('#image-word-speed').isDisabled(),true);await click('stop');await click('capture-edit-undo');assert.equal((await report()).captureEditing.pending,false);
 await click('image-next');await click('capture-edit-confirm');
 await page.locator('[data-mode="input"]').click();await revealCreationControl(page,'[data-pitch="0"]');await page.locator('[data-pitch="0"]').click();assert.equal(await page.locator('#image-next').isDisabled(),true);await click('capture-edit-confirm');
 const original=await pending();await page.locator('#composer-key').selectOption('Am');assert.equal(await page.locator('#image-next').isDisabled(),true);await click('capture-edit-confirm');await page.locator('#phrase-bars').selectOption('8');await click('capture-edit-confirm');
 await click('screen-settings');await page.locator('#tempo').fill('150');await page.locator('#tempo').dispatchEvent('change');await click('settings-close');
 await revealCreationControl(page,'#image-settings-open');await click('image-settings-open');await page.locator('#image-rhythm').selectOption('offbeat');await click('backing-settings-close');await click('capture-edit-confirm');
 await page.locator('#image-chords button').nth(1).click();await page.locator('#chord-basic button').filter({hasText:'Dm'}).click();await click('chord-confirm');
 await revealCreationControl(page,'#image-settings-open');await click('image-settings-open');await click('image-sounds');await page.locator('#sound-chord').selectOption('lead');await click('sounds-close');await click('backing-settings-close');await click('capture-edit-confirm');
 const before=await pending();await revealCreationControl(page,'#image-word-type');await page.locator('#image-word-type').selectOption('rock');await page.locator('#image-word-speed').selectOption('fast');await page.locator('#image-word-mood').selectOption('sad');
 for(let i=0;i<20;i++)await click('image-next');const after=await pending();assert.deepEqual(after.notes,original.notes);assert.deepEqual(after.key,before.key);assert.equal(after.bars,8);assert.equal(await page.locator('#tempo').inputValue(),'150');
 for(const field of ['chords','sounds','manualSettings','rhythm'])assert.deepEqual(after.accompaniment[field],before.accompaniment[field]);
 assert.deepEqual(after.accompaniment.imageChoice,{type:'rock',speed:'fast',mood:'sad'});assert.notEqual(recipe(after),recipe(before));await click('capture-edit-undo');assert.deepEqual(await pending(),before);
 await click('image-next');const adopted=await pending();await click('capture-edit-confirm');
 await click('backing-loop');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');assert.equal(await page.locator('#image-next').isDisabled(),true);await page.waitForTimeout(400);assert.equal(recipe((await report()).captureCandidate),recipe(adopted));await click('stop');
 // Real tap recording retains the adopted recipe; recording guards generation.
 await click('tap-record');assert.equal(await page.locator('#image-next').isDisabled(),true);await page.waitForTimeout(700);const key=page.locator('#piano-keys [data-midi="60"]');await key.scrollIntoViewIfNeeded();const box=await key.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height-12);await page.mouse.down();await page.waitForTimeout(210);await page.mouse.up();await click('stop');assert.equal(recipe(await pending()),recipe(adopted));assert.equal(await page.locator('#image-next').isDisabled(),true);await click('capture-edit-confirm');
 await click('image-next');const draft=await pending();await page.waitForFunction(()=>document.querySelector('#song-status')?.dataset.saved==='true');await page.reload();await click('home-songs');await page.locator('[data-song-open]').click();await click('song-continue');assert.equal(recipe(await pending()),recipe(draft));assert.equal(await page.locator('#image-next').isDisabled(),false);await click('capture-edit-undo');assert.equal(recipe(await pending()),recipe(adopted));await click('image-next');await click('capture-edit-confirm');
 for(const width of [320,390,844,1280]){
  await revealCreationControl(page,'#image-next');
  await page.setViewportSize({width,height:844});await page.evaluate(()=>window.scrollTo(0,0));assert.ok(await page.locator('#image-words').isVisible());
  const bounds=await page.locator('#image-words select').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};}));
  assert.ok(bounds.every(b=>b.left>=0&&b.right<=width&&b.height>=44));assert.ok(bounds[1].left-bounds[0].right>=7.9);assert.ok(bounds[2].left-bounds[1].right>=7.9);
  for(const id of ['image-next','preview','capture-edit-confirm','stop']){await page.locator('#'+id).scrollIntoViewIfNeeded();const box=await page.locator('#'+id).boundingBox();assert.ok(box&&box.width>=44&&box.height>=44);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.local-tools/image-mode-mobile.png',fullPage:true});
 const beforeReset=await pending();await revealCreationControl(page,'#image-settings-open');await click('image-settings-open');await click('image-reset-manual');const reset=await pending();assert.equal(reset.accompaniment.chords,undefined);assert.equal(reset.accompaniment.sounds,undefined);assert.deepEqual(reset.notes,beforeReset.notes);await click('backing-settings-close');await click('capture-edit-undo');assert.deepEqual(await pending(),beforeReset);
 // A separate free-creation session still uses the original controls/BPM preset.
 const freeContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),free=await freeContext.newPage();free.on('pageerror',e=>errors.push(e.message));await free.goto(base+'/probe/saezuri/');await free.locator('#home-create').click();await free.locator('#new-manual').click();assert.equal(await free.locator('#image-words').isVisible(),false);assert.equal(await free.locator('#image-next').isVisible(),false);await revealCreationControl(free,'#image-settings-open');await free.locator('#image-settings-open').click();await free.locator('#image-tempo').click();assert.equal(await free.locator('#tempo').inputValue(),'120');await freeContext.close();
 assert.deepEqual(errors,[]);console.log('image words, candidate replacement/undo, manual preservation, fixed loop/tap, save/reload and four mobile/desktop widths: PASS');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
