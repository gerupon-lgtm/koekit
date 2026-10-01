const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8014';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/probe/saezuri/');
 const rendered=await page.evaluate(async()=>{
  const {AudioMixer}=await import('./volume.js'),{ProbeTransport}=await import('./audio.js'),{ProbeCapture}=await import('./capture.js');
  const {setMicrophoneEnabled}=await import('../../src/speech/microphone.js');setMicrophoneEnabled(true);
  const stats=pcm=>({peak:pcm.reduce((v,n)=>Math.max(v,Math.abs(n)),0),rms:Math.sqrt(pcm.reduce((v,n)=>v+n*n,0)/pcm.length),first:pcm.findIndex(n=>n!==0),finite:pcm.every(Number.isFinite)});
  const facade=ctx=>new Proxy(ctx,{get(target,key){if(key==='state')return 'running';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  async function play(levels,parts={melody:true,backing:true,count:true},direct=false){
   const offline=new OfflineAudioContext(1,48000,48000),ctx=facade(offline),mix=direct?null:new AudioMixer(ctx,levels),transport=new ProbeTransport(ctx,()=>{},mix);
   try{transport.start(parts.melody?[{midi:69,startTick:0,durationTick:4}]:[],{tempo:120,totalTicks:4,lead:.1,ahead:1,countSound:parts.count,countVolume:direct?1:2,accompaniment:parts.backing?[{midi:60,startTick:0,durationTick:4,instrument:'sine',gain:.045}]:[]});return stats((await offline.startRendering()).getChannelData(0));}finally{transport.stop(false);}
  }
  async function capture(levels){
   const offline=new OfflineAudioContext(1,192000,48000),ctx=facade(offline),mix=new AudioMixer(ctx,levels),recorder=new ProbeCapture(ctx,()=>{},()=>{},mix);
   recorder.connectInput=async()=>{recorder.inputSettings={};recorder.node={port:{postMessage(){},close(){}},disconnect(){}};return true;};
   try{await recorder.start(180,{countSound:true,recordCount:false,countVolume:2,acousticSync:true});const timing=recorder.timing;return {...stats((await offline.startRendering()).getChannelData(0)),captureStartFrame:timing.captureStartFrame,startFrame:timing.startFrame};}finally{recorder.cancel();recorder.unsubscribe();}
  }
  return {normalDirect:await play({},undefined,true),normal:await play({}),halfMaster:await play({master:.5}),muteMaster:await play({master:0}),noCount:await play({count:0}),withoutCount:await play({}, {melody:true,backing:true,count:false}),noBacking:await play({backing:0}),withoutBacking:await play({}, {melody:true,backing:false,count:true}),countBase:await play({}, {count:true}),countDouble:await play({count:2},{count:true}),backingBase:await play({}, {melody:false,backing:true,count:false}),backingDouble:await play({backing:2},{melody:false,backing:true,count:false}),maximum:await play({count:2,backing:2,master:2}),recordBase:await capture({}),recordHalf:await capture({count:.5}),recordMute:await capture({master:0})};
 });
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} vs ${b}`);
 near(rendered.normal.rms,rendered.normalDirect.rms);assert.equal(rendered.normal.first,rendered.normalDirect.first,'default output keeps the old audio timing');
 near(rendered.halfMaster.rms,rendered.normal.rms*.5);assert.equal(rendered.muteMaster.peak,0);near(rendered.noCount.rms,rendered.withoutCount.rms);near(rendered.noBacking.rms,rendered.withoutBacking.rms);near(rendered.backingDouble.rms,rendered.backingBase.rms*2);
 near(rendered.countDouble.rms,rendered.countBase.rms*2);
 near(rendered.recordHalf.rms,rendered.recordBase.rms*.5);assert.equal(rendered.recordMute.peak,0);assert.equal(rendered.recordMute.captureStartFrame,rendered.recordMute.startFrame,'muted count does not attempt acoustic calibration');assert.equal(rendered.recordHalf.first,rendered.recordBase.first);assert.equal(rendered.halfMaster.first,rendered.normal.first);
 for(const result of Object.values(rendered))assert.ok(result.finite&&result.peak<=.950001);
 await page.locator('#home-create').click();await page.locator('#new-image').click();await page.locator('#screen-settings').click();
 await page.screenshot({path:'.local-tools/saezuri-volume-settings.png'});
 for(const [id,value] of [['count-volume','0.5'],['backing-volume','2'],['master-volume','1.5']])await page.locator('#'+id).selectOption(value);
 await page.locator('#settings-close').click();assert.equal(await page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return (await new SongStore().list()).length;}),0,'volume settings do not allocate a song');
 await page.reload();await page.locator('#home-create').click();await page.locator('#new-image').click();await page.locator('#screen-settings').click();assert.equal(await page.locator('#count-volume').inputValue(),'0.5');assert.equal(await page.locator('#backing-volume').inputValue(),'2');assert.equal(await page.locator('#master-volume').inputValue(),'1.5');await page.locator('#settings-close').click();await page.locator('#capture-edit-confirm').click();
 await page.locator('#mic').click();await page.locator('#backing-loop').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');await page.locator('#screen-settings').click();await page.locator('#backing-volume').selectOption('0');await page.locator('#master-volume').selectOption('0.5');assert.equal(await page.locator('#status').getAttribute('data-state'),'playing');await page.locator('#settings-close').click();await page.locator('#report').evaluate(n=>n.click());const report=JSON.parse(await page.locator('#metrics').textContent());assert.deepEqual(report.playback.audioLevels,{count:.5,backing:0,master:.5});await page.locator('#stop').click();
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){await page.setViewportSize(viewport);await page.locator('#screen-settings').click();const layout=await page.locator('.volume-settings').evaluate(node=>{const boxes=[...node.querySelectorAll('select')].map(n=>n.getBoundingClientRect());return {oneRow:boxes.every(b=>Math.abs(b.top-boxes[0].top)<1),contained:boxes.every(b=>b.left>=0&&b.right<=innerWidth),overflow:document.documentElement.scrollWidth>innerWidth,boxes:boxes.map(b=>({x:b.x,y:b.y,width:b.width}))};});assert.ok(layout.oneRow&&layout.contained&&!layout.overflow,JSON.stringify({viewport,layout}));await page.locator('#settings-close').click();}
 assert.deepEqual(errors,[]);console.log('PASS volume: independent/mute/master audio, recording count, peak limit, timing, persistence, live loop adjustment, no song slot, four screen sizes');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
