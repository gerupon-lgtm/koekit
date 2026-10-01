const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8018';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.audioStarts=[];
   for(const [method,kind] of [['createOscillator','voice'],['createBufferSource','buffer']]){
    const create=AudioContext.prototype[method];
    AudioContext.prototype[method]=function(...args){
     const source=create.apply(this,args),start=source.start.bind(source),ctx=this;
     source.start=(time,...rest)=>{window.audioStarts.push({kind,time,queuedAt:ctx.currentTime,duration:source.buffer?.duration});return start(time,...rest);};
     return source;
    };
   }
  });
  await page.goto(base+'/probe/saezuri/');
  assert.deepEqual(errors,[],'application initialization');
  const transport=await page.evaluate(async()=>{
   const {ProbeTransport}=await import('./audio.js');
   const ctx=new AudioContext();await ctx.resume();await new Promise(r=>setTimeout(r,100));const results=[];
   try{
    for(const loop of [false,true]){
     window.audioStarts=[];let reason=null;
     const player=new ProbeTransport(ctx,r=>{reason=r;});
     player.start([{midi:72,startTick:0,durationTick:4}],{loop,totalTicks:16,countSound:true,
      accompaniment:[{midi:60,startTick:0,durationTick:4,instrument:'piano',gain:.1}]});
     const initial=structuredClone(player.metrics),head=player.anchor,starts=structuredClone(window.audioStarts);
     // Model a slow synchronous score render across the first audio deadline.
     const deadline=performance.now()+380;while(performance.now()<deadline){}
     await new Promise(r=>setTimeout(r,20));
     if(loop)await new Promise(r=>setTimeout(r,1950));
     results.push({loop,initial,head,starts,active:player.active,reason,
      countTicks:window.audioStarts.filter(s=>s.kind==='buffer').map(s=>(s.time-head)*8),
      voiceTicks:[...new Set(window.audioStarts.filter(s=>s.kind==='voice').map(s=>(s.time-head)*8))]});
     player.stop(false);
    }
   }finally{await ctx.close();}
   // Compare the actual first beat with an already-queued reference rendering.
   const facade=ctx=>new Proxy(ctx,{get(target,key){if(key==='state')return 'running';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
   const pcm=[];
   for(const ahead of [.15,1]){
    const offline=new OfflineAudioContext(1,48000,48000),player=new ProbeTransport(facade(offline));
    player.start([{midi:72,startTick:0,durationTick:4}],{totalTicks:4,lead:.35,ahead,countSound:true});
    try{pcm.push(Array.from((await offline.startRendering()).getChannelData(0)));}finally{player.stop(false);}
   }
   return {results,first:pcm[0].findIndex(n=>n!==0),referenceFirst:pcm[1].findIndex(n=>n!==0),
    peak:Math.max(...pcm[0].map(Math.abs)),maxFirstBeatDifference:Math.max(...pcm[0].map((n,i)=>Math.abs(n-pcm[1][i])))};
  });
  await page.locator('#home-create').click();await page.locator('#new-image').click();
  await page.locator('#capture-edit-confirm').click();await page.locator('#mic').click();
  const loops=[];
  for(const [i,countSound] of [true,true,true,true,false].entries()){
   if(i===3){await page.locator('#composer-key').selectOption('Am');await page.locator('#capture-edit-confirm').click();await page.locator('#phrase-bars').selectOption('8');await page.locator('#capture-edit-confirm').click();}
   await page.evaluate(enabled=>{
    document.querySelector('#play-count').checked=enabled;
    document.querySelector('#play-count-style').value='stick';window.audioStarts=[];
   },countSound);
   await page.locator('#backing-loop').click();
   await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
   await page.waitForTimeout(600);
   const starts=await page.evaluate(()=>window.audioStarts);
   await page.locator('#stop').click();
   await page.locator('#report').evaluate(n=>n.click());
   const report=JSON.parse(await page.locator('#metrics').textContent());
   loops.push({countSound,starts,playback:report.playback});
  }
  console.log(JSON.stringify({base,transport:transport.results.map(r=>({loop:r.loop,initial:r.initial,active:r.active,reason:r.reason,countTicks:r.countTicks,voiceTicks:r.voiceTicks})),firstSample:transport.first,referenceFirstSample:transport.referenceFirst,maxWaveformDifference:transport.maxFirstBeatDifference,loops:loops.map(l=>({countSound:l.countSound,bars:l.playback.bars,countEvents:l.playback.countEvents}))}));
  for(const run of transport.results){
   assert.equal(run.initial.events,1,'first melody must be queued before returning to UI');
   assert.equal(run.initial.accompanimentEvents,1,'first backing chord must be queued before returning to UI');
   assert.equal(run.initial.countEvents,1,'first count must be queued before returning to UI');
   assert.ok(run.starts.length>0);
   assert.ok(run.starts.every(s=>s.time===run.head&&s.queuedAt<s.time),'first voices/count share the future head');
   assert.equal(run.active,true,'slow initial UI must not drop the first beat');assert.equal(run.reason,null);
   if(run.loop){assert.deepEqual(run.countTicks.map(Math.round),[0,4,8,12,16]);assert.deepEqual(run.voiceTicks.map(Math.round),[0,16]);}
  }
  assert.ok(transport.first>=.35*48000&&transport.first<.35*48000+2);
  assert.equal(transport.first,transport.referenceFirst);assert.ok(transport.peak>0);assert.ok(transport.maxFirstBeatDifference<1e-6,'full first-beat waveform matches queued reference');
  for(const loop of loops){
   const counts=loop.starts.filter(s=>s.kind==='buffer'&&s.duration<.03),voices=loop.starts.filter(s=>s.kind==='voice');
   assert.ok(voices.length>0,'loop has backing voices');
   if(loop.countSound){
    assert.ok(counts.length>0,'loop must honor enabled playback count');
    assert.equal(counts[0].time,voices[0].time,'first count and backing share the head');
    assert.ok(counts[0].duration<.03,'loop must honor selected stick count');
    assert.ok(loop.playback.countEvents>0);
   }else {assert.equal(counts.length,0,'disabled count stays silent');assert.equal(loop.playback.countEvents,0);}
   assert.ok(voices[0].queuedAt<voices[0].time-.2,'UI loop queues the head before rendering');
  }
  // All progression auditions and ordinary previews use the same startup path.
  await page.evaluate(()=>{document.querySelector('#play-count').checked=true;});
  const checkHead=async(trigger,stop)=>{
   await page.evaluate(()=>{window.audioStarts=[];});await trigger.click();
   await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
   const starts=await page.evaluate(()=>window.audioStarts),count=starts.find(s=>s.kind==='buffer'&&s.duration<.03),voice=starts.find(s=>s.kind==='voice');
   assert.ok(count&&voice,'preview queues both first count and chord immediately');assert.equal(count.time,voice.time);
   assert.ok(voice.queuedAt<voice.time-.2);await stop.click();
  };
  for(const key of ['Am','C']){
   if(key==='C'){await page.locator('#composer-key').selectOption(key);await page.locator('#capture-edit-confirm').click();}
   await page.locator('#image-suggest').click();
   for(let i=0;i<4;i++)await checkHead(page.locator('.suggestion-row').nth(i).locator('button').first(),page.locator('#progression-stop'));
   await page.locator('#progression-close').click();await checkHead(page.locator('#preview'),page.locator('#stop'));
  }
  assert.deepEqual(errors,[]);console.log('first beat/count, slow initial rendering, native PCM and loop restarts: PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
