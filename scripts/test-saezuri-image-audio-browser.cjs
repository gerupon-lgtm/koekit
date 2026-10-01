const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();await page.goto((process.env.SAEZURI_BASE||'http://127.0.0.1:8018')+'/probe/saezuri/');
 const rows=await page.evaluate(async()=>{
  const {IMAGE_TYPES,IMAGE_SPEEDS,IMAGE_MOODS,generateImageAccompaniment}=await import('../../saezuri/music/image-arrangement.js'),{accompanimentEvents}=await import('../../saezuri/music/accompaniment.js'),{blankPattern}=await import('./entry-session.js'),{scheduleVoice}=await import('./audio.js');
  const rows=[],rate=24000,barSeconds=4/3;
  for(const [type] of IMAGE_TYPES)for(const [speed] of IMAGE_SPEEDS)for(const [mood] of IMAGE_MOODS){
   const p=blankPattern();p.accompaniment=generateImageAccompaniment(p,{type,speed,mood});
   // Check the upper instrument separately so bass/drums cannot mask dropouts.
   const ctx=new OfflineAudioContext(1,Math.ceil((4*barSeconds+.1)*rate),rate);
   for(const n of accompanimentEvents(p).filter(n=>n.part==='chord'))scheduleVoice(ctx,ctx.destination,{midi:n.midi,time:n.startTick/12,duration:n.durationTick/12,instrument:n.instrument,gain:n.gain});
   const pcm=(await ctx.startRendering()).getChannelData(0);let peak=0;for(const v of pcm)peak=Math.max(peak,Math.abs(v));
   const bars=Array.from({length:4},(_,bar)=>{const start=Math.ceil(bar*barSeconds*rate),end=Math.floor((bar+1)*barSeconds*rate);let sum=0;for(let i=start;i<end;i++)sum+=pcm[i]*pcm[i];return Math.sqrt(sum/(end-start));});
   rows.push({id:`${type}/${speed}/${mood}`,bars,peak});
  }
  return rows;
 });
 assert.equal(rows.length,48);for(const row of rows){assert.ok(row.bars.every(rms=>rms>.001),`${row.id}: audible chord instrument in all four bars`);assert.ok(Number.isFinite(row.peak)&&row.peak<.98,`${row.id}: finite unclipped chord synthesis`);}
 console.log('48 image combinations: native synthesized upper-instrument audio remains audible in all bars, no clipping: PASS');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
