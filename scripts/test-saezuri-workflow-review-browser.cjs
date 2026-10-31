const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});let failures=0;
 async function check(name,registered,action){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(5000);
  try{
   await page.goto(base+'/probe/saezuri/');await page.locator('#home-songs').waitFor();
   await page.evaluate(async registered=>{const {SongStore}=await import('/saezuri/song-store.js'),{blankPattern}=await import('./entry-session.js'),{emptySequence,keepPhrase}=await import('./sequence-session.js'),{openEditSession,confirmEditSession}=await import('./edit-session.js'),{songCheckpoint}=await import('./song-session.js');const p={...blankPattern(),notes:[{id:'n',midi:60,startTick:0,durationTick:4}]};await new SongStore().save('review-song',{title:'保存保護',checkpoint:songCheckpoint(confirmEditSession(openEditSession(p))),sequence:registered?keepPhrase(emptySequence(),p,'A'):emptySequence(),sequenceDraft:null,placementDraft:null,settings:{tempo:100,instrument:'fm-piano'},navigation:{screen:'create',mode:'input'}});},registered);
   await page.locator('#home-songs').click();await page.locator('[data-song-open="review-song"]').click();await page.locator('#melody-create').waitFor({state:'visible'});
   await action(page);console.log('PASS '+name);
  }catch(e){failures++;console.error('FAIL '+name+': '+e.message.split('\n').slice(0,5).join(' '));}
  finally{await page.evaluate(()=>window.releaseReviewSave?.()).catch(()=>{});await context.close();}
 }
 const saved=p=>p.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');
 const failSave=async p=>{
  await p.evaluate(()=>{window.nativeReviewPut=IDBObjectStore.prototype.put;window.failedReviewPuts=0;IDBObjectStore.prototype.put=function(...args){if(this.name==='songs'){window.failedReviewPuts++;throw new DOMException('full','QuotaExceededError');}return window.nativeReviewPut.apply(this,args);};});
  await p.locator('#work-connect').click();await p.locator('#melody-connect [data-screen-back]').click();await p.locator('#song-failure').waitFor({state:'visible'});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 };
 try{
  await check('unregistered current phrase survives another-phrase request',false,async p=>{
   await p.locator('#work-connect').click();await p.locator('#sequence-create').click();if(await p.locator('#melody-choose').isVisible())await p.locator('#new-manual').click();await saved(p);
   const r=await p.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return new SongStore().get('review-song');});
   assert.ok(r,'the saved current-only song must still exist');assert.equal(r.data.checkpoint.confirmed.pattern.notes[0].midi,60);assert.equal(await p.locator('#melody-create').isVisible(),true);assert.match(await p.locator('#phrase-feedback').textContent(),/登録/);
  });
  for(const source of ['new-manual','new-image'])await check(source+' keeps existing tempo',true,async p=>{await p.locator('#work-connect').click();await p.locator('#sequence-create').click();await p.locator('#'+source).click();await p.locator('#melody-create').waitFor({state:'visible'});assert.equal(await p.locator('#tempo').inputValue(),'100');await saved(p);const r=await p.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return new SongStore().get('review-song');});assert.equal(r.data.settings.tempo,100);assert.equal(r.data.sequence.patterns[0].notes[0].midi,60);});
  await check('failure dialog does not resubmit an unchanged failed save',true,async p=>{await failSave(p);assert.equal(await p.evaluate(()=>window.failedReviewPuts),1);});
  await check('retry blocks discard, close and Escape until storage settles',true,async p=>{
   await failSave(p);await p.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(r=>/\/saezuri\/song-store\.js\?/.test(r.name)).name,{SongStore}=await import(url);window.reviewStore=SongStore;window.reviewSave=SongStore.prototype.save;SongStore.prototype.save=async function(...args){await new Promise(r=>window.releaseReviewSave=r);return window.reviewSave.apply(this,args);};});
   await p.locator('#song-retry').click();await p.waitForFunction(()=>typeof window.releaseReviewSave==='function');assert.equal(await p.locator('#song-leave').isDisabled(),true);assert.equal(await p.locator('#song-failure .screen-heading button').isDisabled(),true);
   await p.keyboard.press('Escape');assert.equal(await p.locator('#song-failure').isVisible(),true);await p.evaluate(()=>window.releaseReviewSave());await p.waitForFunction(()=>!document.querySelector('#song-retry').disabled);assert.equal(await p.locator('#song-failure').isVisible(),true);
   await p.evaluate(()=>{window.reviewStore.prototype.save=window.reviewSave;IDBObjectStore.prototype.put=window.nativeReviewPut;});await p.locator('#song-retry').click();await p.locator('#melody-home').waitFor({state:'visible'});
  });
 }finally{await browser.close();}
 if(failures)throw new Error(failures+' review regressions failed');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
