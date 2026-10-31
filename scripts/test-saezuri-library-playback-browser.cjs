const {openSongActions}=require('./saezuri-browser-controls.cjs');
const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
const artifacts='.local-tools/phrase-selection-20261030';

(async()=>{
 const started=Date.now();
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--js-flags=--max-old-space-size=512']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,serviceWorkers:'block'});
  // Observe native audio time. The optional gate delays its real resume promise;
  // it does not replace audio output or report an artificial successful start.
  await context.addInitScript(()=>{
   const NativeAudioContext=window.AudioContext;
   window.libraryAudioContexts=[];window.libraryResumeGates=[];window.libraryResumeSettled=0;window.libraryHoldResume=false;
   window.AudioContext=class extends NativeAudioContext{
    constructor(options){super(options);window.libraryAudioContexts.push(this);}
    resume(){const native=super.resume();if(!window.libraryHoldResume)return native;
     return Promise.all([native,new Promise(resolve=>window.libraryResumeGates.push(resolve))]).then(()=>{window.libraryResumeSettled++;});
    }
   };
  });
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
  const button=id=>page.locator(`[data-song-play="${id}"]`);
  const row=id=>page.locator('.song-row').filter({has:button(id)});
  const report=async()=>{await page.locator('#report').evaluate(node=>node.click());return JSON.parse(await page.locator('#metrics').textContent());};
  const records=()=>page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return (await new SongStore().list()).sort((a,b)=>a.id.localeCompare(b.id));});
  const openLibrary=async()=>{await page.locator('#home-songs').click();await button('library-source').waitFor({state:'visible'});};
  const idle=async id=>{
   await page.waitForFunction(id=>{const button=document.querySelector(`[data-song-play="${id}"]`),row=button?.closest('.song-row');return button?.textContent==='▶ 聴く'&&!row.dataset.songPlaying&&!row.dataset.songPreparing&&row.querySelector('.song-playback').hidden;},id);
  };
  const active=async id=>{
   await page.waitForFunction(id=>document.querySelector(`[data-song-play="${id}"]`)?.closest('.song-row').dataset.songPlaying==='true',id);
   assert.equal(await button(id).textContent(),'■ とめる');assert.equal(await button(id).getAttribute('aria-pressed'),'true');
   assert.equal(await row(id).locator('.song-playback').isVisible(),true);
   assert.match(await row(id).locator('.song-playback-status').textContent(),/カウント中|再生中 \d+ \/ \d+小節/);
  };
  const progress=async(id,minimum)=>page.waitForFunction(({id,minimum})=>document.querySelector(`[data-song-play="${id}"]`)?.closest('.song-row').querySelector('progress').value>=minimum,{id,minimum});
  const heldStart=async id=>{
   await page.evaluate(()=>window.libraryHoldResume=true);await button(id).click();
   await page.waitForFunction(id=>window.libraryResumeGates.length>0&&document.querySelector(`[data-song-play="${id}"]`)?.closest('.song-row').dataset.songPreparing==='true',id);
   assert.equal(await button(id).textContent(),'じゅんび中…');assert.equal(await row(id).locator('.song-playback-status').textContent(),'音をじゅんび中…');
  };
  const release=async()=>{
   const target=await page.evaluate(()=>{window.libraryHoldResume=false;const pending=window.libraryResumeGates.splice(0),target=window.libraryResumeSettled+pending.length;for(const resolve of pending)resolve();return target;});
   await page.waitForFunction(target=>window.libraryResumeSettled>=target,target);
   // Wait for the app's continuation and its resulting UI frame, without a sleep.
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  fs.mkdirSync(artifacts,{recursive:true});
  await page.goto(base+'/probe/saezuri/');await page.locator('#home-songs').waitFor();
  const initial=await page.evaluate(async()=>{
   const {SongStore}=await import('/saezuri/song-store.js'),{openEditSession,confirmEditSession}=await import('./edit-session.js'),{songCheckpoint}=await import('./song-session.js'),{emptySequence,sequencePlayback}=await import('./sequence-session.js');
   const p={bars:4,gridStep:1,source:'manual',key:{tonicPitchClass:0,mode:'major'},notes:[{id:'native-note',midi:60,startTick:0,durationTick:4}]};
   const checkpoint=songCheckpoint(confirmEditSession(openEditSession(p))),store=new SongStore();
   const first=await store.save('library-source',{title:'四小節のきょく',checkpoint,sequence:emptySequence(),sequenceDraft:null,placementDraft:null,settings:{tempo:180,instrument:'fm-piano'}});
   const backing={enabled:true,genre:'pop',rhythm:'offbeat',progression:'home'};
   const sequence={patterns:[{...structuredClone(p),id:'first',familyId:'first',name:'最初',accompaniment:backing},{...structuredClone(p),id:'last',familyId:'last',name:'最後',notes:[{id:'last-note',midi:67,startTick:0,durationTick:4}],accompaniment:backing}],placements:[{id:'place-first',patternId:'first'},{id:'place-last',patternId:'last'}],revision:0,undoStack:[],ending:{enabled:true,bars:1,mode:'auto'}};
   const playback=sequencePlayback(sequence);if(playback.code)throw new Error(playback.code);
   const second=await store.save('library-arranged',{title:'つなげたきょく',checkpoint,sequence,sequenceDraft:null,placementDraft:null,settings:{tempo:180,instrument:'fm-piano'}});
   return [second,first].sort((a,b)=>a.id.localeCompare(b.id));
  });
  await openLibrary();
  assert.equal(await page.locator('[data-song-play]').count(),2);assert.equal(await page.locator('.song-playback:visible').count(),0);

  // The first native start is deliberately held to make its pending state observable.
  await heldStart('library-source');await release();await active('library-source');
  await progress('library-source',4);
  const firstClock=await row('library-source').locator('progress').evaluate(node=>({tick:node.value,time:window.libraryAudioContexts.at(-1).currentTime,state:window.libraryAudioContexts.at(-1).state,max:node.max}));
  assert.equal(firstClock.state,'running');assert.equal(firstClock.max,64);
  await progress('library-source',firstClock.tick+8);
  const secondClock=await row('library-source').locator('progress').evaluate(node=>({tick:node.value,time:window.libraryAudioContexts.at(-1).currentTime}));
  assert.ok(secondClock.time-firstClock.time>.35,'native audio clock advances');
  assert.ok(Math.abs(secondClock.tick-firstClock.tick-(secondClock.time-firstClock.time)*12)<3,'progress follows the saved 180 BPM audio clock');
  const sourceReport=await report();assert.equal(sourceReport.playback.tempo,180);assert.equal(sourceReport.playback.bars,4);assert.deepEqual(sourceReport.playback.pitches,[60]);assert.ok(sourceReport.playback.events>=1);

  await button('library-arranged').click();await active('library-arranged');await idle('library-source');
  assert.equal(await page.locator('.song-row[data-song-playing=true]').count(),1);assert.equal(await row('library-arranged').locator('progress').getAttribute('max'),'144');
  const arrangedReport=await report();assert.equal(arrangedReport.playback.bars,9);assert.deepEqual(arrangedReport.playback.pitches,[60,67]);assert.equal(arrangedReport.playback.ending.startTick,128);assert.equal(arrangedReport.playback.ending.durationTick,16);
  await progress('library-arranged',8);
  for(const [width,height] of [[320,568],[390,740]]){
   await page.setViewportSize({width,height});await page.locator('#song-library .sheet-body').evaluate(node=>node.scrollTop=0);
   const layout=await row('library-arranged').evaluate(row=>{
    const rects=[...row.querySelectorAll('button')].filter(node=>node.getClientRects().length).map(node=>node.getBoundingClientRect()),dialog=row.closest('dialog'),d=dialog.getBoundingClientRect(),heading=dialog.querySelector('h2').getBoundingClientRect(),close=dialog.querySelector('#song-library-close').getBoundingClientRect(),stop=dialog.querySelector('#song-list-stop').getBoundingClientRect(),view=row.querySelector('.song-playback').getBoundingClientRect(),r=row.getBoundingClientRect();
    return {count:rects.length,targets:rects.every(r=>r.width>=43.9&&r.height>=43.9),gaps:rects.every((a,i)=>rects.slice(i+1).every(b=>a.right+7.8<=b.left||b.right+7.8<=a.left||a.bottom+7.8<=b.top||b.bottom+7.8<=a.top)),overflow:document.documentElement.scrollWidth>innerWidth||dialog.scrollWidth>dialog.clientWidth,headingCenter:Math.abs((heading.left+heading.right-d.left-d.right)/2),closeRight:close.left>d.left+d.width/2&&close.right<=d.right,stopCenter:Math.abs((stop.left+stop.right-d.left-d.right)/2),stopVisible:stop.bottom<=innerHeight&&stop.top>=0,feedbackFullWidth:Math.abs(view.width-r.width+16)<2};
   });
   assert.equal(layout.count,3);assert.ok(layout.targets&&layout.gaps&&!layout.overflow&&layout.headingCenter<2&&layout.closeRight&&layout.stopCenter<2&&layout.stopVisible&&layout.feedbackFullWidth,JSON.stringify({width,layout}));
   if(width===390)await page.screenshot({path:artifacts+'/library-390.png'});
  }
  await page.locator('#song-list-stop').click();await idle('library-arranged');
  await button('library-source').click();await active('library-source');await button('library-source').click();await idle('library-source');
  await button('library-arranged').click();await active('library-arranged');await page.locator('#song-library-close').click();await page.locator('#song-library').waitFor({state:'hidden'});await openLibrary();
  assert.equal(await page.locator('.song-row[data-song-playing],.song-row[data-song-preparing]').count(),0);

  // Preparation cancellation still uses the native app and its real serial guard.
  await heldStart('library-source');await page.locator('#song-list-stop').click();await idle('library-source');await release();await idle('library-source');
  await heldStart('library-source');await button('library-source').click();await idle('library-source');await release();await idle('library-source');
  await heldStart('library-source');await page.evaluate(()=>window.libraryHoldResume=false);await button('library-arranged').click();await active('library-arranged');await release();await active('library-arranged');await idle('library-source');await page.locator('#song-list-stop').click();
  await heldStart('library-source');await page.locator('#song-library-close').click();await page.locator('#song-library').waitFor({state:'hidden'});await release();await openLibrary();await idle('library-source');

  // A whole four-bar piece reaches the natural transport end and clears the row.
  const naturalStart=Date.now();await button('library-source').click();await active('library-source');await progress('library-source',16);
  assert.match(await row('library-source').locator('.song-playback-status').textContent(),/再生中 2 \/ 4小節$/);
  await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='idle',null,{timeout:10000});await idle('library-source');
  const ended=await report();assert.equal(ended.playback.reason,'ENDED');assert.equal(ended.playback.finalTick,64);assert.ok(Date.now()-naturalStart>=5000);assert.deepEqual(await records(),initial,'all playback and cancellation leave saved records byte-for-byte equivalent');

  // Opening rename/delete during preparation cancels it; refreshed rows bind once.
  await heldStart('library-source');await openSongActions(page,'library-source');await page.locator('[data-song-rename="library-source"]').click();await release();
  await page.locator('#song-rename-title').fill('名前をかえたきょく');await page.locator('#song-rename-confirm').click();await page.locator('#song-rename').waitFor({state:'hidden'});await button('library-source').waitFor();await idle('library-source');
  assert.match(await page.locator('[data-song-open="library-source"]').getAttribute('aria-label'),/名前をかえたきょく/);assert.equal(await row('library-source').locator('.song-playback').count(),1);
  await heldStart('library-source');await openSongActions(page,'library-source');await row('library-source').getByRole('button',{name:'名前をかえたきょくをけす',exact:true}).click();await release();await page.locator('#song-delete [data-close]').click();await idle('library-source');

  await heldStart('library-arranged');await row('library-arranged').evaluate(node=>window.libraryDetachedRow=node);await openSongActions(page,'library-arranged');await row('library-arranged').getByRole('button',{name:'コピー',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-song-play]').length===3);await release();
  assert.equal(await page.evaluate(()=>window.libraryDetachedRow.isConnected),false);assert.equal(await page.evaluate(()=>window.libraryDetachedRow.querySelector('.song-playback').hidden),true);
  const afterCopy=await records(),copy=afterCopy.find(record=>!initial.some(item=>item.id===record.id));assert.ok(copy);assert.equal(copy.title,'つなげたきょく のコピー');
  assert.deepEqual(afterCopy.find(record=>record.id==='library-arranged'),initial.find(record=>record.id==='library-arranged'));
  const sourceData=structuredClone(initial.find(record=>record.id==='library-arranged').data);sourceData.title=copy.title;assert.deepEqual(copy.data,sourceData);
  await button(copy.id).click();await active(copy.id);await progress(copy.id,3);await page.locator('#song-list-stop').click();await idle(copy.id);
  assert.deepEqual(await records(),afterCopy,'copy and source remain unchanged by copied-song playback');
  await page.locator('#song-library-close').click();await openLibrary();assert.equal(await page.locator('.song-playback').count(),3);assert.equal(await page.locator('.song-playback:visible').count(),0);
  assert.deepEqual(errors,[]);assert.ok(Date.now()-started<60000,'bounded test runtime');
  console.log('PASS Chrome native audio: checkpoint/arranged/ending playback, audio-clock progress, active row/switch/toggle/bottom stop/close/natural end, native resume preparation cancellation, rename/delete/copy refresh, unchanged saved records, 320/390px targets/gaps/header/footer.');
  console.log(JSON.stringify({elapsedMs:Date.now()-started,firstClock,secondClock,screenshot:artifacts+'/library-390.png',evidence:'Desktop Chrome with touch emulation and native audio scheduling; physical-device listening remains unverified.'}));
  await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
