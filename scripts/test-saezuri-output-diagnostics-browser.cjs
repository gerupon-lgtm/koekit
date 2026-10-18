const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const results=[];
 for(const [query,hint,unsupported] of [['','interactive',false],['?audioLatency=playback','playback',false],['?audioLatency=playback','playback',true]]){
  const context=await browser.newContext({viewport:{width:390,height:740},serviceWorkers:'block'});
  await context.addInitScript(({unsupported})=>{
   window.outputReadings=0;window.outputCounters={underrunEvents:7,underrunDuration:.02,totalDuration:20};window.requestedLatency=[];
   const Native=AudioContext;window.AudioContext=class extends Native{constructor(options){super(options);requestedLatency.push(options?.latencyHint);Object.defineProperty(this,'playbackStats',{get(){outputReadings++;if(unsupported)throw new Error('unsupported');return outputCounters;}});}};
  },{unsupported});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/probe/saezuri/'+query);
  await page.locator('#home-songs').waitFor({timeout:10000}).catch(async error=>{console.error(JSON.stringify({query,unsupported,errors,state:await page.evaluate(()=>({body:document.body.dataset,text:document.body.innerText.slice(0,1000)}))}));throw error;});
  await page.evaluate(async()=>{
   const {SongStore}=await import('/saezuri/song-store.js'),{emptySequence}=await import('./sequence-session.js');
   const pattern={bars:4,gridStep:2,notes:Array.from({length:16},(_,i)=>({id:'diagnostic-'+i,midi:[60,64,67,64][i%4],startTick:i*4,durationTick:4})),accompaniment:{enabled:true,genre:'pop',rhythm:'offbeat',progression:'pop'}};
   await new SongStore().save('diagnostic',{title:'出力の検証',checkpoint:{confirmed:{pattern,cursor:64,hasRest:false},draft:null},sequence:emptySequence(),settings:{tempo:180,instrument:'piano'}});
  });
  await page.locator('#home-songs').click();const listen=page.locator('.song-row button').filter({hasText:'▶ 聴く'});
  const report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
  const savedBefore=await page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return new SongStore().get('diagnostic');});
  for(let pass=0;pass<2;pass++){
   await listen.click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing'&&document.querySelector('#status').textContent==='再生中');
   const reads=await page.evaluate(()=>outputReadings);
   // Screen work does not cause continuous diagnostic polling or missed notes.
   await page.evaluate(()=>{const until=performance.now()+700;while(performance.now()<until){};outputCounters={underrunEvents:outputCounters.underrunEvents+1,underrunDuration:outputCounters.underrunDuration+.004,totalDuration:outputCounters.totalDuration+2};});
   assert.equal(await page.evaluate(()=>outputReadings),reads,'native statistics are not read on every animation frame');
   if(!pass)await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='idle',null,{timeout:10000});else await page.locator('#song-list-stop').click();
   const result=await report();assert.equal(result.audioLatencyHint,hint);assert.equal(result.playback.engine,'light');assert.equal(result.playback.scheduleMode,'phrase');
   if(unsupported)assert.deepEqual(result.playback.audioOutputStats,{status:'unavailable'});
   else{assert.equal(result.playback.audioOutputStats.status,'measured');assert.equal(result.playback.audioOutputStats.underrunEvents,1);assert.ok(Math.abs(result.playback.audioOutputStats.underrunDuration-.004)<1e-9);assert.equal(result.playback.audioOutputStats.totalDuration,2);}
   if(!pass){assert.equal(result.playback.reason,'ENDED');assert.equal(result.playback.events,16);}
   results.push({hint,unsupported,pass,stats:result.playback.audioOutputStats});
  }
  assert.deepEqual(await page.evaluate(()=>requestedLatency),[hint]);assert.deepEqual(await page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return new SongStore().get('diagnostic');}),savedBefore);assert.deepEqual(errors,[]);await context.close();
 }
 console.log(JSON.stringify({result:'PASS',base,checks:'saved song natural end and manual stop; per-play counters on replay; unsupported getter; no per-frame stats polling; no saved data changes; explicit comparison latency',results}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
