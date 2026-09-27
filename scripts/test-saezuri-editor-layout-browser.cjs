const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8014';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],serviceWorkers:'block'});
  await context.addInitScript(()=>{
   window.recognizers=[];
   window.Vosk={createModel:async()=>({KaldiRecognizer:class {
    constructor(){this.events={};window.recognizers.push(this);}on(k,f){this.events[k]=f;}acceptWaveform(){}remove(){}
   }})};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/probe/saezuri/?view=editor');await page.locator('#capture-score svg').first().waitFor();
  const report=async()=>{await page.evaluate(()=>document.querySelector('#report').click());return JSON.parse(await page.locator('#metrics').textContent());};
  const say=word=>page.evaluate(word=>window.recognizers.at(-1).events.result({result:{text:word}}),word);
  const listen=()=>page.waitForFunction(()=>document.querySelector('#edit-voice-status').textContent==='声を受け付けています');
  assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('editor-focus')),true);
  assert.equal(await page.locator('#window-size').isVisible(),false);
  assert.equal(await page.locator('#score').isVisible(),false);
  assert.equal(await page.locator('#instrument').isVisible(),true);
  assert.equal(await page.locator('#play-count-style').isVisible(),true);
  assert.equal(await page.locator('#technical-tools').getAttribute('open'),null);
  assert.equal(await page.locator('#editor-more').getAttribute('open'),null);
  assert.equal(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return ids.length===new Set(ids).size;}),true);
  // Import a melody without having to end the untouched example session first.
  await page.locator('#editor-source > summary').click();
  await page.locator('#editor-source details > summary').click();
  const fixture={prototype:'fixture',captureOptions:{tempo:120},capture:{notes:Array.from({length:16},(_,i)=>({id:`n${i}`,midi:54+i%5,startTick:i*4,durationTick:4}))}};
  await page.locator('#capture-import-text').fill(JSON.stringify(fixture));await page.locator('#capture-import-button').click();
  assert.equal(await page.locator('#editor-source').getAttribute('open'),null);
  const initial=(await report()).captureCandidate.notes;
  await page.locator('#capture-pitch-up').click();
  assert.equal(await page.locator('#capture-import-button').isDisabled(),true);
  assert.equal(await page.locator('#capture').isDisabled(),true);
  await page.locator('#instrument').selectOption('lead');await page.locator('#play-count-style').selectOption('tambourine');
  await page.locator('#preview').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
  let r=await report();assert.equal(r.playback.pitches[0],initial[0].midi+1);assert.equal(r.playback.instrument,'lead');assert.equal(r.playback.countStyle,'tambourine');
  assert.equal(await page.locator('#instrument').isDisabled(),true);await page.locator('#stop').click();
  assert.equal(await page.locator('#editor-source').getAttribute('open'),null,'preview must not open recording controls');
  await page.locator('#capture-edit-confirm').click();assert.equal((await report()).captureEditing.pending,false);
  await page.locator('#capture-edit-undo').click();assert.equal((await report()).captureEditing.pending,true);
  await page.locator('#capture-edit-cancel').click();
  await page.locator('[data-transpose="12"]').click();
  await page.locator('#edit-voice').check();await listen();await say('オッケー');
  assert.equal((await report()).captureEditing.pending,false);
  for(const [width,height] of [[320,568],[390,844],[844,390],[1280,800]]) {
   await page.setViewportSize({width,height});await page.locator('#capture-last').click();
   const visible=await page.evaluate(()=>{
    const head=document.querySelector('#capture-score [data-editor-selected=true] ellipse').getBoundingClientRect();
    const score=document.querySelector('#capture-score').getBoundingClientRect();
    const footer=document.querySelector('footer').getBoundingClientRect();
    return head.left>=score.left && head.right<=score.right && head.top>=0 && head.bottom<=footer.top;
   });assert.equal(visible,true,`selected note visible ${width}`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no horizontal overflow ${width}`);
   await page.locator('#capture-first').click();
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'.local-tools/saezuri-v19-editor-mobile.png'});
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('clipboard denied');};});
  await page.locator('#copy-capture-report').click();
  assert.equal(await page.locator('#copy-fallback').isVisible(),true);
  assert.equal(JSON.parse(await page.locator('#copy-text').inputValue()).prototype,'ML-T01-v22');
  assert.equal(await page.locator('#technical-tools').getAttribute('open'),null);
  await page.locator('#editor-more > summary').click();assert.equal(await page.locator('#capture-octave-up').isVisible(),true);
  await page.locator('#capture-octave-up').click();assert.equal((await report()).captureEditing.pending,false);
  await page.locator('#editor-more > summary').click();
  await page.locator('#adopt').click();assert.equal(await page.locator('#editor-standby').isVisible(),true);
  await page.locator('#edit-score').click();assert.equal((await report()).captureEditing.undoDepth,0);
  // Source replacement is explicit and allowed only with no pending draft.
  await page.locator('#editor-source > summary').click();await page.locator('#capture').click();
  await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='count-in');
  assert.equal(await page.locator('#mic').isVisible(),true);
  assert.equal(await page.locator('#capture-position').isVisible(),true);await page.locator('#mic').click();
  assert.equal(await page.locator('#status').getAttribute('data-state'),'idle');
  assert.equal(await page.locator('#editor-standby').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',base,compactEditor:true,checks:'source import, draft protection, nearby timbres, preview, confirm, undo, voice, octave display, end/reopen, count-in visibility',viewports:4}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
