const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage({viewport:{width:390,height:640},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const make=AudioContext.prototype.createWaveShaper,resume=AudioContext.prototype.resume;
  AudioContext.prototype.createWaveShaper=function(){const node=make.call(this);this.testLimiter=node;return node;};
  AudioContext.prototype.resume=async function(){await resume.call(this);if(this.testLimiter&&!this.testTape){
   this.testTape=[];const code=`class Tape extends AudioWorkletProcessor {constructor(){super();this.data=new Float32Array(4096);this.used=0;this.first=0;}process(inputs){const a=inputs[0]?.[0];if(a){if(!this.used)this.first=currentFrame;this.data.set(a,this.used);this.used+=a.length;if(this.used===4096){this.port.postMessage({frame:this.first,data:this.data});this.used=0;}}return true;}}registerProcessor('tape',Tape);`;
   const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));try{await this.audioWorklet.addModule(url);}finally{URL.revokeObjectURL(url);}
   const tap=new AudioWorkletNode(this,'tape');this.testLimiter.connect(tap);tap.connect(this.destination);tap.port.onmessage=e=>this.testTape.push(e.data);this.testTap=tap;
  }};
 });
 await page.goto(base+'/probe/saezuri/');await page.locator('#home-create').click();await page.locator('#new-tutorial').click();
 await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(r=>/\/audio\.js\?/.test(r.name)).name;const {ProbeTransport}=await import(url),start=ProbeTransport.prototype.start;ProbeTransport.prototype.start=function(notes,options){const result=start.call(this,notes,options);window.audioTake={ctx:this.ctx,transport:this,notes,options,anchor:this.anchor,countAnchor:this.countAnchor};return result;};});
 const results=[];
 for(let pass=0;pass<2;pass++){
  if(!pass)await page.locator('#learning-model').click();else await page.locator('#learning-preview-melody').click();
  await page.waitForFunction(()=>document.querySelector('#learning-preview').dataset.phase==='count-in');await page.evaluate(()=>{const until=performance.now()+700;while(performance.now()<until){}});await page.waitForFunction(()=>document.querySelector('#learning-preview').dataset.phase==='music');
  await page.evaluate(()=>{const until=performance.now()+700;while(performance.now()<until){}});
  await page.waitForFunction(()=>document.querySelector('#learning-preview').dataset.phase==='idle',null,{timeout:18000});
  const result=await page.evaluate(()=>{
   const {ctx,transport,notes,anchor,countAnchor,options}=audioTake,peak=(time,length)=>{let maximum=0,count=0;for(const block of ctx.testTape){for(let i=Math.max(0,Math.ceil(time*ctx.sampleRate-block.frame));i<Math.min(block.data.length,Math.floor((time+length)*ctx.sampleRate-block.frame));i++){maximum=Math.max(maximum,Math.abs(block.data[i]));count++;}}return {peak:maximum,samples:count};};
   return {mode:transport.metrics.scheduleMode,count:[0,1,2,3].map(i=>peak(countAnchor+i*60/options.tempo,.045)),melody:notes.map(n=>peak(anchor+n.startTick*60/(options.tempo*4)+.01,.04)),events:transport.metrics.events};
  });assert.equal(result.events,15);for(const sample of [...result.count,...result.melody])assert.ok(sample.samples>0&&sample.peak>.0005,JSON.stringify(sample));results.push(result);
 }
 await page.locator('#learning-preview-close').click();assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',base,checks:'native audio output: four count attacks and all fifteen melody attacks, first and repeated audition, 700ms screen stall',results}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
