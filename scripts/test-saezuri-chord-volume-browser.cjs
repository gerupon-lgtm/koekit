const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const results=[];
 for(const source of ['preset','image']){
  const context=await browser.newContext({viewport:{width:390,height:740},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.chordPeaks=[];const make=AudioContext.prototype.createGain;AudioContext.prototype.createGain=function(){const node=make.call(this),ramp=node.gain.linearRampToValueAtTime.bind(node.gain);node.gain.linearRampToValueAtTime=(value,time)=>{if(value>0&&value<.5)chordPeaks.push(value);return ramp(value,time);};return node;};});
  await page.goto(base+'/probe/saezuri/');
  const fixture=await page.evaluate(async source=>{
   const {SongStore}=await import('/saezuri/song-store.js'),{emptySequence}=await import('./sequence-session.js'),{chordAuditionEvents}=await import('/saezuri/music/accompaniment.js'),{generateImageAccompaniment}=await import('/saezuri/music/image-arrangement.js');
   const pattern={bars:4,gridStep:1,key:{tonicPitchClass:0,mode:'major'},notes:[{id:'one',midi:60,startTick:0,durationTick:4}],accompaniment:{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'}};
   if(source==='image')pattern.accompaniment=generateImageAccompaniment(pattern,{type:'nursery',speed:'normal',mood:'gentle'});
   await new SongStore().save('chord-volume',{title:'コード試聴の音量',checkpoint:{confirmed:{pattern,cursor:0,hasRest:false},draft:null},sequence:emptySequence(),settings:{tempo:120,instrument:'piano'}});
   return {pattern,triad:chordAuditionEvents(pattern,{root:9,quality:'minor',bass:9}),four:chordAuditionEvents(pattern,{root:6,quality:'m7♭5',bass:1})};
  },source);
  await page.locator('#home-songs').click();await page.locator('[data-song-open="chord-volume"]').click();if(await page.locator('#song-continue').isVisible())await page.locator('#song-continue').click();await revealCreationControl(page,'[data-mode="backing"]');await page.locator('[data-mode="backing"]').click();await page.locator('[data-chord-bar="0"]').click();await page.locator('#chord-basic button').getByText('Am',{exact:true}).click();
  for(const kind of ['triad','four']){
   if(kind==='four'){await page.locator('#chord-all-mode').click();await page.locator('#chord-root').selectOption('6');await page.locator('#chord-quality').selectOption('m7♭5');await page.locator('#chord-bass').selectOption('1');}
   await page.evaluate(()=>chordPeaks.length=0);await page.locator('#chord-single-preview').click();await page.waitForFunction(n=>chordPeaks.length>=n,fixture[kind].length);
   const peaks=await page.evaluate(()=>chordPeaks.slice()),reference=fixture[kind].map(n=>n.gain*((n.velocity??70)/70)**.8);assert.equal(peaks.length,reference.length);
   const ratios=peaks.map((n,i)=>n/reference[i]);assert.ok(ratios.every(n=>n>2),'standalone harmony is more than twice the quiet nursery backing level');assert.ok(Math.max(...ratios)-Math.min(...ratios)<.00001,'chord/bass balance and velocity are preserved');assert.ok(peaks.reduce((sum,n)=>sum+n,0)<=.321,'summed voice peaks leave room for master 200%');
   const rendered=await page.evaluate(async({events,peaks})=>{
    const {scheduleVoice}=await import('./audio.js'),{AudioMixer}=await import('./volume.js');
    const render=async amplified=>{const ctx=new OfflineAudioContext(1,24000,24000),mixer=new AudioMixer(ctx,{master:2});for(const [i,event] of events.entries())scheduleVoice(ctx,mixer.backing,{...event,gain:amplified?peaks[i]/(((event.velocity??70)/70)**.8):event.gain,time:.015,duration:.4,engine:'light'});const data=(await ctx.startRendering()).getChannelData(0);let sum=0,peak=0;for(const v of data){sum+=v*v;peak=Math.max(peak,Math.abs(v));}return {rms:Math.sqrt(sum/data.length),peak,finite:data.every(Number.isFinite)};};return {normal:await render(false),audition:await render(true)};
   },{events:fixture[kind],peaks});assert.ok(rendered.audition.finite&&rendered.audition.peak<.95);assert.ok(rendered.audition.rms>rendered.normal.rms*2);
   results.push({source,kind,ratios,rendered});
  }
  await page.locator('#report').evaluate(n=>n.click());const report=JSON.parse(await page.locator('#metrics').textContent());assert.equal(report.captureEditing.pending,false);assert.deepEqual(report.captureCandidate,fixture.pattern);assert.deepEqual(errors,[]);await context.close();
 }
 console.log(JSON.stringify({result:'PASS',base,results}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
