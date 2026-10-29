const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});try{
 const results=[],folder='.local-tools/recording-count-in-20261030';fs.mkdirSync(folder,{recursive:true});
 const page=await browser.newPage({viewport:{width:390,height:740},permissions:['microphone'],serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 await page.addInitScript(()=>{
  window.sources=[];window.streams=[];window.hints=[];window.musicStarts=[];const Native=AudioContext;
  window.AudioContext=class extends Native{constructor(options){super(options);hints.push(options.latencyHint);}};
  const make=Native.prototype.createBufferSource;Native.prototype.createBufferSource=function(){const source=make.call(this),start=source.start.bind(source),stop=source.stop.bind(source),info={stopped:false};source.start=time=>{info.time=time;sources.push(info);return start(time);};source.stop=(...args)=>{info.stopped=true;return stop(...args);};return source;};
  const oscillator=Native.prototype.createOscillator;Native.prototype.createOscillator=function(){const voice=oscillator.call(this),start=voice.start.bind(voice);voice.start=time=>{musicStarts.push(time);return start(time);};return voice;};
  const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await gum(...args);streams.push(stream);return stream;};
 });
 const click=async id=>{await revealCreationControl(page,'#'+id);await page.locator('#'+id).click();},report=async()=>{await page.locator('#report').evaluate(n=>n.click());const r=JSON.parse(await page.locator('#metrics').textContent());return {pattern:r.captureCandidate,editing:r.captureEditing};};
 await page.goto(base+'/probe/saezuri/');await click('home-create');await click('new-manual');await page.locator('#tap-record').waitFor({state:'visible'});
 await page.evaluate(async()=>{
  const version=new URL(document.querySelector('script[src*="app.js"]').src).search;
  const [{ProbeTransport},{ProbeCapture},{KeyboardControls}]=await Promise.all(['audio','capture','keyboard-controls'].map(name=>import('./'+name+'.js'+version)));
  window.starts=[];window.requests=[];const start=ProbeTransport.prototype.start;
  ProbeTransport.prototype.start=function(...args){const result=start.apply(this,args);window.liveTransport=this;starts.push({tempo:this.tempo,anchor:this.anchor,countAnchor:this.countAnchor,preRollTicks:this.preRollTicks,loop:this.loop});return result;};
  const begin=KeyboardControls.prototype.begin;KeyboardControls.prototype.begin=function(pattern,anchor,tempo){requests.push({type:'tap',anchor,tempo,now:this.clock()});return begin.call(this,pattern,anchor,tempo);};
  const capture=ProbeCapture.prototype.start;ProbeCapture.prototype.start=async function(tempo,options){requests.push({type:'hum',anchor:options.loop?.musicalStart,tempo,now:this.ctx.currentTime});window.liveCapture=this;return capture.call(this,tempo,options);};
 });
 const setup=async(tempo,bars)=>{
  await click('screen-settings');await page.locator('#tempo').fill(String(tempo));await page.locator('#tempo').dispatchEvent('change');await page.locator('#play-count').uncheck();await click('settings-close');
  if(await page.locator('#phrase-bars').inputValue()!==String(bars)){await page.locator('#phrase-bars').selectOption(String(bars));await click('capture-edit-confirm');}
 };
 for(const tempo of [60,120,180])for(const bars of [4,8])for(const kind of ['tap','hum']){
  await setup(tempo,bars);const before=await report(),offset=await page.evaluate(()=>({sources:sources.length,streams:streams.length}));
  await click(kind==='tap'?'tap-record':'loop-record');await page.waitForFunction(()=>document.body.classList.contains('recording-focus'));
  const data=await page.evaluate(offset=>({transport:starts.at(-1),request:requests.at(-1),counts:sources.slice(offset.sources).map(s=>s.time),capture:window.liveCapture?.active?{start:liveCapture.startTime,timing:liveCapture.timing,sampleRate:liveCapture.ctx.sampleRate}:null,streams:streams.length-offset.streams}),offset);
  const {transport,request}=data,beat=60/tempo;
  assert.ok(Math.abs((transport.anchor-transport.countAnchor)/beat-8)<1e-8,'stopped recording waits eight beats after its first count');
  const countBeats=data.counts.filter(t=>t<transport.anchor-1e-5).map(t=>(t-transport.countAnchor)/beat);
  assert.deepEqual(countBeats.map(t=>Math.round(t*1e6)/1e6),[0,2,4,5,6,7],'six actual count sources have the 2,2,1,1,1,1 spacing');
  assert.ok(Math.abs(request.anchor-transport.anchor)<1e-8,'recording and accompaniment use the same first head');
  assert.match(await page.locator('#keyboard-status').textContent(),/録音まで あと[1-8]拍/);assert.equal(await page.locator('#piano-keys').isVisible(),kind==='tap');
  if(kind==='hum'){assert.ok(Math.abs(data.capture.start-transport.anchor)<1e-8);assert.equal(data.capture.timing.countTimes.length,0,'the microphone does not add a second count');assert.equal(data.capture.timing.endFrame-data.capture.timing.startFrame,Math.round(bars*4*beat*data.capture.sampleRate));}else assert.equal(data.streams,0,'tap count-in never opens the microphone');
  await click('stop');assert.deepEqual(await report(),before,'cancelling the count-in leaves the accepted song and candidate/history intact');assert.equal(await page.evaluate(()=>streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);assert.equal(await page.evaluate(offset=>sources.slice(offset).every(s=>s.stopped),offset.sources),true,'stop cancels the queued counts');
  results.push({tempo,bars,kind,countBeats,recordingHead:request.anchor});
 }
 // Rehearsal can sound during the count; only post-head input enters the take.
 await setup(180,4);await click('tap-record');await page.waitForFunction(()=>document.querySelector('#recording-guide').dataset.mode==='tap-wait');
 const press=async()=>{const r=await page.locator('#piano-keys [data-midi="60"]').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height-12);await page.mouse.down();await page.waitForTimeout(130);await page.mouse.up();};
 await press();await page.waitForFunction(()=>document.querySelector('#recording-guide').dataset.mode==='tap');await press();await page.screenshot({path:folder+'/recording.png'});await click('stop');
 const take=await report();assert.equal(take.editing.editCandidate.notes.length,1,'count-in practice is excluded from the recording');assert.equal(take.pattern.notes.length,0);await click('capture-edit-confirm');const accepted=await report();
 // A complete stopped humming take keeps the new count outside the samples.
 await click('loop-record');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='count-in');await page.screenshot({path:folder+'/count-in.png'});
 await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='recording');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='idle',null,{timeout:16000});
 await page.locator('#report').evaluate(n=>n.click());const humming=JSON.parse(await page.locator('#metrics').textContent());
 assert.equal(humming.capture.samples,Math.round(humming.capture.sampleRate*16/3));assert.equal(humming.capture.timing.countTimes.length,0);assert.equal(humming.capture.timing.musicalStart,await page.evaluate(()=>starts.at(-1).anchor));assert.deepEqual(humming.captureCandidate.notes,accepted.pattern.notes,'analysis remains a candidate instead of replacing the accepted notes');
 if(humming.captureEditing.pending)await click('capture-edit-undo');
 await page.locator('[data-mode="backing"]').click();await click('image-settings-open');await page.locator('#image-enabled').check();await click('backing-settings-close');await click('capture-edit-confirm');await page.locator('[data-mode="edit"]').click();
 const musicOffset=await page.evaluate(()=>musicStarts.length);await click('tap-record');await page.waitForFunction(()=>document.body.classList.contains('recording-focus'));
 const firstMusic=await page.evaluate(offset=>({first:Math.min(...musicStarts.slice(offset)),head:starts.at(-1).anchor}),musicOffset);assert.ok(Math.abs(firstMusic.first-firstMusic.head)<1e-8,'the first backing sound starts at the recording head, after the count');await click('stop');
 for(const [kind,bars] of [['tap',4],['hum',8]]){
  await setup(180,bars);await click('backing-loop');await page.waitForFunction(()=>liveTransport.active&&liveTransport.ctx.currentTime>=liveTransport.anchor+(liveTransport.totalTicks/4-.7)*60/liveTransport.tempo);
  const startCount=await page.evaluate(()=>starts.length);await click(kind==='tap'?'tap-record':'loop-record');await page.waitForFunction(()=>document.body.classList.contains('recording-focus'));
  const data=await page.evaluate(()=>({transport:starts.at(-1),request:requests.at(-1),starts:starts.length}));assert.equal(data.starts,startCount,'loop reservation does not restart backing or add a pre-roll');assert.equal(data.transport.preRollTicks,0);
  const length=bars*4*60/180,expected=data.transport.anchor+(Math.floor((data.request.now-data.transport.anchor)/length)+1)*length;
  assert.ok(Math.abs(data.request.anchor-expected)<1e-8,'a last-beat request uses the immediately next head');assert.match(await page.locator('#keyboard-status').textContent(),/次の先頭/);await click('stop');
  results.push({kind,bars,loopReservation:data.request.anchor,remainingMs:(expected-data.request.now)*1000});
 }
 assert.equal(accepted.editing.pending,false);assert.deepEqual(await page.evaluate(()=>[...new Set(hints)]),['interactive'],'recording count-in keeps the live audio clock');assert.deepEqual(errors,[]);
 fs.writeFileSync(folder+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({result:'PASS',base,checks:'12 stopped count-ins with actual sources, cancellation and unchanged data; practice excluded; final-beat loop reservations; live clock',results}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
