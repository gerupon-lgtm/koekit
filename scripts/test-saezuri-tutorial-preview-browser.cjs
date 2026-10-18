const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:640},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // The shared component gets its own host; the full app now owns another instance.
  await page.goto(base+'/probe/saezuri/?view=editor');await page.locator('html[data-app-ui-ready]').waitFor();await page.evaluate(()=>document.body.classList.add('melody-app'));
  const timing=await page.evaluate(async()=>{
   const {ProbeTransport}=await import('./audio.js');const ctx=new AudioContext();await ctx.resume();
   const starts=[],oscillators=[],buffer=ctx.createBufferSource.bind(ctx),oscillator=ctx.createOscillator.bind(ctx);
   ctx.createBufferSource=()=>{const source=buffer(),start=source.start.bind(source);source.start=t=>{starts.push(t);start(t);};return source;};
   ctx.createOscillator=()=>{const source=oscillator(),start=source.start.bind(source);source.start=t=>{oscillators.push(t);start(t);};return source;};
   const transport=new ProbeTransport(ctx);try{
    const now=ctx.currentTime;transport.start([{midi:64,startTick:0,durationTick:2}],{tempo:112,totalTicks:8,lead:.2,preRollTicks:16,preRollStep:1});
    const result={anchor:transport.anchor-now,count:starts.map(t=>Math.round((t-now-.2)*112*4/60)),oscillators:oscillators.map(t=>t-transport.anchor),metrics:transport.metrics};
    transport.stop(false);const count=starts.length;await new Promise(r=>setTimeout(r,350));result.leaked=starts.length!==count;
    transport.start([],{countSound:false,lead:.2,totalTicks:4});result.ordinaryLead=transport.anchor-ctx.currentTime;result.ordinaryCounts=transport.metrics.countEvents;return result;
   }finally{transport.stop(false);await ctx.close();}
  });
  assert.deepEqual(timing.count,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);assert.ok(Math.abs(timing.anchor-(.2+60/112*4))<.01);assert.ok(timing.oscillators.every(t=>t>=0));assert.equal(timing.leaked,false);assert.equal(timing.ordinaryCounts,0);assert.ok(timing.ordinaryLead<.21);
  await page.evaluate(async()=>{
   const {TutorialPreview}=await import('./tutorial-preview.js'),{tutorialPattern,tutorialExcerpt}=await import('./tutorial-data.js'),{ProbeTransport}=await import('./audio.js');
   const ctx=new AudioContext();let frame,preview,heard=0;
   const transport=new ProbeTransport(ctx,reason=>{cancelAnimationFrame(frame);preview.stop({notify:false,reason});});
   preview=new TutorialPreview({onPlay:async data=>{await ctx.resume();transport.start(data.notes,{tempo:data.tempo,totalTicks:data.totalTicks,instrument:'fm-piano',accompaniment:data.accompaniment,preRollTicks:16,preRollStep:1});const follow=()=>{if(!transport.active)return;preview.follow(transport.position(),{countBeat:transport.counting?Math.max(0,Math.floor((ctx.currentTime-transport.countAnchor)*transport.tempo/60)):null});frame=requestAnimationFrame(follow);};follow();},onStop:()=>{cancelAnimationFrame(frame);transport.stop(false);}});
   const full=tutorialExcerpt(tutorialPattern({backing:true}),0,64);preview.open(full,{onHeard:()=>heard++});
   window.tutorialHarness={preview,transport,ctx,full,get heard(){return heard;}};
  });
  const layout=[];
  for(const [width,height] of [[320,568],[360,640],[390,640],[414,736],[768,900]]){
   await page.setViewportSize({width,height});
   for(const mode of ['cards','score']){
    await page.locator(`[data-tutorial-view="${mode}"]`).click();
    const bounds=await page.locator('#learning-preview').evaluate(n=>{const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom,width:b.width,height:b.height,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth};});
    assert.ok(bounds.top>=0&&bounds.bottom<=height+1,`${width}x${height}/${mode} fits`);assert.ok(bounds.scrollWidth<=bounds.clientWidth+1);
    assert.equal(await page.locator('#learning-preview .tutorial-bar:visible').count(),4);
    layout.push({width,height,mode,dialogHeight:bounds.height});
   }
  }
  await page.setViewportSize({width:390,height:640});await page.locator('#learning-preview-play').click();
  await page.waitForFunction(()=>document.querySelector('#learning-preview').dataset.phase==='count-in');assert.equal(await page.locator('#learning-preview [data-playing]').count(),0);assert.equal(await page.evaluate(()=>tutorialHarness.heard),0);
  await page.waitForFunction(()=>document.querySelector('#learning-preview').dataset.phase==='music');const anchor=await page.evaluate(()=>tutorialHarness.transport.anchor);
  await page.locator('[data-tutorial-view="cards"]').click();assert.equal(await page.evaluate(()=>tutorialHarness.transport.anchor),anchor);assert.equal(await page.evaluate(()=>tutorialHarness.transport.active),true);
  await page.locator('#learning-preview-stop').click();assert.equal(await page.evaluate(()=>tutorialHarness.transport.active),false);assert.equal(await page.locator('#learning-preview [data-playing]').count(),0);assert.equal(await page.evaluate(()=>tutorialHarness.heard),1);
  await page.evaluate(async()=>{const {tutorialPattern,tutorialExcerpt}=await import('./tutorial-data.js');tutorialHarness.preview.open(tutorialExcerpt(tutorialPattern(),0,8));});
  await page.locator('#learning-preview-play').click();await page.waitForFunction(()=>document.querySelector('#learning-preview').dataset.phase==='idle',{},{timeout:8000});
  await page.locator('#learning-preview-play').click();await page.waitForFunction(()=>document.querySelector('#learning-preview').dataset.phase==='count-in');await page.locator('#learning-preview-close').click();await page.waitForTimeout(2400);assert.equal(await page.evaluate(()=>tutorialHarness.transport.active),false);assert.equal(await page.locator('#learning-preview').isVisible(),false);
  await page.evaluate(()=>tutorialHarness.ctx.close());assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',base,layout,checks:'count timing and cancellation, cards/score without restart, four bars fit, partial natural end, stop and close'}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
