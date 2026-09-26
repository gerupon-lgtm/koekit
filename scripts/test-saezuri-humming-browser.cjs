const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.SAEZURI_BASE || 'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/probe/saezuri/');
  // Exercise the actual worker's default and explicit comparison options.
  const modes=await page.evaluate(async()=>{
   const results={};
   for(const noteMode of [undefined,'sustain','detail']) {
    let phase=0;
    const samples=Float32Array.from({length:96000},(_,i)=>{
     const midi=54.2+.85*Math.sin(2*Math.PI*5*i/48000+1.1);
     phase+=2*Math.PI*440*2**((midi-69)/12)/48000;
     return .2*Math.sin(phase)+.05*Math.sin(2*phase);
    });
    results[noteMode??'default']=await new Promise((resolve,reject)=>{
     const worker=new Worker('./worker.js',{type:'module'});
     const timeout=setTimeout(()=>{worker.terminate();reject(new Error('worker timeout'));},10000);
     worker.onerror=e=>{clearTimeout(timeout);worker.terminate();reject(new Error(e.message));};
     worker.onmessage=({data})=>{clearTimeout(timeout);worker.terminate();resolve(data.notes.map(n=>[n.startTick,n.durationTick,n.midi]));};
     worker.postMessage({samples,sampleRate:48000,tempo:120,sessionId:1,options:{smoothingMs:80,noteMode}},[samples.buffer]);
    });
   }
   return results;
  });
  assert.deepEqual(modes.default,[[0,16,54]]);
  assert.deepEqual(modes.sustain,modes.default);
  assert.ok(modes.detail.length>1);
  const result=await page.evaluate(async()=>{
   const {ProbeCapture}=await import('./capture.js');
   const {setMicrophoneEnabled}=await import('../../src/speech/microphone.js');
   const {scheduleShaker,filterCaptureSamples}=await import('./capture-support.js');
   const {analyzeSamples}=await import('./analyzer.js');
   setMicrophoneEnabled(true);
   const offline=new OfflineAudioContext(1,48000,48000);
   scheduleShaker(offline,0.1); scheduleShaker(offline,0.6,true);
   const count=(await offline.startRendering()).getChannelData(0);
   const countFrames=analyzeSamples(filterCaptureSamples(count,48000),48000);
   const ctx=new AudioContext(); await ctx.resume();
   const input=ctx.createMediaStreamDestination(), original=navigator.mediaDevices.getUserMedia;
   navigator.mediaDevices.getUserMedia=async()=>input.stream;
   const states=[];
   let resolve,reject;
   const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});
   const timer=setTimeout(()=>reject(new Error('capture timed out')),20000);
   const capture=new ProbeCapture(ctx,(state,reason)=>{states.push(state); if(reason)reject(new Error(reason));},resolve);
   try {
    // Deliberately delayed input: correction must capture the late tail too.
    const manualMs=150-1000*((ctx.baseLatency||0)+(ctx.outputLatency||0)+(input.stream.getAudioTracks()[0].getSettings().latency||0));
    await capture.start(120,{manualMs,smoothingMs:80,countSound:true,recordCount:true,processing:false});
    const countEvents=capture.counts.length;
    const sr=ctx.sampleRate, pitches=[55,52,55,50,48,47,55];
    const buffer=ctx.createBuffer(1,sr*8,sr), samples=buffer.getChannelData(0);
    let phase=0;
    for(let i=0;i<samples.length;i++) {
     const t=i/sr, note=Math.floor(t), within=t-note;
     if(note>=7 || within>=0.75)continue;
     phase+=2*Math.PI*440*2**((pitches[note]+0.55*Math.sin(2*Math.PI*5*within)-69)/12)/sr;
     samples[i]=0.2*Math.sin(phase)+0.04*Math.sin(2*phase);
    }
    const source=ctx.createBufferSource();source.buffer=buffer;source.connect(input);
    source.start(capture.startTime+0.15);
    const data=await finished;
    source.disconnect();
    return {notes:data.notes.map(n=>[n.startTick,n.durationTick,n.midi]),timing:data.timing,countEvents,states,
     countOnlySilent:countFrames.every(f=>f.kind==='silence'),tracksEnded:input.stream.getTracks().every(t=>t.readyState==='ended'),samples:data.samples,sampleRate:data.sampleRate};
   } finally {clearTimeout(timer);capture.cancel();capture.unsubscribe();navigator.mediaDevices.getUserMedia=original;await ctx.close();}
  });
  assert.deepEqual(result.notes,[55,52,55,50,48,47,55].map((m,i)=>[i*8,6,m]));
  assert.equal(result.countEvents,22);
  assert.ok(result.states.includes('recording'));
  assert.equal(result.countOnlySilent,true);
  assert.equal(result.tracksEnded,true);
  assert.equal(result.samples,result.sampleRate*8);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',base,modes,input:'synthetic delayed seven-note waveform',...result,states:[...new Set(result.states)]}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
