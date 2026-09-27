const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/probe/saezuri/?view=full');
  const result=await page.evaluate(async()=>{
   const {ProbeTransport}=await import('./audio.js');
   const {scheduleShaker}=await import('./capture-support.js');
   const levels=[];
   for(const volume of [.5,1,2]){
    const render=new OfflineAudioContext(1,48000,48000);
    scheduleShaker(render,.1,false,volume);scheduleShaker(render,.5,true,volume);
    const pcm=(await render.startRendering()).getChannelData(0);
    const peak=(a,b)=>pcm.subarray(a,b).reduce((p,s)=>Math.max(p,Math.abs(s)),0);
    levels.push({regular:peak(4800,9600),accent:peak(24000,28800)});
   }
   const offline=new OfflineAudioContext(1,48000,48000);
   const cancel=scheduleShaker(offline,0.4,true);cancel();
   const cancelledSamples=(await offline.startRendering()).getChannelData(0);
   const ctx=new AudioContext();await ctx.resume();
   const scheduled=[],makeSource=ctx.createBufferSource.bind(ctx);
   ctx.createBufferSource=()=>{
    const source=makeSource(),start=source.start.bind(source),stop=source.stop.bind(source);
    const info={stopped:false};
    source.start=time=>{info.time=time;info.duration=source.buffer.duration;scheduled.push(info);start(time);};
    source.stop=()=>{info.stopped=true;stop();};
    return source;
   };
   let timer,transport;
   try {
    const ended=new Promise((resolve,reject)=>{
     timer=setTimeout(()=>reject(new Error('count playback timeout')),6000);
     transport=new ProbeTransport(ctx,(reason,metrics)=>resolve({reason,metrics}));
    });
    // Five silent beats still need counts; the fifth is the next bar head.
    transport.start([],{tempo:180,totalTicks:20,countSound:true});
    const anchor=transport.anchor,complete=await ended;
    clearTimeout(timer);
    const beats=scheduled.map(s=>({tick:Math.round((s.time-anchor)*12),duration:s.duration}));
    transport.start([],{tempo:180,totalTicks:64,countSound:true,lead:0.05});
    const pending=scheduled.at(-1);
    transport.stop(false);
    const stoppedCount=scheduled.length;
    await new Promise(r=>setTimeout(r,250));
    const leakedAfterStop=scheduled.length!==stoppedCount;
    transport.start([],{countSound:false,lead:0.05});
    await new Promise(r=>setTimeout(r,100));
    transport.stop(false);
    return {levels,complete,beats,pendingStopped:pending.stopped,leakedAfterStop,disabledCount:scheduled.length-stoppedCount,
     cancelledSilent:cancelledSamples.every(s=>s===0)};
   } finally {clearTimeout(timer);transport?.stop(false);await ctx.close();}
  });
  assert.equal(result.complete.reason,'ENDED');
  assert.equal(result.complete.metrics.countEvents,5);
  assert.equal(result.complete.metrics.events,0);
  assert.deepEqual(result.beats.map(b=>b.tick),[0,4,8,12,16]);
  assert.ok(result.beats[0].duration>result.beats[1].duration);
  assert.equal(result.beats[0].duration,result.beats[4].duration);
  assert.equal(result.pendingStopped,true);
  assert.equal(result.leakedAfterStop,false);
  assert.equal(result.disabledCount,0);
  assert.equal(result.cancelledSilent,true);
  for(const kind of ['regular','accent']){
   assert.ok(Math.abs(result.levels[0][kind]/result.levels[1][kind]-.5)<1e-5);
   assert.ok(Math.abs(result.levels[2][kind]/result.levels[1][kind]-2)<1e-5);
   assert.ok(result.levels[2][kind]<1);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',base,...result}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
