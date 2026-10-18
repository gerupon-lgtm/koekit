const {chromium,webkit}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{const browser=process.env.SAEZURI_BROWSER==='webkit'?await webkit.launch({headless:true,executablePath:process.env.SAEZURI_WEBKIT_PATH}):await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const results=[];
 for(const [query,hint] of [['','playback'],['?audioLatency=10ms',.01],['?audioLatency=20ms',.02],['?audioLatency=interactive','interactive'],['?audioLatency=20ms&audioSchedule=window',.02]]){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(()=>{
   if(typeof AudioContext!=='function')return;
   window.audioContexts=[];window.deferResume=false;window.releaseResume=null;
   const Native=AudioContext;
   window.AudioContext=class extends Native{
    constructor(options){super(options);const row={ctx:this,hint:options.latencyHint,starts:0};audioContexts.push(row);this.row=row;}
    createOscillator(){const node=super.createOscillator(),start=node.start.bind(node);node.start=(...args)=>{this.row.starts++;return start(...args);};return node;}
    resume(){const ready=super.resume();if(!deferResume)return ready;deferResume=false;return ready.then(()=>new Promise(resolve=>{releaseResume=resolve;}));}
   };
  });
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/probe/saezuri/'+query);await page.locator('#home-songs').waitFor();
  assert.equal(await page.evaluate(()=>typeof AudioContext),'function','Web Audio is unavailable in this browser runtime; audio routing remains unverified');
  await page.evaluate(async()=>{
   const {SongStore}=await import('/saezuri/song-store.js'),{emptySequence}=await import('./sequence-session.js');
   const pattern={source:'manual',bars:4,gridStep:2,notes:Array.from({length:16},(_,i)=>({id:'routing-'+i,midi:[60,64,67,64][i%4],startTick:i*4,durationTick:4})),accompaniment:{enabled:true,genre:'pop',rhythm:'offbeat',progression:'pop'}};
   await new SongStore().save('routing',{title:'音の切り替え',checkpoint:{confirmed:{pattern,cursor:64,hasRest:false},draft:null},sequence:emptySequence(),settings:{tempo:180,instrument:'sine'}});
  });
  await page.locator('#home-songs').click();await page.locator('[data-song-open]').click();
  if(await page.locator('#song-continue').isVisible())await page.locator('#song-continue').click();
  const report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
  const status=state=>page.waitForFunction(value=>document.querySelector('#status').dataset.state===value,state);
  const play=()=>page.locator('#preview').click();
  const press=async()=>{const key=page.locator('#piano-keys [data-midi="60"]');await key.scrollIntoViewIfNeeded();const box=await key.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height-10);await page.mouse.down();await page.waitForFunction(()=>document.querySelectorAll('#piano-keys [data-held]').length===1&&audioContexts.at(-1).starts>0);};
  const before=await report();
  await play();await page.waitForFunction(()=>document.querySelector('#status').textContent==='再生中');const first=await report();assert.equal(first.playback.latencyHint,hint);assert.equal(first.playback.scheduleMode,query.includes('audioSchedule=window')?'window':'phrase');assert.equal(first.playback.voiceControls.enabled,await page.locator('#edit-voice').isChecked());assert.equal(first.playback.voiceControls.microphoneEnabled,await page.locator('#mic').getAttribute('aria-pressed')==='true');await page.locator('#stop').click();
  await press();assert.equal(await page.evaluate(()=>audioContexts.at(-1).hint),'interactive');
  await page.waitForFunction(()=>audioContexts.filter(row=>row.ctx.state!=='closed').length===1);assert.equal(await page.locator('#piano-keys [data-held]').count(),1,'closing the former song context cannot release the new held key');
  assert.equal((await report()).playback.latencyHint,hint,'last song retains its own hint after a live-key context switch');await page.mouse.up();
  const count=await page.evaluate(()=>audioContexts.length);await press();await page.mouse.up();assert.equal(await page.evaluate(()=>audioContexts.length),count,'consecutive keys reuse the interactive context');
  await play();await page.waitForFunction(()=>document.querySelector('#status').textContent==='再生中');assert.equal((await report()).audioLatencyHint,hint);await page.locator('#stop').click();
  // Stop while resume is pending, then press a key. The obsolete song request
  // must neither start a transport nor disturb the newer live voice.
  await page.evaluate(()=>deferResume=true);await play();await page.waitForFunction(()=>typeof releaseResume==='function');await page.locator('#stop').click();await press();
  await page.evaluate(()=>{releaseResume();releaseResume=null;});await status('idle');assert.equal(await page.locator('#piano-keys [data-held]').count(),1);await page.mouse.up();
  if(await page.locator('#mic').getAttribute('aria-pressed')==='true')await page.locator('#mic').click();
  await page.locator('#backing-loop').click();await status('playing');const loopCount=await page.evaluate(()=>audioContexts.length),loopBefore=await report();assert.equal(loopBefore.playback.loop,true);assert.equal(loopBefore.playback.latencyHint,'interactive');
  await press();await page.mouse.up();assert.equal(await page.evaluate(()=>audioContexts.length),loopCount,'playing over a backing loop shares its audio clock');await page.locator('#stop').click();
  const after=await report();assert.deepEqual(after.captureCandidate,before.captureCandidate);assert.deepEqual(after.captureEditing,before.captureEditing,'practice and context switches do not change notes, cursor, candidate or undo');
  await page.waitForFunction(()=>audioContexts.filter(row=>row.ctx.state!=='closed').length===1);
  assert.deepEqual(errors,[]);results.push({query,hint,contexts:await page.evaluate(()=>audioContexts.map(row=>({hint:row.hint,state:row.ctx.state,starts:row.starts}))),lastPlayback:after.playback.latencyHint});await context.close();
 }
 console.log(JSON.stringify({result:'PASS',checks:'saved audition/live-key switching, reuse, stale resume cancellation, held-key ownership, backing-loop clock and unchanged editor',results}));
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
