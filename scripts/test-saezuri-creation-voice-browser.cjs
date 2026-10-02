const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8018';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});try{
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],serviceWorkers:'block'});
 await context.addInitScript(()=>{window.recognizers=[];window.streams=[];window.Vosk={createModel:async()=>({KaldiRecognizer:class{
  constructor(rate,grammar){this.events={};this.grammar=JSON.parse(grammar);window.recognizers.push(this);}on(event,cb){this.events[event]=cb;}acceptWaveform(){}remove(){this.removed=true;}
 }})};const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const stream=await gum(options);window.streams.push(stream);return stream;};});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const click=id=>page.locator('#'+id).evaluate(n=>n.click());
 const report=async()=>{await click('report');return JSON.parse(await page.locator('#metrics').textContent());};
 const pending=async()=>{const r=await report();return r.captureEditing.editCandidate??r.captureCandidate;};
 const listen=word=>page.waitForFunction(word=>document.querySelector('#edit-voice-status').textContent==='声を受け付けています'&&window.recognizers.at(-1)?.grammar.includes(word),word);
 const say=async word=>{await page.evaluate(word=>window.recognizers.at(-1).events.result({result:{text:word}}),word);};
 await page.goto(base+'/probe/saezuri/');await click('home-create');await click('new-image');await page.locator('#edit-voice').check();await listen('ロック');
 const baseline=await pending();
 for(const [word,field,value] of [['ロック','type','rock'],['ゆっくり','speed','slow'],['やさしい','mood','gentle'],['バラード','type','ballad'],['普通','speed','normal'],['かなしい','mood','sad'],['どうよう','type','nursery'],['はやい','speed','fast'],['かっこいい','mood','cool'],['ポップ','type','pop'],['あかるい','mood','bright']]){
  await say(word);assert.equal(await page.locator('#image-word-'+field).inputValue(),value);assert.deepEqual((await pending()).notes,baseline.notes);
 }
 const before=JSON.stringify((await pending()).accompaniment.imageArrangement);await say('別 の パターン');assert.notEqual(JSON.stringify((await pending()).accompaniment.imageArrangement),before);assert.equal((await report()).captureEditing.undoDepth,1);
 await say('もどす');assert.equal((await report()).captureEditing.pending,false);await say('別のパターン');await say('オッケー');assert.equal((await report()).captureEditing.pending,false);
 // Recording words outside a loop do not start playback or alter data.
 await say('ろくおん');await say('はなうた');assert.equal(await page.locator('#status').getAttribute('data-state'),'idle');
 await say('スタート');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');await listen('録音');
 const adopted=await pending();assert.deepEqual(await page.evaluate(()=>window.recognizers.at(-1).grammar),['ストップ','とめる','停止','鼻歌','録音']);
 await say('ロック');await say('別のパターン');await say('オッケー');assert.deepEqual(await pending(),adopted);
 // Reserve at the next head; stop before that head must produce no candidate.
 await page.waitForTimeout(1400);await say('ろくおん');await listen('ストップ');assert.deepEqual(await page.evaluate(()=>window.recognizers.at(-1).grammar),['ストップ','とめる','停止']);assert.match(await page.locator('#keyboard-status').textContent(),/次の先頭から/);
 await page.evaluate(()=>window.staleResult=window.recognizers.at(-1).events.result);await say('鼻歌');await say('ロック');await say('ストップ');await listen('ロック');assert.equal((await report()).captureEditing.pending,false);assert.deepEqual(await pending(),adopted);
 // Stale callbacks cannot confirm a later candidate after the phase changes.
 await say('別のパターン');await page.evaluate(()=>window.staleResult({result:{text:'オッケー'}}));assert.equal((await report()).captureEditing.pending,true);await say('もどす');
 await say('スタート');await listen('鼻歌');await page.waitForTimeout(1400);await say('はなうた');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='count-in');await listen('ストップ');await say('録音');assert.equal(await page.locator('#status').getAttribute('data-state'),'count-in',await page.locator('#status').textContent());await say('ストップ');await listen('ロック');assert.equal((await report()).captureEditing.pending,false);
 await say('スタート');await listen('鼻歌');await say('鼻歌');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='recording',{},{timeout:20000});await listen('ストップ');await page.waitForTimeout(400);await say('ストップ');await listen('ロック');assert.equal((await report()).captureEditing.pending,false);
 // Continuous tap mode reaches the next head and voice stop works while holding a key.
 await say('スタート');await listen('録音');await say('録音');await listen('ストップ');await page.waitForFunction(()=>document.querySelector('#keyboard-status').textContent.startsWith('タップ録音中'),{},{timeout:20000});
 const key=page.locator('#piano-keys [data-midi="60"]');await key.scrollIntoViewIfNeeded();const box=await key.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height-12);await page.mouse.down();await page.waitForTimeout(220);await listen('ストップ');await say('ストップ');await page.mouse.up();await listen('ロック');let r=await report();assert.equal(r.captureEditing.pending,true);assert.ok((await pending()).notes.some(n=>n.midi===60));assert.deepEqual((await pending()).accompaniment,adopted.accompaniment);await say('オッケー');
 // Ordinary audition still pauses speech; modal, mic OFF and hidden page release capture.
 await say('きく');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');assert.equal(await page.locator('#edit-voice-status').textContent(),'音声受付はおやすみ中');await click('stop');await listen('ロック');
 await click('screen-settings');assert.equal(await page.locator('#edit-voice-status').textContent(),'音声受付はおやすみ中');await click('settings-close');await listen('ロック');
 await page.evaluate(()=>window.staleResult=window.recognizers.at(-1).events.result);await click('mic');await page.evaluate(()=>window.staleResult({result:{text:'ロック'}}));assert.equal((await report()).captureEditing.pending,false);assert.equal(await page.evaluate(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);await click('mic');await listen('ロック');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await page.locator('#edit-voice-status').textContent(),'音声受付はおやすみ中');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await listen('ロック');
 assert.deepEqual(errors,[]);console.log('voice image selection/candidate/undo, start loop, next-head humming/tap reservation, voice stop while held, restricted grammar, stale results, audition/modal/mic/hidden gates: PASS');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
