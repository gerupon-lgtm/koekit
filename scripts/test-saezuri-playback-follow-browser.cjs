const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8014';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],serviceWorkers:'block'});
  await context.addInitScript(()=>{window.recognizers=[];window.Vosk={createModel:async()=>({KaldiRecognizer:class {
   constructor(){this.events={};window.recognizers.push(this);}on(k,f){this.events[k]=f;}acceptWaveform(){}remove(){}
  }})};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/probe/saezuri/?view=editor');await page.locator('#capture-score svg').first().waitFor();
  const report=async()=>{await page.evaluate(()=>document.querySelector('#report').click());return JSON.parse(await page.locator('#metrics').textContent());};
  const fit=()=>page.evaluate(()=>{
   const score=document.querySelector('#capture-score');
   return {fits:score.scrollWidth<=score.clientWidth+1 && [...score.querySelectorAll('svg')].every(s=>s.getBoundingClientRect().width<=score.clientWidth+1),
     headWidth:score.querySelector('ellipse').getBoundingClientRect().width};
  });
  for(const [width,height] of [[320,568],[390,844],[844,390],[1280,800]]) {
   await page.setViewportSize({width,height});await page.waitForTimeout(100);
   assert.equal((await fit()).fits,true,`bar fits ${width}`);assert.ok((await fit()).headWidth>=12,'notes retain legible size');
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#capture-blocks button').nth(2).click();
  const before=(await report()).captureEditing;
  await page.locator('#edit-voice').check();await page.waitForFunction(()=>document.querySelector('#edit-voice-status').textContent==='声を受け付けています');
  await page.evaluate(()=>window.recognizers.at(-1).events.result({result:{text:'きく'}}));
  await page.waitForFunction(()=>document.querySelector('#capture-blocks [data-playing=note]')?.dataset.noteId==='demo-1');
  assert.equal(await page.locator('#capture-score [data-playing=note]').getAttribute('data-note-id'),'demo-1');
  assert.equal((await report()).captureEditing.selectedNoteId,before.selectedNoteId);
  await page.waitForFunction(()=>document.querySelector('#capture-selection').textContent.includes('休符'));
  assert.equal(await page.locator('#capture-blocks [data-playing=note]').count(),0);
  assert.equal(await page.locator('#capture-score [data-playing=note]').count(),0);
  await page.waitForFunction(()=>document.querySelector('#capture-score [data-playing=note]')?.dataset.startTick==='32');
  assert.equal(await page.locator('#capture-blocks [data-playing=note]').getAttribute('data-note-id'),'demo-7');
  assert.equal(await page.locator('#capture-score svg[data-playing=bar]').getAttribute('data-bar'),'2');
  await page.setViewportSize({width:320,height:568});await page.waitForTimeout(100);
  assert.equal((await fit()).fits,true);
  assert.equal(await page.locator('#capture-blocks [aria-current=true]').getAttribute('data-note-id'),'demo-7');
  const barVisible=await page.evaluate(()=>{
   const score=document.querySelector('#capture-score').getBoundingClientRect(),staff=document.querySelector('#capture-score svg[data-playing=bar]').getBoundingClientRect();
   return staff.top>=score.top-1 && staff.left>=score.left && staff.right<=score.right;
  });assert.equal(barVisible,true);
  await page.screenshot({path:'.local-tools/saezuri-v19-playing.png'});
  await page.locator('#stop').click();
  assert.equal(await page.locator('#capture-score [data-playing]').count(),0);
  assert.equal(await page.locator('#capture-blocks [aria-pressed=true]').getAttribute('data-note-id'),before.selectedNoteId);
  assert.equal((await report()).captureEditing.undoDepth,before.undoDepth);
  await page.locator('#preview').click();
  await page.waitForFunction(()=>document.querySelector('#capture-score [data-playing=note]')?.dataset.noteId==='demo-1');
  await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='idle',null,{timeout:15000});
  assert.equal(await page.locator('#capture-score [data-playing]').count(),0);
  assert.equal((await report()).captureEditing.selectedNoteId,before.selectedNoteId);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',base,checks:'voice preview follows notes/cards, rests clear, ties follow next staff, resize, stop/end restore selection without history',viewports:4}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
