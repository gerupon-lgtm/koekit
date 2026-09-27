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
  const fixture={prototype:'fixture',captureOptions:{tempo:120},capture:{notes:Array.from({length:16},(_,i)=>({id:`n${i+1}`,midi:60+i%5,startTick:i*4,durationTick:4}))}};
  await page.locator('details').filter({has:page.locator('#capture-import-text')}).locator('summary').click();
  await page.locator('#capture-import-text').fill(JSON.stringify(fixture));await page.locator('#capture-import-button').click();
  await page.locator('#edit-voice').check();
  const listening=()=>page.waitForFunction(()=>document.querySelector('#edit-voice-status').textContent==='声を受け付けています');
  await listening();
  const say=word=>page.evaluate(word=>window.recognizers.at(-1).events.result({result:{text:word}}),word);
  const report=async()=>{await page.evaluate(()=>document.querySelector('#report').click());return JSON.parse(await page.locator('#metrics').innerText());};
  const initial=(await report()).captureCandidate.notes;
  assert.equal(await page.evaluate(()=>window.recognizers.at(-1).grammar.includes('オッケー')),true);
  await page.locator('[data-transpose="12"]').click();
  let transposed=await report();
  assert.deepEqual(transposed.captureEditing.editCandidate.notes.map(n=>n.midi),initial.map(n=>n.midi+12));
  assert.deepEqual(transposed.captureCandidate.notes,initial);
  await page.locator('#instrument').selectOption('lead');
  await page.locator('#play-count-style').selectOption('stick');
  await say('きく');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
  const previewed=await report();
  assert.deepEqual(previewed.playback.pitches,initial.map(n=>n.midi+12));
  assert.equal(previewed.playback.instrument,'lead');assert.equal(previewed.playback.countStyle,'stick');
  assert.equal(await page.locator('[data-transpose="12"]').isDisabled(),true);
  await page.locator('#stop').click();await listening();
  await say('もどす');assert.equal((await report()).captureEditing.pending,false);
  assert.equal((await report()).captureEditing.undoDepth,0);
  await say('9ばん');await say('けす');
  let deletion=await report();
  assert.equal(deletion.captureEditing.editCandidate.notes.some(n=>n.id==='n9'),false);
  assert.equal(deletion.captureEditing.selectedNoteId,'n10');
  assert.deepEqual(deletion.captureCandidate.notes,initial);
  assert.deepEqual(deletion.captureEditing.editCandidate.notes.find(n=>n.id==='n10'),initial[9]);
  await say('もどす');assert.equal((await report()).captureEditing.pending,false);
  await say('九 番 消す');assert.equal((await report()).captureEditing.editCandidate.notes.length,15);
  await say('もどす');assert.equal((await report()).captureEditing.pending,false);
  await say('17番消す');assert.equal((await report()).captureEditing.pending,false);
  assert.equal((await report()).captureEditing.undoDepth,0);

  const inViewport=()=>page.evaluate(()=>{
    const score=document.querySelector('#capture-score'),head=score.querySelector('[data-editor-selected=true] ellipse');
    const a=score.getBoundingClientRect(),b=head.getBoundingClientRect();
    const block=document.querySelector('#capture-blocks [aria-pressed=true]'),c=block.getBoundingClientRect(),d=block.parentElement.getBoundingClientRect();
    return b.left>=a.left && b.right<=a.right && b.top>=a.top && b.bottom<=a.bottom && c.left>=d.left && c.right<=d.right && b.top>=0 && b.bottom<=document.querySelector('footer').getBoundingClientRect().top;
  });
  await say('10番');assert.equal((await report()).captureEditing.selectedNoteId,'n10');
  assert.match(await page.locator('#capture-selection').innerText(),/10 \/ 16/);assert.equal(await inViewport(),true);
  assert.equal((await report()).captureEditing.undoDepth,0);
  await say('最後');assert.equal((await report()).captureEditing.selectedNoteId,'n16');assert.equal(await inViewport(),true);
  assert.equal(await page.locator('#capture-next').isDisabled(),true);
  await say('さいしょ');assert.equal((await report()).captureEditing.selectedNoteId,'n1');assert.equal(await inViewport(),true);
  assert.equal(await page.locator('#capture-previous').isDisabled(),true);
  await say('17番');assert.equal((await report()).captureEditing.selectedNoteId,'n1');
  for(const [width,height] of [[320,568],[390,844],[844,390],[1280,800]]) {
    await page.setViewportSize({width,height});
    await page.locator('#capture-last').click();assert.equal(await inViewport(),true,`last ${width}`);
    await page.locator('#capture-first').click();assert.equal(await inViewport(),true,`first ${width}`);
    await page.locator('#capture-blocks button').nth(9).click();assert.equal((await report()).captureEditing.selectedNoteId,'n10');
    assert.equal(await inViewport(),true,`direct ${width}`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await say('最初');
  await say('あげる');await say('次');await say('ひくく');
  let r=await report();assert.equal(r.captureEditing.editCandidate.notes[0].midi,initial[0].midi+1);
  assert.equal(r.captureEditing.editCandidate.notes[1].midi,initial[1].midi-1);
  await say('きく');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
  assert.equal(await page.evaluate(()=>window.recognizers.at(-1).removed),true);
  await say('けす');assert.equal((await report()).captureEditing.editCandidate.notes.length,16);
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
  await page.screenshot({path:'.local-tools/saezuri-v17-editor.png'});
  await page.locator('#capture-edit-cancel').click();
  const checkpoint=(await report()).captureCandidate.notes;
  await page.locator('[data-transpose="12"]').click();
  await page.locator('#capture-edit-confirm').click();
  assert.deepEqual((await report()).captureCandidate.notes,checkpoint.map(n=>({...n,midi:n.midi+12})));
  await page.locator('#capture-edit-undo').click();
  assert.deepEqual((await report()).captureEditing.editCandidate.notes,checkpoint);
  await page.locator('#capture-edit-cancel').click();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',base,sharedVoskAdapter:true,voiceCommands:'numbered jump / first / last / selected and numbered delete / aliases / preview / confirm / undo / cancel',mobileNavigation:'selected head visible at 320 / 390 / 844 / 1280 widths',gates:'playback, mic off, end, cancelled startup',actualSpeechAccuracy:'not tested'}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
