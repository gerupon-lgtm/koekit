const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8020';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:760},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  await page.addInitScript(()=>{window.voices=[];const make=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){const node=make.call(this),voice={ended:false};window.voices.push(voice);node.addEventListener('ended',()=>voice.ended=true);return node;};});
  const click=id=>page.locator('#'+id).click();
  const report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
  await page.goto(base+'/probe/saezuri/');await click('home-create');await click('new-image');
  await page.locator('#image-words').waitFor({state:'visible'});
  if(await page.locator('#mic').getAttribute('aria-pressed')==='true')await click('mic');
  await page.locator('#phrase-bars').selectOption('8');await click('capture-edit-confirm');
  assert.equal(await page.locator('#image-words').isVisible(),false);assert.equal(await page.locator('#image-next').isVisible(),false);
  assert.equal(await page.locator('#image-choice-reopen').isVisible(),true);assert.equal(await page.locator('#composer-key').isVisible(),true);assert.equal(await page.locator('#phrase-bars').isVisible(),true);
  assert.equal(await page.locator('#instrument').isVisible(),true);assert.equal(await page.locator('#instrument').isEnabled(),true);assert.equal(await page.locator('#instrument').count(),1);
  const visible=await page.evaluate(()=>{const key=document.querySelector('#piano-keys').getBoundingClientRect(),oct=document.querySelector('.keyboard-octaves').getBoundingClientRect(),stop=document.querySelector('body > footer').getBoundingClientRect();return key.top>=0&&oct.bottom<=stop.top-7;});
  assert.equal(visible,true,'confirmation gives access to the keyboard and octave controls above the fixed stop');
  const adopted=await report();await click('image-choice-reopen');assert.equal(await page.locator('#image-words').isVisible(),true);assert.deepEqual((await report()).captureCandidate,adopted.captureCandidate,'reopening changes no song data');
  await click('image-next');await click('capture-edit-confirm');assert.equal(await page.locator('#image-words').isVisible(),false);
  const beforeTone=(await report()).captureEditing;await page.locator('#instrument').selectOption('sine');assert.deepEqual((await report()).captureEditing,beforeTone,'front tone selection changes no notes or edit history');
  const key=page.locator('#piano-keys [data-midi="60"]');await key.scrollIntoViewIfNeeded();const box=await key.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height-10);await page.mouse.down();await page.waitForTimeout(180);
  assert.equal(await page.evaluate(()=>voices.filter(voice=>!voice.ended).length),1,'practice uses the selected sine tone');await page.mouse.up();await page.waitForFunction(()=>voices.every(voice=>voice.ended));
  await click('backing-loop');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
  assert.equal(await page.locator('#instrument').isDisabled(),true);assert.equal(await page.locator('#image-words').isVisible(),false);assert.equal(await page.locator('#image-choice-reopen').isDisabled(),true);await click('stop');assert.equal(await page.locator('#instrument').isEnabled(),true);
  await click('screen-settings');assert.equal(await page.locator('#melody-settings #instrument').count(),1);await page.locator('#instrument').selectOption('strings');await click('settings-close');await page.locator('#keyboard-instrument #instrument').waitFor({state:'visible'});assert.equal(await page.locator('#keyboard-instrument #instrument').count(),1);
  await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');await page.reload();await click('home-songs');await page.locator('[data-song-open]').first().click();if(await page.locator('#song-continue').isVisible())await click('song-continue');
  assert.equal(await page.locator('#instrument').inputValue(),'strings');assert.equal(await page.locator('#image-words').isVisible(),false);
  for(const width of [320,390,844,1280]){
   await page.setViewportSize({width,height:760});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const layout=await page.locator('.keyboard-heading').evaluate(node=>{const status=node.querySelector('#keyboard-status').getBoundingClientRect(),field=node.querySelector('select').getBoundingClientRect();return {gap:field.left-status.right,height:field.height,rowHeight:node.getBoundingClientRect().height};});assert.ok(layout.gap>=7.9);assert.ok(layout.height>=44);assert.ok(layout.rowHeight<=48,'tone and practice status share one compact row');
  }
  await page.setViewportSize({width:390,height:760});await click('image-choice-reopen');await click('image-next');await click('capture-edit-confirm');fs.mkdirSync('.local-tools/keyboard-access-20261010',{recursive:true});await page.screenshot({path:'.local-tools/keyboard-access-20261010/confirmed.png'});
  await click('image-choice-reopen');await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.local-tools/keyboard-access-20261010/choosing.png',fullPage:true});
  assert.deepEqual(errors,[]);await context.close();console.log('PASS image confirmation/collapse/reopen, direct keyboard access, front tone/real held voice, loop lock, one reused selector, save/reload and four widths; PC Chrome only');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
