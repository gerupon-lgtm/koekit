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
 const report=async()=>{await page.evaluate(()=>document.querySelector('#report').click());return JSON.parse(await page.locator('#metrics').textContent());};
 const say=word=>page.evaluate(word=>window.recognizers.at(-1).events.result({result:{text:word}}),word);
 const listen=()=>page.waitForFunction(()=>document.querySelector('#edit-voice-status').textContent==='声を受け付けています');
 await page.goto(base+'/probe/saezuri/?view=editor');await page.locator('#capture-score svg').first().waitFor();
 await page.locator('#editor-source > summary').click();await page.locator('#new-manual').click();
 let r=await report();assert.equal(r.captureCandidate.source,'manual');assert.equal(r.captureCandidate.gridStep,2);assert.equal(r.captureCandidate.notes.length,0);
 await page.locator('[data-pitch="0"]').click();r=await report();assert.equal(r.captureCandidate.notes.length,0);assert.equal(r.captureEditing.inputCursor,0);assert.equal(r.captureEditing.editCandidate.notes[0].midi,60);
 await page.locator('[data-pitch="2"]').click();await page.locator('#capture-edit-confirm').click();
 r=await report();assert.equal(r.captureCandidate.notes[0].midi,64);assert.equal(r.captureEditing.inputCursor,4);
 await page.locator('#composer-duration').fill('0.5');await page.locator('[data-pitch="7"]').click();await page.locator('#capture-edit-confirm').click();
 r=await report();assert.equal(r.captureCandidate.notes.length,1);assert.equal(r.captureEditing.inputCursor,6);
 await page.locator('#capture-edit-undo').click();r=await report();assert.equal(r.captureEditing.inputCursor,4);
 // Voice entry uses the same candidate/confirm route; octave does not persist.
 await page.locator('#edit-voice').check();await listen();await say('上 ミ 二');
 r=await report();assert.equal(r.captureEditing.editCandidate.notes[1].midi,76);assert.equal(r.captureEditing.inputCursor,4);
 await say('オッケー');await say('ド 半分');r=await report();assert.equal(r.captureEditing.editCandidate.notes[2].midi,60);await say('オッケー');
 await say('三 拍 半');assert.equal((await report()).captureEditing.inputCursor,10);
 await say('ド 一');r=await report();assert.equal(r.captureEditing.inputError,'NOTE_OVERLAP');assert.equal(await page.locator('#capture-edit-confirm').isDisabled(),true);
 await say('とりけし');
 await page.locator('#composer-panel details > summary').click();await page.locator('#composer-bar').selectOption('4');await page.locator('[data-tick="14"]').click();
 await page.locator('#composer-view').selectOption('blocks');assert.equal(await page.locator('#capture-score').isVisible(),false);
 await page.locator('#composer-view').selectOption('score');assert.equal(await page.locator('#capture-blocks').isVisible(),false);
 await page.locator('#composer-view').selectOption('both');assert.equal((await report()).captureEditing.inputCursor,62);
 await say('ド 一');assert.match(await page.locator('#capture-edit-status').textContent(),/はんぱく/);assert.equal((await report()).captureEditing.inputCursor,62);
 await say('ド 半分');await say('オッケー');assert.equal((await report()).captureEditing.inputCursor,64);
 await page.locator('#composer-copy').click();r=await report();assert.equal(r.captureCandidate.bars,4);assert.equal(r.captureEditing.editCandidate.bars,8);
 await say('オッケー');assert.equal((await report()).captureCandidate.notes.length,8);
 await page.locator('#composer-shorten').click();await say('とりけし');assert.equal((await report()).captureCandidate.bars,8);
 await page.locator('#composer-key').selectOption('Am');await say('オッケー');assert.equal((await report()).captureCandidate.key.mode,'minor');
 await page.locator('#composer-panel details > summary').click();
 await say('スタート');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
 r=await report();assert.equal(r.playback.bars,8);assert.equal(r.playback.notes,8);assert.equal(await page.locator('[data-pitch="0"]').isDisabled(),true);
 await page.locator('#stop').click();await listen();
 assert.equal(await page.locator('#capture-score').evaluate(n=>{const bar=n.querySelector('[data-bar="4"]').getBoundingClientRect(),frame=n.getBoundingClientRect();return Math.abs(bar.top-frame.top)<5;}),true,'stop restores input bar');
 // Image changes remain provisional; audition includes backing without changing melody.
 const melody=(await report()).captureCandidate.notes;
 await page.locator('#image-settings > summary').click();await page.locator('#image-enabled').check();
 await page.locator('#image-genre').selectOption('ballad');
 r=await report();assert.deepEqual(r.captureEditing.editCandidate.notes,melody);assert.equal(r.captureCandidate.accompaniment,undefined);
 assert.equal(r.captureEditing.editCandidate.accompaniment.rhythm,'arpeggio');
 await page.locator('#image-tempo').click();assert.equal(await page.locator('#tempo').inputValue(),'80');
 await say('きく');await page.waitForTimeout(1500);await page.locator('#stop').click();await listen();
 r=await report();assert.ok(r.playback.accompanimentEvents>0);assert.equal(r.captureEditing.pending,true);
 await say('オッケー');assert.deepEqual((await report()).captureCandidate.notes,melody);
 const saved=await report();
 await page.locator('#image-settings > summary').click();
 for(const [width,height] of [[320,568],[390,844],[844,390],[1280,800]]) {
 await page.setViewportSize({width,height});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`width ${width}`);
 const fits=await page.locator('#capture-score').evaluate(n=>[...n.querySelectorAll('svg')].every(s=>s.getBoundingClientRect().width<=n.clientWidth+1));assert.equal(fits,true);
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#composer-panel').scrollIntoViewIfNeeded();
 await page.screenshot({path:'.local-tools/saezuri-composer-mobile.png'});
 await page.evaluate(()=>{const nodes=[...document.querySelectorAll('p,label,button,input,select,summary')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)*2]);for(const [n,size] of nodes)n.style.fontSize=`${size}px`;});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'200% text fits');
 await page.locator('#editor-source > summary').click();await page.locator('#new-image').click();
 r=await report();assert.equal(r.captureCandidate.notes.length,0);assert.equal(r.captureCandidate.accompaniment.enabled,true);
 assert.equal(await page.locator('#image-settings').getAttribute('open'),'');
 await page.locator('#editor-source > summary').click();await page.locator('#editor-source details > summary').click();
 await page.locator('#capture-import-text').fill(JSON.stringify(saved));await page.locator('#capture-import-button').click();
 r=await report();assert.deepEqual(r.captureCandidate,saved.captureCandidate);assert.equal(r.captureEditing.undoDepth,0);
 assert.deepEqual(errors,[]);console.log('PASS normal entry: candidate, rests, voice, errors, 8 bars, preview, mobile layout');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
