const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8014';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({serviceWorkers:'block'});await page.goto(base+'/probe/saezuri/');
 const results=await page.evaluate(async()=>{
  const {PROGRESSIONS,SOUNDS,accompanimentEvents}=await import('../../saezuri/music/accompaniment.js'),{blankPattern}=await import('./entry-session.js'),{practicePhrases}=await import('./learning-data.js'),{scheduleVoice}=await import('./audio.js');
  const samples=practicePhrases().map(p=>({id:p.id,pattern:p.pattern}));
  for(const key of ['C','Am'])for(const progression of PROGRESSIONS[key])samples.push({id:`${key}/${progression.id}`,pattern:{...blankPattern(key),accompaniment:{enabled:true,genre:'nursery',rhythm:'quarters',progression:progression.id}}});
  const results=[],tempo=180,barSeconds=4*60/tempo,sampleRate=48000;
  for(const sample of samples)for(const sound of SOUNDS){
   const p=structuredClone(sample.pattern);p.accompaniment.enabled=true;p.accompaniment.sounds={chord:sound.id};
   const events=accompanimentEvents(p).filter(n=>n.part==='chord'),ctx=new OfflineAudioContext(1,Math.ceil((p.bars*barSeconds+.1)*sampleRate),sampleRate);
   for(const n of events)scheduleVoice(ctx,ctx.destination,{midi:n.midi,time:n.startTick*60/(tempo*4),duration:n.durationTick*60/(tempo*4),instrument:n.instrument,gain:n.gain});
   const pcm=(await ctx.startRendering()).getChannelData(0),bars=[];
   for(let bar=0;bar<p.bars;bar++){
    const data=pcm.subarray(Math.round(bar*barSeconds*sampleRate),Math.round((bar+1)*barSeconds*sampleRate));
    const pitches=[...new Set(events.filter(n=>n.startTick>=bar*16&&n.startTick<(bar+1)*16).map(n=>n.midi))];
    bars.push({bar:bar+1,pitches,rms:Math.sqrt(data.reduce((v,n)=>v+n*n,0)/data.length),peak:data.reduce((v,n)=>Math.max(v,Math.abs(n)),0),finite:data.every(Number.isFinite)});
   }
   results.push({sample:sample.id,sound:sound.id,bars});
  }
  return results;
 });
 assert.equal(results.length,60);
 for(const result of results)for(const bar of result.bars){assert.ok(bar.finite&&bar.peak>0&&bar.peak<1);assert.ok(bar.rms>.001&&bar.rms>result.bars[0].rms*.25,`${result.sample}/${result.sound}: bar ${bar.bar} fades excessively`);assert.ok(bar.pitches.some(n=>n>=60),`${result.sample}/${result.sound}: no upper voice in bar ${bar.bar}`);}
 await fs.writeFile('.local-tools/saezuri-sample-audio-results.json',JSON.stringify({base,results},null,2));console.log('PASS sample audio: eight progressions and four practice samples, all five chord sounds, 60 renders / 240 bars retain audible upper voices');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
