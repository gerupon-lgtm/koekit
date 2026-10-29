const {chromium,webkit}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026',isWebKit=process.env.SAEZURI_BROWSER==='webkit';
(async()=>{const browser=isWebKit?await webkit.launch({headless:true,executablePath:process.env.SAEZURI_WEBKIT_PATH}):await chromium.launch({channel:'chrome',headless:true});try{
 for(const [width,height,source,onlyChords,image] of [[320,568,'tap',false,false],[390,740,undefined,false,false],[390,568,'manual',true,false],[390,740,'manual',true,true]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  const tap=async id=>{await revealCreationControl(page,'#'+id);await page.locator('#'+id).tap();};
  await page.goto(base+'/probe/saezuri/');await page.locator('#home-songs').waitFor();
  const original=await page.evaluate(async({source,onlyChords,image})=>{
   const {SongStore}=await import('/saezuri/song-store.js'),{emptySequence,keepPhrase}=await import('./sequence-session.js'),{openEditSession,confirmEditSession}=await import('./edit-session.js'),{songCheckpoint}=await import('./song-session.js');
   const pattern={bars:4,gridStep:1,key:{tonicPitchClass:9,mode:'minor'},notes:onlyChords?[]:[{id:'note',midi:69,startTick:0,durationTick:4}],accompaniment:{enabled:true,genre:'pop',rhythm:'offbeat',progression:'home'}};if(source)pattern.source=source;
   if(image){const {generateImageAccompaniment}=await import('/saezuri/music/image-arrangement.js');pattern.accompaniment=generateImageAccompaniment(pattern,{type:'pop',speed:'normal',mood:'bright'});}
   let sequence=emptySequence();for(let i=1;i<=9;i++)sequence=keepPhrase(sequence,pattern,'既存フレーズ'+i);
   sequence.placements=sequence.patterns.slice(0,2).map((p,i)=>({id:'placed-'+i,patternId:p.id}));
   const saved=await new SongStore().save('handoff',{title:'直後の表示確認',checkpoint:songCheckpoint(confirmEditSession(openEditSession(pattern))),sequence,settings:{tempo:120,instrument:'piano'}});return saved.data;
  },{source,onlyChords,image});
  await tap('home-songs');await page.locator('[data-song-open="handoff"]').tap();await page.locator('#melody-create').waitFor({state:'visible'});
  // Delay real writes: the handoff must not rely on waiting for autosave.
  await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(r=>/\/saezuri\/song-store\.js\?/.test(r.name)).name,{SongStore}=await import(url),save=SongStore.prototype.save;SongStore.prototype.save=async function(...args){await new Promise(r=>setTimeout(r,350));return save.apply(this,args);};});
  for(let round=1;round<=2;round++){
   const name='いま追加したフレーズ'+round;await revealCreationControl(page,'#phrase-name');await page.locator('#phrase-name').fill(name);await tap('keep-phrase');await tap('after-keep-connect');
   const view=await page.evaluate(name=>{
    const shelf=document.querySelector('#phrase-shelf'),button=[...shelf.querySelectorAll('[data-phrase]')].find(b=>b.textContent.includes(name)),r=button?.getBoundingClientRect(),s=shelf.getBoundingClientRect();
    return {count:shelf.querySelectorAll('[data-phrase]').length,enabled:!!button&&!button.disabled,id:button?.dataset.phrase,x:r&&r.left+r.width/2,y:r&&r.top+r.height/2,inside:!!r&&r.top>=s.top-1&&r.bottom<=s.bottom+1,hit:!!r&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[data-phrase]')===button,scroll:shelf.scrollTop,pageScroll:scrollY,placements:document.querySelectorAll('[data-placement]').length};
   },name);
   // No locator scrolling before this assertion or raw touchscreen tap.
   assert.ok(view.inside&&view.hit&&view.enabled,JSON.stringify({width,height,source,round,view}));assert.equal(view.count,9+round);assert.equal(view.placements,1+round);assert.equal(view.pageScroll,0);
   fs.mkdirSync('.local-tools/phrase-selection-20261030',{recursive:true});if(round===1)await page.screenshot({path:'.local-tools/phrase-selection-20261030/fixed-'+(isWebKit?'webkit':'chrome')+'-'+width+'-'+height+'.png'});
   await page.touchscreen.tap(view.x,view.y);assert.equal(await page.locator('#sequence-line [data-placement]').count(),2+round);assert.match(await page.locator('#sequence-line [data-placement]').last().textContent(),new RegExp(name));
   assert.equal(await page.locator('#sequence-confirm').isEnabled(),true);assert.equal(await page.locator('#phrase-shelf [data-phrase]').first().isDisabled(),true,'new-item reveal keeps pending placement confirmation');await tap('sequence-confirm');
   if(round===1){await page.locator('#melody-connect [data-screen-back]').tap();await tap('home-resume');}
  }
  await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');const saved=await page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return (await new SongStore().get('handoff')).data;});
  assert.deepEqual(saved.sequence.patterns.slice(0,9),original.sequence.patterns);assert.deepEqual(saved.checkpoint.confirmed.pattern,original.checkpoint.confirmed.pattern);assert.equal(saved.sequence.placements.length,4);
  await page.reload();await tap('home-songs');await page.locator('[data-song-open="handoff"]').tap();if(await page.locator('#song-continue').isVisible())await tap('song-continue');await page.locator('#melody-create [data-screen-back]').tap();await page.locator('#melody-choose [data-screen-back]').tap();await tap('home-connect');assert.equal(await page.locator('#phrase-shelf [data-phrase]').count(),11);assert.equal(await page.locator('#sequence-line [data-placement]').count(),4);
  assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({result:'PASS',browser:isWebKit?'WebKit':'Chrome',width,height,source:source??'humming',onlyChords,image,checks:'immediate new phrase visible/hittable before auto-scroll, delayed saves, second registration, touch append/OK, old phrases and saved melody retained, reload'}));
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
