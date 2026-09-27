const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone']});
  await context.addInitScript(()=>{
   const NativeWorker=window.Worker;
   window.Worker=class extends NativeWorker{
    async postMessage(data,transfer){
     if(data.acousticSync && data.samples){
      const {shakerSamples}=await import('/probe/saezuri/capture-support.js');
      const {samples,sampleRate:sr,timing}=data; samples.fill(0);
      const origin=timing.captureStartFrame/sr,delay=.22;
      if(!window.omitCount)timing.countTimes.forEach((t,k)=>{
       const wave=shakerSamples(sr,timing.countBeats[k]%4===0),at=Math.round((t+delay-origin)*sr);
       for(let i=0;i<wave.length&&at+i<samples.length;i++)samples[at+i]+=.4*wave[i];
      });
      const first=Math.round((timing.musicalStart+(window.omitCount?timing.correctionSeconds:delay)-origin)*sr);
      for(let i=0;i<sr*2;i++)samples[first+i]+=.2*Math.sin(2*Math.PI*220*i/sr);
     }
     super.postMessage(data,transfer);
    }
   };
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/probe/saezuri/');await page.locator('#score svg').first().waitFor();
  await page.locator('#tempo').fill('180');await page.locator('#timing-adjust').fill('0');
  for(const omitCount of [false,true]){
   await page.evaluate(v=>{window.omitCount=v;},omitCount);
   await page.locator('#capture').click();assert.equal(await page.locator('#acoustic-sync').isDisabled(),true);
   await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='idle',null,{timeout:25000});
   const report=JSON.parse(await page.locator('#metrics').innerText());
   assert.equal(report.prototype,'ML-T01-v12');
   assert.equal(report.capture.acousticTiming.status,omitCount?'unavailable':'measured');
   assert.match(await page.locator('#acoustic-status').innerText(),omitCount?/従来の推定補正/:/220ms/);
   assert.equal(report.capture.notes[0].startTick,0);assert.equal(report.capture.notes[0].midi,57);
   assert.ok(report.capture.unquantizedNotes.length>0);
   assert.equal(await page.locator('#acoustic-sync').isDisabled(),false);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',base,ui:'measured/fallback status, diagnostics and control lock',input:'synthetic Worker input after actual capture'}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
