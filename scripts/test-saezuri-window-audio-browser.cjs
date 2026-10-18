// Compare the actual transport and synthesizer, including rests, dotted notes,
// a note crossing a bar, accompaniment, count sounds and natural releases.
const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/probe/saezuri/');await page.locator('#home-create').waitFor();
 const results=await page.evaluate(async()=>{
  const audioUrl=performance.getEntriesByType('resource').find(r=>/\/audio\.js\?/.test(r.name)).name,suffix=new URL(audioUrl).search;
  const {ProbeTransport}=await import(audioUrl),{AudioMixer}=await import('./volume.js'+suffix),{lightVoiceStats}=await import('./light-voice.js'+suffix),{accompanimentEvents}=await import('../../saezuri/music/accompaniment.js'+suffix);
  const pattern={bars:8,gridStep:2,notes:[0,32,64,96].flatMap(offset=>[[0,6,60],[6,2,64],[8,4,67],[14,10,67],[24,8,62]].map(([startTick,durationTick,midi],i)=>({id:offset+'-'+i,startTick:startTick+offset,durationTick,midi}))),accompaniment:{enabled:true,genre:'pop',rhythm:'offbeat',progression:'pop'}};
  const render=async(scheduleAll,instrument)=>{
   const native=new OfflineAudioContext(1,840000,48000);
   // Offline rendering advances under explicit suspends. Use the real pump at
   // each 250ms boundary, keeping every requested note time unchanged.
   const ctx=new Proxy(native,{get(target,key){if(key==='state')return 'running';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
   const mixer=new AudioMixer(ctx,{count:1,backing:1,master:2}),ended=[];
   const t=new ProbeTransport(ctx,(reason,metrics)=>ended.push({reason,events:metrics.events}),mixer,{engine:'light'});
   let pump;const interval=window.setInterval;window.setInterval=callback=>{pump=callback;return -1;};
   try{t.start(pattern.notes,{tempo:120,totalTicks:128,instrument,lead:.6,ahead:1,countSound:true,countStyle:'rim',accompaniment:accompanimentEvents(pattern),scheduleAll});}finally{window.setInterval=interval;}
   for(let time=.25;time<17.5;time+=.25)native.suspend(time).then(async()=>{await new Promise(resolve=>setTimeout(resolve,0));pump();await native.resume();});
   const pcm=(await native.startRendering()).getChannelData(0);await new Promise(resolve=>setTimeout(resolve,0));
   const result={pcm,mode:t.metrics.scheduleMode,metrics:{...t.metrics},voices:lightVoiceStats(ctx),ended};t.stop(false);return result;
  };
  const results=[];
  for(const instrument of ['piano','strings']){
   const all=await render(true,instrument),windowed=await render(false,instrument);let maximumDifference=0,energy=0;
   for(let i=0;i<all.pcm.length;i++){maximumDifference=Math.max(maximumDifference,Math.abs(all.pcm[i]-windowed.pcm[i]));energy+=all.pcm[i]**2;}
   results.push({instrument,maximumDifference,rms:Math.sqrt(energy/all.pcm.length),all:{mode:all.mode,metrics:all.metrics,voices:all.voices,ended:all.ended},windowed:{mode:windowed.mode,metrics:windowed.metrics,voices:windowed.voices,ended:windowed.ended}});
  }
  return results;
 });
 for(const row of results){
  assert.ok(row.maximumDifference<1e-6,JSON.stringify({instrument:row.instrument,difference:row.maximumDifference}));assert.ok(row.rms>.01);
  for(const data of [row.all,row.windowed]){assert.equal(data.metrics.events,20);assert.equal(data.metrics.accompanimentEvents,176);assert.equal(data.metrics.countEvents,32);assert.equal(data.voices.active,0);assert.equal(data.ended.at(-1)?.reason,'ENDED');}
  assert.ok(row.windowed.voices.maxOscillators<row.all.voices.maxOscillators*.5,'fewer connected future voices without altering samples');
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks:'actual transport PCM equivalence, rests/dotted/tied notes, piano/strings releases, all melody/backing/count events, natural end and bounded graph',results}));
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
