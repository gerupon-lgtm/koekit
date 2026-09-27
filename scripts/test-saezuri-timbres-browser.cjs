const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8014';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();await page.goto(base+'/probe/saezuri/');
  const results=await page.evaluate(async()=>{
   const {schedulePlaybackCount,COUNT_STYLES}=await import('./playback-count.js');
   const {scheduleVoice}=await import('./audio.js');
   const rendered=[];
   for(const style of COUNT_STYLES) for(const volume of [.5,1,2]) {
    const ctx=new OfflineAudioContext(1,24000,48000);
    schedulePlaybackCount(ctx,.05,false,volume,style);
    schedulePlaybackCount(ctx,.25,true,volume,style);
    const pcm=(await ctx.startRendering()).getChannelData(0);
    const peak=(start,end)=>pcm.subarray(start*48000,end*48000).reduce((p,s)=>Math.max(p,Math.abs(s)),0);
    rendered.push({style,volume,peak:peak(.05,.20),accent:peak(.25,.40),
      quietBefore:peak(0,.05),quietAfter:peak(.4,.5)});
    const cancelCtx=new OfflineAudioContext(1,24000,48000);
    const stop=schedulePlaybackCount(cancelCtx,.1,false,volume,style);stop();
    if((await cancelCtx.startRendering()).getChannelData(0).some(s=>s!==0)) throw Error('cancellation '+style);
   }
   const voices=[];
   for(const instrument of ['lead','piano']) {
    const ctx=new OfflineAudioContext(1,48000,48000);
    scheduleVoice(ctx,ctx.destination,{midi:69,time:.1,duration:.6,instrument});
    const pcm=(await ctx.startRendering()).getChannelData(0);
    const rms=(a,b)=>Math.sqrt(pcm.subarray(a*48000,b*48000).reduce((s,v)=>s+v*v,0)/((b-a)*48000));
    voices.push({instrument,rms:rms(.5,.65),peak:pcm.reduce((p,v)=>Math.max(p,Math.abs(v)),0),
      silentEnd:pcm.subarray(40000).every(v=>v===0),finite:pcm.every(Number.isFinite)});
   }
   return {rendered,voices};
  });
  for(const r of results.rendered) {
   assert.ok(r.peak>0 && r.accent>r.peak && r.accent<1);
   assert.equal(r.quietBefore,0);assert.equal(r.quietAfter,0);
   const unit=results.rendered.find(x=>x.style===r.style && x.volume===1);
   assert.ok(Math.abs(r.peak/unit.peak-r.volume)<1e-5);
  }
  for(const r of results.voices) {assert.ok(r.rms>0 && r.peak<1);assert.ok(r.finite && r.silentEnd);}
  assert.ok(results.voices[0].rms>results.voices[1].rms,'lead sustains more than piano');
  console.log(JSON.stringify({result:'PASS',base,...results}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
