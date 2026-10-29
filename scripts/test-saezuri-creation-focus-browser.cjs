const {chromium,webkit}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026',layoutOnly=process.env.SAEZURI_BROWSER==='webkit';
(async()=>{const browser=layoutOnly?await webkit.launch({headless:true,executablePath:process.env.SAEZURI_WEBKIT_PATH}):await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});try{
 const results=[],folder='.local-tools/free-layout-20261029';fs.mkdirSync(folder,{recursive:true});
 for(const [width,height] of [[320,568],[390,740],[412,840],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},permissions:layoutOnly?[]:['microphone'],serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestedContexts=[];window.micRequests=0;if(typeof AudioContext!=='function')return;const Native=AudioContext;window.AudioContext=class extends Native{constructor(options){super(options);requestedContexts.push(options.latencyHint);}};const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>{micRequests++;return original(...args);};});
  const click=id=>page.locator('#'+id).click();
  const report=async()=>{await page.locator('#report').evaluate(n=>n.click());const r=JSON.parse(await page.locator('#metrics').textContent());return {pattern:r.captureCandidate,edit:r.captureEditing};};
  const fits=selectors=>page.evaluate(selectors=>{const footer=document.querySelector('body>footer').getBoundingClientRect().top;return selectors.map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {selector,top:r.top,bottom:r.bottom,within:r.top>=0&&r.bottom<=footer-8,width:r.width,height:r.height};});},selectors);
  await page.goto(base+'/probe/saezuri/');await click('home-create');await click('new-manual');await page.locator('#piano-keys').waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>scrollTo(0,0));
  assert.equal(await page.locator('#creation-input-display').isVisible(),false);assert.equal(await page.locator('#composer-key').isVisible(),true);assert.equal(await page.locator('#phrase-bars').isVisible(),true);
  const idle=await fits(['#tap-record','#loop-record','#instrument','#piano-keys','.keyboard-octaves']);
  if(width<650&&height>=740)for(const box of idle)assert.ok(box.within,`free practice fits: ${JSON.stringify({width,height,...box})}`);
  const original=await report();await click('creation-options-toggle');await page.locator('#creation-note-display').selectOption('cards');assert.equal(await page.locator('#composition-cards').isVisible(),true);await page.locator('#creation-note-display').selectOption('score');await click('creation-options-toggle');assert.deepEqual(await report(),original,'opening display/voice controls leaves notes, cursor, candidate and undo unchanged');
  await page.screenshot({path:folder+`/idle-${width}.png`});
  if(!layoutOnly){
   await click('tap-record');await page.waitForFunction(()=>document.body.classList.contains('recording-focus')&&scrollY===0);
   for(const id of ['creation-setup','creation-tabs','keyboard-instrument','keyboard-options','phrase-tools'])assert.equal(await page.locator('#'+id).isVisible(),false,`${id} is out of the recording surface`);
   const active=await fits(['#capture-score','#recording-guide','#keyboard-status','#piano-keys','.keyboard-octaves']);for(const box of active)assert.ok(box.within,`recording fits: ${JSON.stringify({width,height,...box})}`);
   assert.equal(await page.locator('#recording-chords > *').count(),4);assert.equal(await page.locator('#stop').isEnabled(),true);await page.screenshot({path:folder+`/active-${width}.png`});
   await page.waitForFunction(()=>document.querySelector('#recording-guide').dataset.mode==='tap');
   const key=page.locator('#piano-keys [data-midi="60"]'),r=await key.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height-12);await page.mouse.down();await page.waitForTimeout(180);await page.mouse.up();await click('stop');await page.waitForFunction(()=>!document.body.classList.contains('recording-focus'));
   const take=await report();assert.equal(take.pattern.notes.length,0,'stop stages the take without changing the accepted melody');assert.ok(take.edit.editCandidate.notes.length>0);assert.equal(take.edit.pending,true);assert.equal(await page.locator('#creation-options-toggle').isVisible(),true);assert.equal(await page.locator('#capture-edit-confirm').isVisible(),true);await click('capture-edit-confirm');assert.equal((await report()).edit.pending,false);assert.equal(await page.evaluate(()=>micRequests),0,'tap practice/recording does not open the microphone');
   if(width===390){
    // Keep the card notation while recording; only the settings disappear.
    await click('creation-options-toggle');await page.locator('#creation-note-display').selectOption('cards');await click('creation-options-toggle');
    await click('loop-record');await page.waitForFunction(()=>document.body.classList.contains('recording-focus'));assert.equal(await page.locator('#composition-cards').isVisible(),true);assert.equal(await page.locator('#recording-guide').isVisible(),true);assert.equal(await page.locator('#keyboard-status').isVisible(),true);assert.equal(await page.locator('#piano-keys').isVisible(),false);assert.equal(await page.locator('.keyboard-octaves').isVisible(),false);await click('stop');assert.equal(await page.locator('#creation-input-display').isVisible(),false);assert.equal(await page.locator('#composition-cards').isVisible(),true);
    await click('creation-options-toggle');await page.locator('#creation-input-display').selectOption('keyboard');await page.locator('#creation-note-display').selectOption('score');await click('creation-options-toggle');
   }
   assert.deepEqual(await page.evaluate(()=>[...new Set(requestedContexts)]),['interactive'],'layout keeps keyboard and recording on the existing live clock');
  }
  // Leaving free creation restores the real image/tutorial controls in place.
  await page.locator('#melody-create [data-screen-back]').click();await click('new-image');await page.locator('#image-words').waitFor({state:'visible'});assert.equal(await page.locator('#creation-options-toggle').isVisible(),false);await click('capture-edit-confirm');await page.locator('#piano-keys').waitFor({state:'visible'});await click('image-edit-tools-toggle');await page.locator('#creation-displays').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);results.push({width,height,idle});await page.close();
 }
 console.log(JSON.stringify({result:'PASS',base,browser:layoutOnly?'WebKit layout only':'Chrome recording and layout',results}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
