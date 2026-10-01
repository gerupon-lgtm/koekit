const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try {
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
 await page.goto((process.env.SAEZURI_BASE||'http://127.0.0.1:8014')+'/probe/saezuri/');
 await page.locator('#home-create').click();await page.locator('#new-image').click();
 await page.locator('#phrase-shape #composer-key').waitFor({state:'visible'});
 assert.equal(await page.locator('#composer-key').inputValue(),'C');assert.equal(await page.locator('#phrase-bars').inputValue(),'4');
 await page.locator('#capture-edit-confirm').click();const original=(await report()).captureCandidate.notes;
 await page.locator('#composer-key').selectOption('Am');let r=await report();
 assert.equal(r.captureCandidate.key.mode,'major');assert.equal(r.captureEditing.editCandidate.key.mode,'minor');
 assert.equal(r.captureEditing.pending,true);assert.equal(await page.locator('#backing-loop').isDisabled(),true);
 assert.deepEqual(r.captureEditing.editCandidate.notes,original);
 await page.locator('#capture-edit-confirm').click();assert.equal((await report()).captureCandidate.key.mode,'minor');
 await revealCreationControl(page,'#image-suggest');await page.locator('#image-suggest').click();assert.match(await page.locator('.suggestion-row').first().textContent(),/Am → Dm → E → Am/);await page.locator('#progression-close').click();
 await page.locator('#phrase-bars').selectOption('8');r=await report();assert.equal(r.captureCandidate.bars,4);assert.equal(r.captureEditing.editCandidate.bars,8);
 await page.locator('#capture-edit-undo').click();assert.equal(await page.locator('#phrase-bars').inputValue(),'4');
 await page.locator('#phrase-bars').selectOption('8');await page.locator('#capture-edit-confirm').click();
 await page.locator('[data-mode="input"]').click();await page.locator('#screen-settings').click();await page.locator('#creation-settings > details > summary').first().click();await page.locator('#composer-bar').selectOption('5');await page.locator('#settings-close').click();
 await revealCreationControl(page,'[data-pitch="0"]');await page.locator('[data-pitch="0"]').click();assert.equal(await page.locator('#composer-key').isDisabled(),true);assert.equal(await page.locator('#phrase-bars').isDisabled(),true);await page.locator('#capture-edit-confirm').click();
 const long=(await report()).captureCandidate;assert.equal(long.notes[0].startTick,64);
 await page.locator('#phrase-bars').selectOption('4');r=await report();assert.equal(r.captureCandidate.bars,8);assert.deepEqual(r.captureCandidate.notes,long.notes);assert.equal(r.captureEditing.editCandidate.notes.length,0);assert.match(await page.locator('#phrase-shape-hint').textContent(),/後半4小節/);
 await page.locator('#capture-edit-undo').click();assert.equal(await page.locator('#phrase-bars').inputValue(),'8');assert.deepEqual((await report()).captureCandidate.notes,long.notes);
 await page.locator('#phrase-bars').selectOption('4');await page.locator('#capture-edit-confirm').click();assert.equal((await report()).captureCandidate.bars,4);
 await page.locator('#capture-edit-undo').click();assert.equal(await page.locator('#phrase-bars').inputValue(),'8');r=await report();assert.deepEqual(r.captureEditing.editCandidate.notes,long.notes);assert.equal(r.captureCandidate.bars,4);await page.locator('#capture-edit-confirm').click();
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
  await page.setViewportSize(viewport);
  for(const mode of ['input','edit','backing']){
   await page.locator(`[data-mode="${mode}"]`).click();
   assert.equal(await page.locator('#composer-key').isVisible(),true);assert.equal(await page.locator('#phrase-bars').isVisible(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${viewport.width} ${mode}: no horizontal overflow`);
   const boxes=await page.locator('#phrase-shape select').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,height:b.height};}));
   assert.ok(Math.abs(boxes[0].top-boxes[1].top)<1,'controls stay in one row');assert.ok(boxes.every(b=>b.left>=0&&b.right<=viewport.width&&b.height>=44));
   if(mode==='backing'&&viewport.width===390){await page.evaluate(()=>{document.querySelector('#step-entry').open=false;document.querySelector('#keyboard-more').open=false;window.scrollTo(0,0);});for(const id of ['piano-keys','stop']){const b=await page.locator('#'+id).boundingBox();assert.ok(b&&b.y+b.height<=viewport.height,`${id} visible without scrolling`);}}
   if(mode==='backing'&&[320,390].includes(viewport.width))await page.screenshot({path:`.local-tools/saezuri-phrase-shape-${viewport.width}.png`});
  }
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#preview').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');assert.equal(await page.locator('#phrase-bars').isDisabled(),true);assert.equal(await page.locator('#composer-key').isDisabled(),true);await page.locator('#stop').click();
 assert.deepEqual(errors,[]);console.log('PASS front key/bars: minor recommendations, provisional changes, shortening warning, Undo, note-entry/playback gates, four widths');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
