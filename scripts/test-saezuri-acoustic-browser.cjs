const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/probe/saezuri/');await page.locator('#score svg').first().waitFor();
  const results=await page.evaluate(async()=>{
   const {ProbeCapture}=await import('./capture.js');
   const {setMicrophoneEnabled}=await import('../../src/speech/microphone.js');
   const {shakerSamples}=await import('./capture-support.js');
   setMicrophoneEnabled(true);
   const ctx=new AudioContext();await ctx.resume();
   const original=navigator.mediaDevices.getUserMedia,outputs=[];
   try{
    for(const counts of [true,false]){
     const input=ctx.createMediaStreamDestination();navigator.mediaDevices.getUserMedia=async()=>input.stream;
     let resolve,reject;const done=new Promise((a,b)=>{resolve=a;reject=b;});
     const timer=setTimeout(()=>reject(Error('capture timeout')),20000);
     const capture=new ProbeCapture(ctx,(state,reason)=>{if(reason)reject(Error(reason));},resolve);
     try{
      const tempo=180,delay=.173;
      await capture.start(tempo,{acousticSync:true,countSound:true,recordCount:true,manualMs:0,smoothingMs:80,noteMode:'sustain',processing:false});
      const sr=ctx.sampleRate,timing=capture.timing;
      const origin=timing.captureStartFrame/sr;
      const raw=new Float32Array(timing.captureEndFrame-timing.captureStartFrame);
      if(counts)timing.countTimes.forEach((t,k)=>{
       const wave=shakerSamples(sr,timing.countBeats[k]%4===0),at=Math.round((t+delay-origin)*sr);
       for(let i=0;i<wave.length&&at+i<raw.length;i++)raw[at+i]+=.45*wave[i];
      });
      const correction=counts?delay:timing.correctionSeconds;
      const start=Math.round((timing.musicalStart+correction-origin)*sr);
      // Deliberate initial eighth rest must survive; seven isolated tones.
      const tick=60/tempo/4;
      for(let n=0;n<7;n++){
       const a=start+Math.round((2+n*8)*tick*sr),len=Math.round((n===6?14:6)*tick*sr),hz=440*2**(([54,51,52,54,49,51,47][n]-69)/12);
       for(let i=0;i<len;i++)raw[a+i]+=.2*Math.sin(2*Math.PI*hz*i/sr);
      }
      const buffer=ctx.createBuffer(1,raw.length,sr);buffer.copyToChannel(raw,0);
      const source=ctx.createBufferSource();source.buffer=buffer;source.connect(input);source.start(origin);
      const result=await done;source.disconnect();
      outputs.push({counts,notes:result.notes.map(n=>[n.startTick,n.durationTick,n.midi]),measurement:result.acousticTiming,timing:result.timing,samples:result.samples,sr,tracksEnded:input.stream.getTracks().every(t=>t.readyState==='ended')});
     }finally{clearTimeout(timer);capture.cancel();capture.unsubscribe();}
    }
   }finally{navigator.mediaDevices.getUserMedia=original;await ctx.close();}
   return outputs;
  });
  assert.equal(results[0].measurement.status,'measured');
  // MediaStreamDestination -> MediaStreamSource adds browser buffering to the
  // injected 173ms. The end-to-end requirement is aligned voice notes below;
  // exact 173ms is independently asserted by the sample-domain Node tests.
  assert.ok(results[0].measurement.delaySeconds>=.170 && results[0].measurement.delaySeconds<.273,JSON.stringify(results));
  assert.ok(results[0].measurement.spreadSeconds<.003);
  assert.equal(results[1].measurement.status,'unavailable');
  for(const r of results){
   assert.deepEqual(r.notes,[54,51,52,54,49,51,47].map((m,i)=>[2+i*8,i===6?14:6,m]));
   assert.equal(r.samples,Math.round(r.sr*16/3));assert.equal(r.tracksEnded,true);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',base,input:'synthetic acoustic path through MediaStream, Worklet and Worker',results}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
