const {chromium,webkit}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026',layoutOnly=process.env.SAEZURI_BROWSER==='webkit';
const names=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
(async()=>{const browser=layoutOnly?await webkit.launch({headless:true,executablePath:process.env.SAEZURI_WEBKIT_PATH}):await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage({viewport:{width:390,height:740},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(!localStorage.getItem('saezuri.chordSlots.v1'))localStorage.setItem('saezuri.chordSlots.v1',JSON.stringify([{root:6,quality:'m7♭5',bass:1},...Array(8).fill(null)]));window.oscillators=[];if(typeof AudioContext!=='function')return;const make=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){const node=make.call(this),start=node.start.bind(node);node.start=(...args)=>{oscillators.push(true);return start(...args);};return node;};});
 const click=async id=>{await revealCreationControl(page,'#'+id);await page.locator('#'+id).click();},report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
 await page.goto(base+'/probe/saezuri/');await page.locator('#home-songs').waitFor();
 const original=await page.evaluate(async()=>{
  const {SongStore}=await import('/saezuri/song-store.js'),{emptySequence}=await import('./sequence-session.js'),{chordAuditionEvents}=await import('/saezuri/music/accompaniment.js');
  const chords=[[1,'m7♭5',6],[6,'sus4',1],[3,'add9',8],[10,'minor',3]].map(([root,quality,bass],i)=>({root,quality,bass,startTick:i*16,durationTick:16}));
  const pattern={source:'manual',bars:4,gridStep:1,key:{tonicPitchClass:0,mode:'major'},notes:[{id:'name-a',midi:61,startTick:0,durationTick:4},{id:'name-b',midi:66,startTick:32,durationTick:4}],accompaniment:{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home',chords}};
  const slots=[{root:6,quality:'m7♭5',bass:1},...Array(8).fill(null)];
  await new SongStore().save('flat-names',{title:'コードの表記',checkpoint:{confirmed:{pattern,cursor:36,hasRest:false},draft:null},sequence:emptySequence(),settings:{tempo:180,instrument:'piano'}});
  return {pattern,slots,expectedPitches:chordAuditionEvents(pattern,slots[0]).map(n=>n.midi)};
 });
 const open=async()=>{await click('home-songs');await page.locator('[data-song-open="flat-names"]').click();if(await page.locator('#song-continue').isVisible())await click('song-continue');};await open();
 const labels=['D♭m7♭5/G♭','G♭sus4/D♭','E♭add9/A♭','B♭m/E♭'];
 assert.deepEqual(await page.locator('#image-chords button').allTextContents(),labels.map((s,i)=>`${i+1}：${s}`));assert.deepEqual(await page.locator('#recording-chords b').allTextContents(),labels);
 for(const id of ['ending-root','ending-bass'])assert.deepEqual(await page.locator('#'+id+' option').evaluateAll(nodes=>nodes.filter(n=>n.value!=='').map(n=>n.textContent)),names);
 await click('creation-options-toggle');await page.locator('#creation-note-display').selectOption('cards');await click('creation-options-toggle');assert.deepEqual(await page.locator('#composition-cards .tutorial-bar-heading .tutorial-chord').allTextContents(),labels);
 const rendered=await page.evaluate(async pattern=>{
  const version=new URL(document.querySelector('script[src*="app.js"]').src).search,{renderTutorialView}=await import('./tutorial-view.js'+version),{CHORD_INTERVALS}=await import('/saezuri/music/catalog.js'+version);
  const fixture=document.createElement('div');fixture.style.width='360px';document.body.append(fixture);const results=[],before=JSON.stringify(pattern);
  for(const quality of Object.keys(CHORD_INTERVALS))for(const display of ['cards','score']){
   const sample=structuredClone(pattern);Object.assign(sample.accompaniment.chords[0],{root:6,quality,bass:1});renderTutorialView(fixture,sample,{display});
   results.push({quality,display,card:fixture.querySelector('.tutorial-bar-heading .tutorial-chord').textContent,staff:fixture.querySelector('.tutorial-staff .tutorial-chord').textContent});
  }fixture.remove();return {results,unchanged:JSON.stringify(pattern)===before};
 },original.pattern);
 for(const r of rendered.results){const expected=`G♭${r.quality==='major'?'':r.quality==='minor'?'m':r.quality}/D♭`;assert.equal(r.card,expected);assert.equal(r.staff,expected);}assert.equal(rendered.unchanged,true);
 if(!layoutOnly){if(await page.locator('#mic').getAttribute('aria-pressed')==='true'){await click('mic');await click('creation-options-toggle');}await click('backing-loop');await page.waitForFunction(()=>document.querySelector('#recording-guide').dataset.mode==='loop');assert.equal(await page.locator('#recording-guide').getAttribute('data-chord'),labels[0]);await click('stop');}
 const before=await report();await page.locator('[data-chord-bar="0"]').click();await click('chord-all-mode');
 for(const id of ['chord-root','chord-bass']){const options=await page.locator('#'+id+' option').evaluateAll(nodes=>nodes.filter(n=>n.value!=='').map(n=>({value:n.value,text:n.textContent})));assert.deepEqual(options,names.map((text,i)=>({value:String(i),text})));}
 assert.equal(await page.locator('[data-chord-slot="0"]').textContent(),'G♭m7♭5/D♭');
 if(!layoutOnly){await click('chord-basic-mode');const count=await page.evaluate(()=>oscillators.length);await page.locator('[data-chord-slot="0"]').click();await page.waitForFunction(n=>oscillators.length>n,count);assert.deepEqual((await report()).chordAudition.pitches,original.expectedPitches);}
 else{await page.locator('#chord-root').selectOption('6');await page.locator('#chord-quality').selectOption('m7♭5');await page.locator('#chord-bass').selectOption('1');}
 assert.match(await page.locator('#chord-candidate').textContent(),/G♭m7♭5\/D♭/);assert.deepEqual((await report()).captureCandidate,before.captureCandidate,'selecting/auditioning a differently spelled chord does not alter the song');
 await click('chord-use');await click('chord-confirm');await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');const adopted=await report();assert.deepEqual(adopted.captureCandidate.notes,original.pattern.notes);assert.deepEqual(['root','quality','bass'].map(k=>adopted.captureCandidate.accompaniment.chords[0][k]),[6,'m7♭5',1]);
 await page.reload();await open();assert.match(await page.locator('[data-chord-bar="0"]').textContent(),/G♭m7♭5\/D♭/);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('saezuri.chordSlots.v1'))),original.slots);
 fs.mkdirSync('.local-tools/chord-names-20261030',{recursive:true});await page.screenshot({path:'.local-tools/chord-names-20261030/'+(layoutOnly?'webkit':'chrome')+'.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',base,browser:layoutOnly?'WebKit UI/save only':'Chrome UI/audio/save',checks:layoutOnly?'12 root/bass choices, personal slots, cards/staff for 13 qualities, ending choices, raw data preserved, use/OK and reload':'12 root/bass choices, personal slots, cards/staff for 13 qualities, ending choices, live guide, raw data and pitches preserved, use/OK and reload'}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
