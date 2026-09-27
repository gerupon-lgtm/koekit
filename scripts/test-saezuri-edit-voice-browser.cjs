const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE || 'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],serviceWorkers:'block'});
  await context.addInitScript(()=>{
   window.recognizers=[];window.streams=[];window.modelWait=false;
   window.Vosk={createModel:async()=>{
    if(window.modelWait) await new Promise(resolve=>window.finishModel=resolve);
    return {KaldiRecognizer:class {
     constructor(rate,grammar){this.events={};this.grammar=JSON.parse(grammar);window.recognizers.push(this);}
     on(event,callback){this.events[event]=callback;} acceptWaveform(){} remove(){this.removed=true;}
    }};
   }};
   const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async options=>{const stream=await gum(options);window.streams.push(stream);return stream;};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/probe/saezuri/');await page.locator('#score svg').first().waitFor();
  await page.locator('#edit-score').click();
  await page.locator('#edit-voice').check();
  const listening=()=>page.waitForFunction(()=>document.querySelector('#edit-voice-status').textContent==='声を受け付けています');
  await listening();
  const say=word=>page.evaluate(word=>window.recognizers.at(-1).events.result({result:{text:word}}),word);
  const report=async()=>{await page.locator('#report').click();return JSON.parse(await page.locator('#metrics').innerText());};
  const initial=(await report()).captureCandidate.notes;
  await say('あげる');await say('次');await say('ひくく');
  let r=await report();assert.equal(r.captureEditing.editCandidate.notes[0].midi,initial[0].midi+1);
  assert.equal(r.captureEditing.editCandidate.notes[1].midi,initial[1].midi-1);
  await say('きく');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
  assert.equal(await page.evaluate(()=>window.recognizers.at(-1).removed),true);
  await say('オッケー');assert.equal((await report()).captureEditing.pending,true,'stale results during playback ignored');
  await page.locator('#stop').click();await listening();
  await say('オッケー');assert.equal((await report()).captureEditing.pending,false);
  await say('もどす');assert.equal((await report()).captureEditing.pending,true);
  await say('取り消し');assert.equal((await report()).captureEditing.pending,false);
  await page.locator('#mic').click();
  assert.equal(await page.evaluate(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
  await say('あげる');assert.equal((await report()).captureEditing.pending,false);
  await page.locator('#mic').click();await listening();
  const historyBefore=(await report()).captureEditing.undoDepth;
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.evaluate(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
  await say('あげる');assert.equal((await report()).captureEditing.pending,false);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await listening();
  assert.equal((await report()).captureEditing.undoDepth,historyBefore);
  await page.locator('#adopt').click();
  assert.equal(await page.evaluate(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
  // Cancel initialization before the model resolves: no late microphone request.
  await page.evaluate(()=>window.modelWait=true);
  await page.locator('#edit-score').click();
  await page.waitForFunction(()=>typeof window.finishModel==='function');
  const before=await page.evaluate(()=>window.streams.length);
  await page.locator('#edit-voice').uncheck();await page.evaluate(()=>window.finishModel());
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>window.streams.length),before);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#capture-pitch-up').click();await page.locator('#capture-score').scrollIntoViewIfNeeded();
  await page.screenshot({path:'.local-tools/saezuri-v14-editor.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',base,sharedVoskAdapter:true,voiceCommands:'aliases, preview, confirm, undo, cancel',gates:'playback, mic off, end, cancelled startup',actualSpeechAccuracy:'not tested'}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
