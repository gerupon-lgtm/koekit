const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(base+'/probe/saezuri/');
  const audio=await page.evaluate(async()=>{
   const {accompanimentEvents}=await import('/saezuri/music/accompaniment.js'),{generateImageAccompaniment}=await import('/saezuri/music/image-arrangement.js');
   const {blankPattern}=await import('./entry-session.js'),{scheduleVoice}=await import('./audio.js'),{AudioMixer}=await import('./volume.js');
   const rate=24000,stats=data=>{let energy=0,peak=0;for(const n of data){energy+=n*n;peak=Math.max(peak,Math.abs(n));}return {rms:Math.sqrt(energy/data.length),peak,finite:data.every(Number.isFinite)};};
   const render=async(events,length=8.5)=>{
    const ctx=new OfflineAudioContext(1,Math.round(length*rate),rate),mixer=new AudioMixer(ctx,{master:2});
    for(const n of events)scheduleVoice(ctx,mixer.backing,{...n,time:.1+n.startTick*.125,duration:n.durationTick*.125,engine:'light'});
    return (await ctx.startRendering()).getChannelData(0);
   };
   const rows=[];let approvedPcm;
   for(const key of ['C','Am'])for(const mode of ['preset','image']){
    const pattern=blankPattern(key);
    pattern.accompaniment=mode==='image'?generateImageAccompaniment(pattern,{type:'nursery',speed:'normal',mood:'bright'}):{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'};
    if(mode==='image')pattern.accompaniment.imageArrangement.sounds.chord='wood'; // a saved pre-change recipe
    const before=JSON.stringify(pattern),events=accompanimentEvents(pattern),pcm=await render(events);
    const old=events.map(n=>{const copy={...n};if(n.part!=='drums'){copy.gain/=n.part==='chord'?.65:.8;delete copy.velocity;if(n.part==='chord')copy.instrument='wood';}return copy;});
    const oldPcm=await render(old);
    rows.push({key,mode,now:stats(pcm),old:stats(oldPcm),chordSounds:[...new Set(events.filter(n=>n.part==='chord').map(n=>n.instrument))],storedRecipeUnchanged:JSON.stringify(pattern)===before});
    if(key==='C'&&mode==='image')approvedPcm=Array.from(pcm);
   }
   const pattern=blankPattern();pattern.accompaniment={enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'};
   const first=accompanimentEvents(pattern).find(n=>n.part==='chord'&&n.midi===60),tone=await render([first],1),f=440*2**((60-69)/12);
   const amplitude=ratio=>{let re=0,im=0,sum=0;const from=Math.round(.18*rate),end=Math.round(.4*rate);for(let i=from;i<end;i++){const w=.5-.5*Math.cos(2*Math.PI*(i-from)/(end-from-1)),a=2*Math.PI*f*ratio*i/rate;re+=tone[i]*w*Math.cos(a);im+=tone[i]*w*Math.sin(a);sum+=w;}return 2*Math.hypot(re,im)/sum;};
   const half=Math.hypot(...[.5,1.5,2.5,3.5,4.5,5.5].map(amplitude)),integer=Math.hypot(...[1,2,3,4,5].map(amplitude));
   return {rate,rows,halfToIntegerRatio:half/integer,approvedPcm};
  });
  for(const row of audio.rows){assert.deepEqual(row.chordSounds,['piano']);assert.ok(row.storedRecipeUnchanged);assert.ok(row.now.finite&&row.now.rms>.001&&row.now.peak<.95);assert.ok(row.now.rms<row.old.rms*.8);}
  assert.ok(audio.halfToIntegerRatio<.001,'automatic chord sound removes the strong bell partials');
  if(process.env.SAEZURI_APPROVED_WAV){
   const wav=fs.readFileSync(process.env.SAEZURI_APPROVED_WAV);assert.equal(wav.readUInt32LE(24),audio.rate);assert.equal(wav.length,44+audio.approvedPcm.length*2);
   let maxDifference=0;for(let i=0;i<audio.approvedPcm.length;i++)maxDifference=Math.max(maxDifference,Math.abs(wav.readInt16LE(44+i*2)-Math.round(audio.approvedPcm[i]*32767)));
   assert.ok(maxDifference<=1,'production synthesis agrees with the approved comparison within 1/32767');audio.approvedWavMaxDifference=maxDifference;
  }
  delete audio.approvedPcm;assert.deepEqual(errors,[]);await context.close();
  console.log(JSON.stringify({result:'PASS',check:'actual PCM, legacy recipe, reduced backing, bell partials',...audio}));

  for(const explicit of [false,true]){
   const context=await browser.newContext({viewport:{width:390,height:740},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.goto(base+'/probe/saezuri/');
   const saved=await page.evaluate(async explicit=>{
    const {SongStore}=await import('/saezuri/song-store.js'),{generateImageAccompaniment}=await import('/saezuri/music/image-arrangement.js'),{emptySequence}=await import('./sequence-session.js');
    const {setMicrophoneEnabled}=await import('/src/speech/microphone.js');setMicrophoneEnabled(false);
    const pattern={bars:4,gridStep:1,key:{tonicPitchClass:0,mode:'major'},notes:[{id:'n',midi:60,startTick:0,durationTick:4,origin:'detected'}]};
    pattern.accompaniment=generateImageAccompaniment(pattern,{type:'nursery',speed:'normal',mood:'bright'});pattern.accompaniment.imageArrangement.sounds.chord='wood';
    if(explicit)pattern.accompaniment.sounds={chord:'wood'};
    const payload={title:'伴奏の確認',checkpoint:{confirmed:{pattern,cursor:4,hasRest:false},draft:null},sequence:emptySequence(),settings:{tempo:120,instrument:'piano'}};
    await new SongStore().save('nursery-check',payload);
    const url=performance.getEntriesByType('resource').find(r=>/\/audio\.js\?/.test(r.name)).name,{ProbeTransport}=await import(url),start=ProbeTransport.prototype.start;
    ProbeTransport.prototype.start=function(notes,options){window.lastBacking={loop:options.loop,events:options.accompaniment};return start.call(this,notes,options);};
    return payload;
   },explicit);
   const expected=explicit?'wood':'piano';
   await page.locator('#home-songs').click();await page.locator('.song-row button').filter({hasText:'▶ 聴く'}).click();
   await page.waitForFunction(()=>window.lastBacking?.events?.length);
   assert.deepEqual(await page.evaluate(()=>[...new Set(lastBacking.events.filter(e=>e.part==='chord').map(e=>e.instrument))]),[expected]);
   await page.locator('#song-list-stop').click();await page.locator('[data-song-open="nursery-check"]').click();
   if(await page.locator('#song-continue').isVisible())await page.locator('#song-continue').click();
   await revealCreationControl(page,'#image-settings-open');await page.locator('#image-settings-open').click();await page.locator('#image-sounds').click();
   assert.equal(await page.locator('#sound-chord').inputValue(),expected,'picker agrees with the sound heard from the saved recipe');
   await page.locator('#sounds-close').click();await page.locator('#backing-settings-close').click();
   await revealCreationControl(page,'#backing-loop');await page.locator('#backing-loop').click();
   await page.waitForFunction(()=>window.lastBacking?.loop===true);
   assert.deepEqual(await page.evaluate(()=>[...new Set(lastBacking.events.filter(e=>e.part==='chord').map(e=>e.instrument))]),[expected]);
   await page.locator('#stop').click();
   const after=await page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return (await new SongStore().get('nursery-check')).data;});
   assert.deepEqual(after,saved,'opening, previewing and looping do not rewrite the saved melody or settings');
   assert.deepEqual(errors,[]);await context.close();
   console.log(JSON.stringify({result:'PASS',check:'saved library playback, picker, loop, no mutation',explicitBell:explicit,chordSound:expected}));
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
