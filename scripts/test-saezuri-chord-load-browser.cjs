const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const results=[];for(const metronome of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:740},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.loadContexts=[];window.loadNodes=[];const Native=AudioContext;window.AudioContext=class extends Native{constructor(options){super(options);this.testHint=options?.latencyHint;loadContexts.push(this);}createOscillator(){const n=super.createOscillator(),start=n.start.bind(n),row={ended:false};n.start=t=>{loadNodes.push(row);return start(t);};n.addEventListener('ended',()=>row.ended=true);return n;}};});
  await page.goto(base+'/probe/saezuri/');await page.locator('#home-create').click();await page.locator('#new-manual').click();await page.locator('[data-mode="backing"]').click();await page.locator('[data-chord-bar="0"]').click();
  const client=await context.newCDPSession(page);await client.send('Emulation.setCPUThrottlingRate',{rate:4});
  if(metronome){await page.locator('#chord-count-start').click();await page.waitForFunction(()=>document.querySelector('#chord-metronome').dataset.state==='running');}
  await page.locator('#chord-grid>button').first().click();await page.waitForFunction(()=>loadContexts.length>0);
  const data=await page.evaluate(async()=>{
   const ctx=loadContexts.at(-1),stats=()=>{const s=ctx.playbackStats;return s?{underrunEvents:s.underrunEvents,underrunDuration:s.underrunDuration,totalDuration:s.totalDuration}:null;};stats();await new Promise(r=>setTimeout(r,700));const before=stats();let maxLive=0;
   for(let i=0;i<100;i++){document.querySelectorAll('#chord-grid>button')[i%7].click();await new Promise(r=>setTimeout(r,80));maxLive=Math.max(maxLive,loadNodes.filter(n=>!n.ended).length);}
   await new Promise(r=>setTimeout(r,1100));const after=stats(),url=performance.getEntriesByType('resource').find(r=>/\/light-voice\.js\?/.test(r.name)).name,{lightVoiceStats}=await import(url);document.querySelector('#report').click();const report=JSON.parse(document.querySelector('#metrics').textContent);
   return {maxLive,liveAfter:loadNodes.filter(n=>!n.ended).length,voices:lightVoiceStats(ctx),latencyHint:ctx.testHint,before,after,delta:before&&after?Object.fromEntries(Object.keys(before).map(k=>[k,after[k]-before[k]])):null,report};
  });
  assert.equal(data.latencyHint,.02);assert.equal(data.maxLive,5,'seventh chords use four single-wave piano voices and one bass');assert.equal(data.liveAfter,0);assert.equal(data.voices.maxOscillators,5);assert.equal(data.voices.active,0);assert.equal(data.report.chordAudition.policy,'2026-10-29-simple-piano-20ms');assert.equal(data.report.chordAudition.finished,true);assert.equal(data.report.chordAudition.metronome,metronome);assert.equal(data.report.playback,null,'short audition does not replace the song record');assert.equal(data.report.captureEditing.pending,false);assert.equal(data.report.captureCandidate.notes.length,0);
  if(metronome){assert.equal(await page.locator('#chord-metronome').getAttribute('data-state'),'running');await page.locator('#chord-count-stop').click();}
  assert.deepEqual(errors,[]);const {report,...measure}=data;results.push({metronome,...measure,chordAudition:report.chordAudition});await context.close();console.log(JSON.stringify({result:'PASS',metronome,taps:100,maxLive:data.maxLive,liveAfter:data.liveAfter,delta:data.delta}));
 }fs.mkdirSync('.local-tools/chord-metronome-20261029',{recursive:true});fs.writeFileSync('.local-tools/chord-metronome-20261029/load.json',JSON.stringify({base,results},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
