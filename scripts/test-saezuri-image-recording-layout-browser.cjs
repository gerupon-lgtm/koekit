const {chromium,webkit}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
const layoutOnly=process.env.SAEZURI_BROWSER==='webkit';
(async()=>{const browser=layoutOnly?await webkit.launch({headless:true,executablePath:process.env.SAEZURI_WEBKIT_PATH}):await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});try{
 const results=[];fs.mkdirSync('.local-tools/image-recording-layout-20261018',{recursive:true});
 for(const [width,height] of [[320,568],[390,740],[412,840],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},permissions:layoutOnly?[]:['microphone'],serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('saezuri.creationDisplays.v1',JSON.stringify({note:'score',input:'cards'}));window.requestedContexts=[];if(typeof AudioContext!=='function')return;const Native=AudioContext;window.AudioContext=class extends Native{constructor(options){super(options);requestedContexts.push(options.latencyHint);}};});
  const click=id=>page.locator('#'+id).click();
  const report=async()=>{await page.locator('#report').evaluate(n=>n.click());const value=JSON.parse(await page.locator('#metrics').textContent());return {pattern:value.captureCandidate,edit:value.captureEditing};};
  const viewport=ids=>page.evaluate(ids=>{const footer=document.querySelector('body > footer').getBoundingClientRect();return Object.fromEntries(ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return[id,{top:r.top,bottom:r.bottom,within:r.top>=0&&r.bottom<=footer.top-7}];}));},ids);
  await page.goto(base+'/probe/saezuri/');await click('home-create');await click('new-image');await page.locator('#image-words').waitFor({state:'visible'});
  const choosing=await viewport(['capture-edit-confirm']);
  if(width<650)assert.ok(choosing['capture-edit-confirm'].within,'choose and confirm accompaniment without scrolling to buried controls');
  assert.equal(await page.locator('#image-genre').isVisible(),false,'word choices do not repeat the detailed genre/rhythm controls');
  assert.equal(await page.locator('#creation-displays').isVisible(),false,'display settings are not a prerequisite for recording');
  assert.equal(await page.locator('#piano-keys').isVisible(),false,'recording controls follow accompaniment confirmation');
  await page.screenshot({path:`.local-tools/image-recording-layout-20261018/choosing-${width}.png`});
  await click('capture-edit-confirm');await page.locator('#piano-keys').waitFor({state:'visible'});
  assert.equal(await page.locator('body').getAttribute('data-input-display'),'keyboard','recording starts with the keyboard even if card input was remembered');
  assert.equal(await page.locator('#image-words').isVisible(),false);assert.equal(await page.locator('#creation-tabs').isVisible(),false);assert.equal(await page.locator('#creation-displays').isVisible(),false);
  assert.equal(await page.locator('#capture-score').isVisible(),false,'an empty staff does not push recording controls away');
  assert.equal(await page.locator('#composer-key').isVisible(),false);assert.equal(await page.locator('#phrase-bars').isVisible(),false);
  assert.equal(await page.locator('#instrument').isVisible(),true);assert.equal(await page.locator('#tap-record').isEnabled(),true);assert.equal(await page.locator('#loop-record').isEnabled(),true);
  const ready=await viewport(['tap-record','loop-record','instrument','piano-keys']);
  if(width<650){for(const [id,box] of Object.entries(ready))assert.ok(box.within,`${id} is reachable on the first recording screen`);assert.equal(await page.evaluate(()=>scrollY),0,'confirmation keeps the header and recording controls together');}
  const before=await report();await click('image-choice-reopen');await page.locator('#image-words').waitFor({state:'visible'});assert.deepEqual(await report(),before,'reopening accompaniment changes no song or history');
  await click('image-record-return');await page.locator('#piano-keys').waitFor({state:'visible'});assert.deepEqual(await report(),before,'return without changing accompaniment leaves the song and history intact');await click('image-choice-reopen');
  await click('image-next');await click('capture-edit-confirm');await page.locator('#piano-keys').waitFor({state:'visible'});
  if(width===390&&!layoutOnly){
   await click('image-choice-reopen');await page.locator('#backing-loop').evaluate(n=>n.click());await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');assert.equal(await page.locator('#piano-keys').isVisible(),true,'voice loop start leaves a reopened settings view for the recording surface');await click('stop');
   // One recording button starts the backing and the take. No loop or display setup.
   await click('tap-record');await page.waitForFunction(()=>document.body.classList.contains('keyboard-recording')&&document.querySelector('#keyboard-status').textContent.startsWith('タップ録音中'));
   assert.equal(await page.locator('#loop-record').isDisabled(),true);assert.equal(await page.locator('#instrument').isDisabled(),true);
   const key=page.locator('#piano-keys [data-midi="60"]');await key.scrollIntoViewIfNeeded();const r=await key.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height-12);await page.mouse.down();assert.equal(await key.getAttribute('data-held'),'','the visible key receives the press');await page.waitForTimeout(180);await page.mouse.up();await click('stop');
   const take=await report();assert.ok(take.edit.editCandidate.notes.length>0);assert.equal(take.pattern.notes.length,0,'the take stays a candidate until OK');assert.equal(take.edit.pending,true);assert.equal(await page.locator('#capture-edit-confirm').isVisible(),true,'recorded notes retain audition and explicit confirmation');
   await click('capture-edit-confirm');const adopted=await report();assert.equal(adopted.edit.pending,false);
   await click('loop-record');await page.waitForFunction(()=>['count-in','recording'].includes(document.querySelector('#status').dataset.state));
   assert.equal(await page.locator('#piano-keys').isVisible(),false,'humming and keyboard recording stay exclusive');assert.equal(await page.locator('#tap-record').isDisabled(),true);await click('stop');
   assert.deepEqual((await report()).pattern,adopted.pattern,'cancelled humming leaves the accepted melody');assert.deepEqual(await page.evaluate(()=>[...new Set(requestedContexts)]),['interactive']);
   await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');await page.reload();await click('home-songs');await page.locator('[data-song-open]').first().click();if(await page.locator('#song-continue').isVisible())await click('song-continue');
   await page.locator('#piano-keys').waitFor({state:'visible'});assert.equal(await page.locator('#image-words').isVisible(),false);assert.equal(await page.locator('#creation-tabs').isVisible(),false);
  }
  await page.screenshot({path:`.local-tools/image-recording-layout-20261018/recording-${width}.png`});
  await click('image-edit-tools-toggle');await page.locator('#creation-displays').waitFor({state:'visible'});const viewBefore=await report();
  await page.locator('#creation-note-display').selectOption('cards');await page.locator('#creation-input-display').selectOption('cards');assert.deepEqual(await report(),viewBefore,'display preferences remain independent from music');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);results.push({width,height,choosing,ready});await context.close();
 }
 console.log(JSON.stringify({result:'PASS',base,browser:layoutOnly?'WebKit layout only':'Chrome layout and recording',checks:layoutOnly?'four sizes, word choices and confirmation, direct access to keyboard/record buttons, optional views, no overflow':'word choices then direct recording; no required loop/display setup; tap/hum reuse; confirmation/save/restore; independent optional views; four sizes',results}));
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
