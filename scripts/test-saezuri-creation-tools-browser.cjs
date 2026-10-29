const {chromium,webkit}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026',layoutOnly=process.env.SAEZURI_BROWSER==='webkit';
(async()=>{const browser=layoutOnly?await webkit.launch({headless:true,executablePath:process.env.SAEZURI_WEBKIT_PATH}):await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const results=[],folder='.local-tools/recording-count-in-20261030';fs.mkdirSync(folder,{recursive:true});
 for(const [width,height] of [[320,568],[390,740],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const report=async()=>{await page.locator('#report').evaluate(n=>n.click());const r=JSON.parse(await page.locator('#metrics').textContent());return {pattern:r.captureCandidate,edit:r.captureEditing};};
  await page.goto(base+'/probe/saezuri/');await page.locator('#home-create').click();await page.locator('#new-manual').click();await page.locator('#piano-keys').waitFor({state:'visible'});
  await page.locator('#creation-options-toggle').click();await page.locator('#creation-input-display').selectOption('cards');await page.locator('#creation-options-toggle').click();
  assert.equal(await page.locator('#composer-keys').isVisible(),true);assert.equal(await page.locator('#keyboard-practice-tools').isVisible(),true);assert.equal(await page.locator('#piano-keys').isVisible(),false);
  const original=await report();
  for(const mode of ['edit','backing']){
   await page.locator(`[data-mode="${mode}"]`).click();await page.evaluate(()=>scrollTo(0,0));
   assert.equal(await page.locator('#keyboard-practice-tools').getAttribute('open'),null);assert.equal(await page.locator('#piano-keys').isVisible(),false);assert.equal(await page.locator('#tap-record').isVisible(),false);assert.equal(await page.locator('.keyboard-octaves').isVisible(),false);assert.equal(await page.locator('#instrument').isVisible(),true,'the melody instrument stays on the front screen');
   if(mode==='edit'){assert.equal(await page.locator('.note-navigation').isVisible(),false,'an empty melody has no selectable notes');assert.equal(await page.locator('#capture-pitch-up').isVisible(),false);}
   assert.deepEqual(await report(),original);await page.screenshot({path:folder+`/closed-${mode}-${width}.png`,fullPage:true});
   await page.locator('#keyboard-practice-tools>summary').click();assert.equal(await page.locator('#piano-keys').isVisible(),true,'opening works even when card input was selected');assert.equal(await page.locator('#tap-record').isVisible(),true);assert.equal(await page.locator('#loop-record').isVisible(),true);assert.equal(await page.locator('.keyboard-octaves').isVisible(),true);
   assert.equal(await page.locator('#keyboard-status').isVisible(),true,'opened practice keeps its live status visible with card input too');
   assert.ok(await page.evaluate(()=>document.querySelector('.keyboard-actions button').getBoundingClientRect().top-document.querySelector('#keyboard-practice-tools>summary').getBoundingClientRect().bottom)>=7.9,'the disclosure and recording buttons have an eight-pixel gap');
   if(!layoutOnly&&width===390){
    await page.locator('.keyboard-octaves').evaluate(n=>{const bottom=n.getBoundingClientRect().bottom,footer=document.querySelector('body>footer').getBoundingClientRect().top;if(bottom>footer-8)scrollBy(0,bottom-footer+8);});
    const r=await page.locator('#piano-keys [data-midi="60"]').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height-12);await page.mouse.down();assert.equal(await page.locator('#piano-keys [data-held]').count(),1);
    await page.locator('#keyboard-practice-tools>summary').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('#piano-keys [data-held]'));await page.mouse.up();assert.deepEqual(await report(),original,'closing practice releases a held key without changing the song');
   }else await page.locator('#keyboard-practice-tools>summary').click();
   assert.equal(await page.locator('#piano-keys').isVisible(),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  if(!layoutOnly&&width===390){
   await page.locator('#keyboard-practice-tools>summary').click();await page.locator('#tap-record').click();await page.waitForFunction(()=>document.body.classList.contains('recording-focus'));assert.equal(await page.locator('#piano-keys').isVisible(),true);assert.equal(await page.locator('#recording-guide').isVisible(),true);assert.equal(await page.locator('#keyboard-practice-tools>summary').isVisible(),false);await page.locator('#stop').click();assert.equal(await page.locator('#instrument').isVisible(),true);assert.equal(await page.locator('#keyboard-practice-tools').getAttribute('open'),'');await page.locator('#keyboard-practice-tools>summary').click();
  }
  // Returning to note-by-note entry restores those controls in their normal place.
  await page.locator('[data-mode="input"]').click();await page.locator('#creation-options-toggle').click();await page.locator('#creation-input-display').selectOption('cards');await page.locator('#creation-options-toggle').click();assert.equal(await page.locator('#composer-keys').isVisible(),true);assert.deepEqual(await report(),original);
  if(!layoutOnly&&width===390){await page.locator('[data-pitch="0"]').click();await page.locator('#capture-edit-confirm').click();await page.locator('[data-mode="edit"]').click();assert.equal(await page.locator('#capture-pitch-up').isVisible(),true);assert.equal(await page.locator('#capture-pitch-up').isEnabled(),true);assert.equal(await page.locator('.note-navigation').isVisible(),true);assert.equal(await page.locator('#piano-keys').isVisible(),false);}
  assert.deepEqual(errors,[]);results.push({width,height});await page.close();
 }
 console.log(JSON.stringify({result:'PASS',base,browser:layoutOnly?'WebKit UI only':'Chrome UI and practice',checks:layoutOnly?'closed by default, optional keyboard with either input display, front instrument, empty-note actions hidden, entry restored, unchanged data':'closed by default, optional keyboard with either input display, front instrument, note actions match data, held-key release, recording and restore, unchanged data',results}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
