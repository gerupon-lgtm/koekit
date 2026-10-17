const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026',folder='.local-tools/continuation-20261018';
(async()=>{
 fs.mkdirSync(folder,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/probe/saezuri/');await page.locator('#home-songs').waitFor();
  await page.evaluate(async()=>{
   const {SongStore}=await import('../../saezuri/song-store.js');
   const p={id:'A',familyId:'A',name:'A',bars:8,gridStep:2,source:'manual',key:{tonicPitchClass:9,mode:'minor'},notes:[{id:'n',midi:69,startTick:0,durationTick:128}],accompaniment:{enabled:false,genre:'ballad',rhythm:'arpeggio',progression:'home',sounds:{chord:'strings',bass:'soft'}}};
   await new SongStore().save('long-realtime',{title:'132小節の実時間検証',checkpoint:null,sequence:{patterns:[p],placements:Array.from({length:16},(_,i)=>({id:`p${i}`,patternId:'A'})),revision:0,undoStack:[],ending:{enabled:true,bars:4,mode:'custom',customChord:{root:9,quality:'major',bass:5}}},sequenceDraft:null,settings:{tempo:180,instrument:'piano'}});
  });
  await page.reload();await page.locator('#home-songs').click();await page.locator('[data-song-open]').click();assert.match(await page.locator('#sequence-count').textContent(),/132小節/);
  await page.locator('#sequence-edit').click();await page.screenshot({path:folder+'/placement-390.png'});await page.locator('#melody-create [data-screen-back]').click();
  await page.locator('#ending-open').click();await page.screenshot({path:folder+'/ending-390.png'});await page.locator('#ending-close').click();
  await page.evaluate(()=>{window.longSongProgress={lastBar:0,ending:false};new MutationObserver(()=>{const m=document.querySelector('#position').textContent.match(/\d+/);if(m)window.longSongProgress.lastBar=Math.max(window.longSongProgress.lastBar,Number(m[0]));if(document.querySelector('[data-ending][data-playing]'))window.longSongProgress.ending=true;}).observe(document.querySelector('#position'),{childList:true});});
  const began=Date.now();await page.locator('#sequence-preview').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
  for(;;){
   try{await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='idle',null,{timeout:15000});break;}
   catch(error){if(error.name!=='TimeoutError')throw error;const progress=await page.evaluate(()=>({position:document.querySelector('#position').textContent,...window.longSongProgress}));console.log(JSON.stringify({elapsedSeconds:Math.round((Date.now()-began)/1000),...progress}));if(Date.now()-began>200000)throw new Error('LONG_SONG_TIMEOUT');}
  }
  await page.locator('#report').evaluate(n=>n.click());const report=JSON.parse(await page.locator('#metrics').textContent()),progress=await page.evaluate(()=>window.longSongProgress),elapsedMs=Date.now()-began;
  assert.equal(report.playback.reason,'ENDED');assert.equal(report.playback.bars,132);assert.equal(report.playback.notes,16);assert.equal(report.playback.events,16);assert.equal(report.playback.accompanimentEvents,4);
  assert.equal(report.playback.ending.startTick,2048);assert.equal(report.playback.ending.durationTick,64);assert.equal(progress.lastBar,132);assert.equal(progress.ending,true);assert.ok(elapsedMs>=176000);assert.deepEqual(errors,[]);
  const result={result:'PASS',tempo:180,bars:132,musicalSeconds:176,elapsedMs,progress,playback:report.playback};fs.writeFileSync(folder+'/long-song-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
