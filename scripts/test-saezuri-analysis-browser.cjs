const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.SAEZURI_BASE || 'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/probe/saezuri/');
  await page.locator('#score svg').first().waitFor();
  const results=await page.evaluate(async()=>{
   const outputs=[];
   for(const fixture of ['alternating','reattacks','short-recovery','silence']) {
    const sr=48000, samples=new Float32Array(sr*8);let phase=0,seed=4321;
    for(let i=0;i<samples.length;i++){
     const t=i/sr;
     if(fixture==='silence')continue;
     if(fixture==='reattacks'){
      if(t>=4)continue;
      if(t%.5>=.4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=(seed/4294967296-.5)*.055;continue;}
      samples[i]=.2*Math.sin(2*Math.PI*196*t);continue;
     }
     if(fixture==='short-recovery'&&t>=1)continue;
     const midi=fixture==='alternating'?55+Math.floor(t/.25)%2:[55,61][Math.floor(t*6)%2];
     phase+=2*Math.PI*440*2**((midi-69)/12)/sr;
     samples[i]=.2*Math.sin(phase)+.04*Math.sin(phase*2);
    }
    const worker=new Worker(new URL('./worker.js',location.href),{type:'module'});
    try {
     const result=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('analysis timed out')),20000);
      worker.onmessage=e=>{clearTimeout(timeout);resolve(e.data);};
      worker.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));};
      worker.postMessage({samples,sampleRate:sr,tempo:120,sessionId:1,options:{windowSize:4096,boundaryMode:'energy-gated',adaptiveWindow:true,smoothingMs:120,noteMode:'sustain',maxGapSeconds:.1,minDetectedRatio:.1,countSound:false,recordCount:false}},[samples.buffer]);
     });
     outputs.push({fixture,notes:result.notes.map(n=>[n.startTick,n.durationTick,n.midi]),empty:result.empty,diagnostics:result.analysisDiagnostics,comparison:result.analysisComparison,comparisonMs:result.comparisonMs});
    } finally {worker.terminate();}
   }
   return outputs;
  });
  assert.deepEqual(results[0].notes,Array.from({length:32},(_,i)=>[i*2,2,55+i%2]));
  assert.equal(results[1].notes.length,8);
  assert.deepEqual(results[1].notes.map(n=>n[0]),Array.from({length:8},(_,i)=>i*4));
  assert.ok(results[1].diagnostics.gapDecisions.some(d=>d.reason==='energy-reattack'));
  assert.ok(results[2].diagnostics.shortWindowFrames>=4);
  assert.ok(Array.isArray(results[2].diagnostics.quantizationAdjustments));
  assert.equal(results[3].empty,true);
  assert.equal(results[3].notes.length,0);
  for(const result of results){
   assert.equal(result.comparison?.input,'same-pitch-frames');
   assert.deepEqual(result.comparison.variants.map(v=>v.mode),['current','detail','unsmoothed']);
   assert.deepEqual(result.comparison.variants[0].notes,result.notes);
   assert.equal(result.comparison.pitchTrace.rows.split('\n').length,375);
   assert.ok(Number.isFinite(result.comparisonMs)&&result.comparisonMs>=0);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',cases:results.map(r=>({fixture:r.fixture,notes:r.notes.length,shortWindowFrames:r.diagnostics.shortWindowFrames,gapDecisions:r.diagnostics.gapDecisions.length})),errors}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
