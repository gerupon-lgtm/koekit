const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8014';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const report=async()=>{await page.evaluate(()=>document.querySelector('#report').click());return JSON.parse(await page.locator('#metrics').textContent());};
 const duration=value=>page.locator(`[data-duration="${value}"]`).click();
 await page.goto(base+'/probe/saezuri/');await page.locator('#home-create').click();await page.locator('#new-manual').click();
 await page.locator('#composer-rest').waitFor({state:'visible'});
 assert.equal(await page.locator('#composer-duration').isVisible(),false);assert.equal(await page.locator('#composer-length-buttons svg').count(),4);assert.equal(await page.locator('#composer-rest').isVisible(),true);
 await duration(.5);assert.equal((await report()).captureEditing.pending,false);
 await page.locator('[data-pitch="0"]').click();let r=await report();assert.equal(r.captureEditing.inputCandidate.durationTick,2);assert.equal(r.captureCandidate.notes.length,0);
 await duration(2);r=await report();assert.equal(r.captureEditing.inputCandidate.durationTick,8);assert.equal(r.captureEditing.inputCursor,0);
 await page.locator('[data-pitch="2"]').click();r=await report();assert.equal(r.captureEditing.inputCandidate.durationTick,8);assert.equal(r.captureEditing.inputCandidate.midi,64);await page.locator('#capture-edit-confirm').click();
 assert.equal(await page.locator('[data-duration="2"]').getAttribute('aria-pressed'),'true');await page.locator('[data-pitch="4"]').click();assert.equal((await report()).captureEditing.inputCandidate.durationTick,8);await page.locator('#capture-edit-confirm').click();
 await duration(.5);await page.locator('#composer-rest').click();assert.equal((await report()).captureEditing.inputCandidate.midi,null);await page.locator('#capture-edit-confirm').click();assert.equal((await report()).captureEditing.inputCursor,18);
 await page.locator('#composer-other-lengths summary').click();await page.locator('#composer-other-duration').selectOption('1.5');await page.locator('[data-pitch="1"]').click();assert.match(await page.locator('#composer-candidate').textContent(),/1拍半/);await page.locator('#capture-edit-confirm').click();await page.locator('#composer-other-lengths summary').click();
 for(const [width,height] of [[320,568],[360,800],[390,844],[412,915],[844,390],[1280,800]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.ok(await page.locator('#composer-length-buttons').evaluate(n=>[...n.children].every(b=>b.scrollWidth<=b.clientWidth)));}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local-tools/saezuri-v25-duration.png',fullPage:true});
 await page.locator('#preview').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');assert.equal(await page.locator('[data-duration="1"]').isDisabled(),true);await page.locator('#stop').click();assert.equal(await page.locator('[data-duration="1"]').isEnabled(),true);
 assert.deepEqual(errors,[]);console.log('PASS duration: either selection order, candidate-only updates, persistent length, half rest, other lengths, playback lock and 6 widths');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
