const {chromium,webkit}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026',layoutOnly=process.env.SAEZURI_BROWSER==='webkit';
(async()=>{const browser=layoutOnly?await webkit.launch({headless:true,executablePath:process.env.SAEZURI_WEBKIT_PATH}):await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});try{
 fs.mkdirSync('.local-tools/note-move-20261018',{recursive:true});const results=[];
 for(const source of ['humming','tap','manual','image']){
  const context=await browser.newContext({viewport:{width:390,height:740},permissions:layoutOnly?[]:['microphone'],serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));if(!layoutOnly)await page.addInitScript(()=>{window.recognizers=[];window.Vosk={createModel:async()=>({KaldiRecognizer:class{constructor(rate,grammar){this.events={};this.grammar=JSON.parse(grammar);recognizers.push(this);}on(e,cb){this.events[e]=cb;}acceptWaveform(){}remove(){this.removed=true;}}})};});
  await page.goto(base+'/probe/saezuri/');
  const original=await page.evaluate(async source=>{
   const {SongStore}=await import('/saezuri/song-store.js'),{songCheckpoint}=await import('./song-session.js'),{openEditSession,confirmEditSession}=await import('./edit-session.js'),{emptySequence}=await import('./sequence-session.js');
   const pattern={bars:4,gridStep:source==='manual'?2:1,key:{tonicPitchClass:0,mode:'major'},...(['humming','image'].includes(source)?{}:{source}),notes:[{id:'a',midi:60,startTick:4,durationTick:4,origin:['humming','image'].includes(source)?'detected':'input'},{id:'neighbor',midi:62,startTick:8,durationTick:4,origin:'input'},{id:'b',midi:64,startTick:14,durationTick:6,origin:['humming','image'].includes(source)?'detected':'input'},{id:'c',midi:67,startTick:24,durationTick:4,origin:'input'},{id:'end',midi:60,startTick:60,durationTick:4,origin:'input'}],accompaniment:{enabled:true,genre:'pop',rhythm:'offbeat',progression:'pop'}};
   if(source==='image'){const {generateImageAccompaniment}=await import('/saezuri/music/image-arrangement.js');pattern.accompaniment=generateImageAccompaniment(pattern,{type:'pop',speed:'normal',mood:'gentle'});}
   await new SongStore().save('move-fixture',{title:'音の位置の確認',checkpoint:songCheckpoint(confirmEditSession(openEditSession(pattern))),sequence:emptySequence(),settings:{tempo:180,instrument:'sine'}});return pattern;
  },source);
  const click=id=>page.locator('#'+id).click(),report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
  const open=async()=>{await click('home-songs');await page.locator('[data-song-open]').first().click();if(await page.locator('#song-continue').isVisible())await click('song-continue');await revealCreationControl(page,'[data-mode="edit"]');await page.locator('[data-mode="edit"]').click();};
  const select=async(id,display)=>{let locator=page.locator(`${display==='score'?'#capture-score':'#composition-cards'} [data-note-id="${id}"]`).first();if(display==='score')locator=locator.locator('ellipse').first();await locator.click();};
  const move=async direction=>{await page.locator('#capture-time-edit').evaluate(n=>n.scrollIntoView({block:'center'}));await click('capture-time-'+direction);};
  await open();
  for(const display of ['score','cards']){
   await page.locator('#creation-note-display').selectOption(display);await select('a',display);
   const before=await report();await move('later');assert.deepEqual((await report()).captureEditing,before.captureEditing,'overlap changes no note, selection or undo');assert.match(await page.locator('#capture-edit-status').textContent(),/重なる/);
   await move('earlier');let r=await report();assert.equal(r.captureEditing.editCandidate.notes[0].startTick,3);assert.equal(r.captureEditing.selectedNoteId,'a');assert.deepEqual(r.captureCandidate,original);assert.match(await page.locator('#capture-time-position').textContent(),/16分3つ/);
   await click('capture-edit-undo');assert.equal((await report()).captureEditing.pending,false);
   await select('b',display);await move('later');await move('later');r=await report();const b=r.captureEditing.editCandidate.notes.find(n=>n.id==='b');assert.deepEqual([b.startTick,b.durationTick,b.midi],[16,6,64]);assert.equal(r.captureEditing.selectedNoteId,'b');assert.equal(r.captureEditing.editCandidate.notes.length,original.notes.length);assert.deepEqual(r.captureCandidate,original);assert.match(await page.locator('#capture-time-position').textContent(),/2小節目・1拍目/);
   if(display==='score'){await click('capture-edit-undo');await click('capture-edit-undo');assert.equal((await report()).captureEditing.pending,false);}
  }
  const staged=(await report()).captureEditing.editCandidate;
  for(const [width,height] of [[320,568],[390,740],[844,390],[1280,800]]){
   await page.setViewportSize({width,height});await page.locator('#capture-time-edit').evaluate(n=>n.scrollIntoView({block:'center'}));
   const geometry=await page.locator('#capture-time-edit').evaluate(n=>{const [a,b]=[...n.querySelectorAll('button')].map(n=>n.getBoundingClientRect()),footer=document.querySelector('body > footer').getBoundingClientRect().top;return {gap:b.left-a.right,targets:a.width>=44&&b.width>=44&&a.height>=44&&b.height>=44,within:a.top>=0&&a.bottom<footer&&b.bottom<footer,overflow:document.documentElement.scrollWidth>innerWidth};});assert.ok(geometry.gap>=7.9);assert.equal(geometry.targets,true);assert.equal(geometry.within,true);assert.equal(geometry.overflow,false);assert.deepEqual((await report()).captureEditing.editCandidate,staged);
   await page.screenshot({path:`.local-tools/note-move-20261018/${source}-${width}.png`});
  }
  await page.setViewportSize({width:390,height:740});
  if(!layoutOnly&&['humming','image'].includes(source)){
   await page.locator('#edit-voice').check();const listen=()=>page.waitForFunction(()=>document.querySelector('#edit-voice-status').textContent==='声を受け付けています'),say=async text=>{await listen();await page.evaluate(text=>recognizers.at(-1).events.result({result:{text}}),text);};
   await say('音 を 前 へ');assert.equal((await report()).captureEditing.editCandidate.notes.find(n=>n.id==='b').startTick,15);await say('音 を 後ろ へ');assert.equal((await report()).captureEditing.editCandidate.notes.find(n=>n.id==='b').startTick,16);
   await say('まえ');assert.equal((await report()).captureEditing.selectedNoteId,'neighbor');assert.deepEqual((await report()).captureEditing.editCandidate,staged);await say('つぎ');assert.equal((await report()).captureEditing.selectedNoteId,'b');
   await page.evaluate(()=>window.staleMove=recognizers.at(-1).events.result);await click('preview');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');assert.equal(await page.locator('#capture-time-earlier').isDisabled(),true);await page.evaluate(()=>staleMove({result:{text:'音を前へ'}}));assert.deepEqual((await report()).captureEditing.editCandidate,staged);await click('stop');await page.locator('#edit-voice').uncheck();
  }
  await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');await page.reload();await open();let restored=await report();assert.equal(restored.captureEditing.pending,true);assert.deepEqual(restored.captureEditing.editCandidate,staged);assert.deepEqual(restored.captureCandidate,original);
  await click('capture-edit-confirm');await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');await page.reload();await open();restored=await report();assert.equal(restored.captureEditing.pending,false);assert.deepEqual(restored.captureCandidate,staged);
  await page.locator('#creation-note-display').selectOption('cards');await select('end','cards');assert.equal(await page.locator('#capture-time-later').isDisabled(),true,'sustain cannot extend beyond the final bar');await select('a','cards');for(let i=0;i<4;i++)await move('earlier');assert.equal(await page.locator('#capture-time-earlier').isDisabled(),true,'the first note cannot move before the song head');for(let i=0;i<4;i++)await click('capture-edit-undo');assert.equal((await report()).captureEditing.pending,false);assert.deepEqual(errors,[]);results.push({source,displays:['score','cards'],widths:[320,390,844,1280],draftAndConfirmedRestore:true});await context.close();
 }
 console.log(JSON.stringify({result:'PASS',base,browser:layoutOnly?'WebKit editing/layout only':'Chrome editing/layout and injected voice',results}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
