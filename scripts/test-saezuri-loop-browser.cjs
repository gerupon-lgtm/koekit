const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const fs=require('node:fs'),path=require('node:path');
// Feed a known microphone waveform through the native capture path. Browser-default
// fake input is also checked separately; it may contain no voiced musical note.
const folder=path.resolve('.local-tools/workflow-20261031');fs.mkdirSync(folder,{recursive:true});
const fixture=path.join(folder,'loop-microphone-440hz.wav'),rate=48000,frames=rate*2,wav=Buffer.alloc(44+frames*2);
wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*2,40);
for(let i=0;i<frames;i++)wav.writeInt16LE(Math.round(8192*Math.sin(2*Math.PI*440*i/rate)),44+i*2);
assert.equal(wav.readUInt32LE(40),frames*2);assert.equal(wav.readUInt32LE(24),rate);fs.writeFileSync(fixture,wav);
const knownInput=process.env.SAEZURI_LOOP_MIC!=='browser-default';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',...(knownInput?[`--use-file-for-fake-audio-capture=${fixture}`]:[])]});try{
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],serviceWorkers:'block'});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const loop=async()=>{await revealCreationControl(page,'#backing-loop');await page.locator('#backing-loop').click();};
 await page.goto((process.env.SAEZURI_BASE||'http://127.0.0.1:8014')+'/probe/saezuri/'+(process.env.SAEZURI_SOUND?'?sound='+process.env.SAEZURI_SOUND:''));await page.locator('#home-create').click();await page.locator('#new-image').click();await page.locator('#capture-edit-confirm').click();
 await page.locator('#mic').click();await loop();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');assert.equal(await page.locator('#loop-record').isDisabled(),true);assert.match(await page.locator('#loop-hint').textContent(),/マイクON/);assert.doesNotMatch(await page.locator('#loop-hint').textContent(),/準備/);await page.locator('#stop').click();await page.locator('#mic').click();
 await revealCreationControl(page,'[data-mode="input"]');await page.locator('[data-mode="input"]').click();await revealCreationControl(page,'[data-pitch="0"]');await page.locator('[data-pitch="0"]').click();await page.locator('#capture-edit-confirm').click();await revealCreationControl(page,'[data-mode="backing"]');await page.locator('[data-mode="backing"]').click();
 await loop();await page.locator('#loop-record').waitFor();await page.waitForFunction(()=>!document.querySelector('#loop-record').disabled);
 const report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
 let data=await report();assert.equal(data.playback.notes,0,'only backing while preparing retake');
 const generatedRecipe=JSON.stringify(data.captureCandidate.accompaniment.imageArrangement);assert.ok(data.captureCandidate.accompaniment.imageArrangement);
 await page.locator('#loop-record').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='count-in');
 await page.locator('#stop').click();data=await report();assert.equal(data.captureCandidate.notes[0].midi,60,'cancel leaves old confirmed melody');
 await loop();await page.waitForFunction(()=>!document.querySelector('#loop-record').disabled);await page.locator('#loop-record').click();
 // Recording hides optional settings. Inject the shared mic-OFF button event without waiting for it to reappear; visible Stop cancellation is checked above.
 await page.locator('#mic').evaluate(button=>button.click());assert.equal(await page.locator('#status').getAttribute('data-state'),'idle');data=await report();assert.equal(data.captureCandidate.notes[0].midi,60);
 await page.locator('#mic').click();await page.locator('#screen-settings').click();await page.locator('#tempo').fill('180');await page.locator('#tempo').dispatchEvent('change');await page.locator('#settings-close').click();await revealCreationControl(page,'#phrase-bars');await page.locator('#phrase-bars').selectOption('8');await page.locator('#capture-edit-confirm').click();
 await loop();await page.waitForFunction(()=>!document.querySelector('#loop-record').disabled);
 await page.locator('#loop-record').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='recording',{},{timeout:14000});
 await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='idle',{},{timeout:18000});data=await report();
 assert.equal(data.capture.timing.bars,8);assert.equal(data.capture.samples,Math.round(data.capture.sampleRate*32/3));
 const detected=data.capture.notes?.length??0;
 fs.writeFileSync(path.join(folder,knownInput?'loop-known-report.json':'loop-default-report.json'),JSON.stringify(data));
 console.log(JSON.stringify({input:knownInput?'440Hz':'browser-default',detected,pending:data.captureEditing.pending,currentNotes:data.captureCandidate.notes.map(n=>n.midi),candidate:data.captureEditing.editCandidate?.notes.map(n=>n.midi),loop:data.captureOptions.loop}));
 assert.equal(data.captureCandidate.notes[0]?.midi,60,'recording result waits for OK');
 if(knownInput)assert.ok(detected>0,'known 440Hz microphone input must produce notes');
 assert.equal(data.captureEditing.pending,true,'recording stays unconfirmed even when the fake input contains no voiced notes');if(knownInput)assert.ok(data.captureEditing.editCandidate.notes.some(n=>n.midi===69),'440Hz reaches the unconfirmed note candidate');assert.equal(JSON.stringify(data.captureEditing.editCandidate.accompaniment.imageArrangement),generatedRecipe,'humming retake keeps the generated accompaniment');await page.locator('#capture-edit-undo').click();data=await report();assert.equal(data.captureEditing.pending,false);assert.equal(data.captureCandidate.notes[0].midi,60);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks:'loop reservation/cancel, mic off, eight-bar capture, existing melody and accompaniment protected, voiced candidate/OK boundary/Undo',input:knownInput?'native microphone file: 440Hz':'browser-default fake microphone',detected}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
