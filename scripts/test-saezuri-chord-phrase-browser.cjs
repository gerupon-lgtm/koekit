const {chromium,webkit}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026',layoutOnly=process.env.SAEZURI_BROWSER==='webkit';
(async()=>{const browser=layoutOnly?await webkit.launch({headless:true,executablePath:process.env.SAEZURI_WEBKIT_PATH}):await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 for(const [source,bars] of [['free',8],['image',4]]){
  const context=await browser.newContext({viewport:{width:390,height:740},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.phraseTones=0;if(typeof AudioContext!=='function')return;const make=AudioContext.prototype.createOscillator;
   AudioContext.prototype.createOscillator=function(){const node=make.call(this),start=node.start.bind(node);node.start=(...args)=>{phraseTones++;return start(...args);};return node;};
  });
  const click=async id=>{await revealCreationControl(page,'#'+id);await page.locator('#'+id).click();};
  const report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
  const songs=()=>page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return new SongStore().list();});
  const saved=()=>page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');
  const connect=async()=>{await page.locator('#melody-create [data-screen-back]').click();await page.locator('#melody-choose [data-screen-back]').click();await click('home-connect');};
  await page.goto(base+'/probe/saezuri/');await click('home-create');await click(source==='free'?'new-manual':'new-image');
  assert.equal(await page.locator('#keep-phrase').isDisabled(),true,'empty or unconfirmed backing is not registerable');
  if(source==='free'){
   await revealCreationControl(page,'#phrase-bars');await page.locator('#phrase-bars').selectOption(String(bars));await click('capture-edit-confirm');
   assert.equal(await page.locator('#keep-phrase').isDisabled(),true,'confirming only the bar count does not create a phrase');
   await revealCreationControl(page,'[data-mode="backing"]');await page.locator('[data-mode="backing"]').click();
   await click('image-settings-open');await page.locator('#image-enabled').check();await click('backing-settings-close');
  }
  assert.equal(await page.locator('#keep-phrase').isDisabled(),true);assert.equal((await songs()).length,0,'unconfirmed chord-only work is not restored as a saved song');
  await click('capture-edit-confirm');assert.equal(await page.locator('#keep-phrase').isEnabled(),true);
  // Use the ordinary inline picker and its existing two-step confirmation.
  await revealCreationControl(page,'[data-chord-bar="0"]');await page.locator('[data-chord-bar="0"]').click();await click('chord-all-mode');
  await page.locator('#chord-root').selectOption('1');await page.locator('#chord-quality').selectOption('maj7');await page.locator('#chord-bass').selectOption('5');
  assert.equal((await report()).captureEditing.pending,false,'choosing a chord alone leaves the confirmed backing intact');
  await click('chord-use');assert.equal(await page.locator('#keep-phrase').isDisabled(),true,'used but unconfirmed chord stays a candidate');
  await click('chord-confirm');assert.equal(await page.locator('#keep-phrase').isEnabled(),true);
  const pattern=(await report()).captureCandidate;assert.deepEqual(pattern.notes,[]);assert.equal(pattern.bars,bars);
  assert.deepEqual(['root','quality','bass'].map(k=>pattern.accompaniment.chords[0][k]),[1,'maj7',5]);
  await click('screen-settings');await page.locator('#tempo').fill('180');await page.locator('#tempo').dispatchEvent('change');await click('settings-close');
  await revealCreationControl(page,'#phrase-name');await page.locator('#phrase-name').fill('コードだけ');await click('keep-phrase');
  assert.match(await page.locator('#phrase-feedback').textContent(),/コードだけ/);await saved();
  let records=await songs();assert.equal(records.length,1);assert.deepEqual(records[0].data.sequence.patterns[0].notes,[]);
  assert.deepEqual(records[0].data.sequence.patterns[0].accompaniment,pattern.accompaniment);
  await click('after-keep-connect');const phrase=page.locator('#phrase-shelf [data-phrase]');assert.equal(await phrase.count(),1);
  await phrase.click();assert.equal(await page.locator('#sequence-confirm').isEnabled(),true);assert.equal((await songs())[0].data.sequence.placements.length,0,'arranging still needs OK');
  await click('sequence-undo');assert.equal(await page.locator('#sequence-line [data-placement]').count(),0);
  for(let i=0;i<2;i++){await phrase.click();await click('sequence-confirm');}
  assert.match(await page.locator('#sequence-count').textContent(),new RegExp(`${bars*2}小節`));await saved();
  const sequence=(await songs())[0].data.sequence;
  assert.equal(sequence.placements.length,2);assert.deepEqual(sequence.patterns[0].notes,[]);
  // Observe the actual transport arguments and oscillator creation, with no audio API substitute.
  if(!layoutOnly){
   await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(r=>/\/audio\.js\?/.test(r.name)).name,{ProbeTransport}=await import(url),start=ProbeTransport.prototype.start;
    ProbeTransport.prototype.start=function(notes,options){window.phraseStart={notes,options};return start.call(this,notes,options);};window.phraseTonesBefore=phraseTones;});
   await click('sequence-preview');await page.waitForFunction(()=>window.phraseStart&&phraseTones>phraseTonesBefore);
   assert.equal(await page.locator('#keep-phrase').isDisabled(),true,'playback keeps registration locked');
   const actual=await page.evaluate(()=>phraseStart),expected=await page.evaluate(async sequence=>{const {sequencePlayback}=await import('./sequence-session.js');return sequencePlayback(sequence);},sequence);
   assert.deepEqual(actual.notes,[]);assert.equal(actual.options.totalTicks,bars*32);assert.deepEqual(actual.options.accompaniment,expected.backing);assert.ok(expected.backing.some(n=>n.startTick>=bars*16));
   assert.equal((await report()).playback.sequence,true);assert.equal((await report()).playback.notes,0);
   if(source==='image')await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='idle',{},{timeout:15000});else await click('stop');
  }
  await saved();await page.reload();await click('home-songs');records=await songs();
  const originalId=records[0].id,row=page.locator('.song-row').filter({has:page.locator('[data-song-open="'+originalId+'"]')});await row.getByRole('button',{name:'コピー',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-song-open]').length===2);records=await songs();
  const duplicate=records.find(r=>r.id!==originalId&&r.title.includes('のコピー'));
  assert.ok(duplicate);assert.deepEqual(duplicate.data.sequence,sequence);assert.deepEqual(duplicate.data.checkpoint.confirmed.pattern.notes,[]);
  await page.locator('[data-song-open="'+duplicate.id+'"]').click();if(await page.locator('#song-continue').isVisible())await click('song-continue');
  assert.deepEqual((await report()).captureCandidate.accompaniment,pattern.accompaniment);await connect();assert.equal(await page.locator('#phrase-shelf [data-phrase]').count(),1);assert.equal(await page.locator('#sequence-line [data-placement]').count(),2);
  for(const [width,height] of [[320,568],[390,740]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${source}/${bars}: chord-only registration, pending gates, repeated placement/cancel/OK, saved copy/reload, ${layoutOnly?'WebKit UI only':'native scheduled backing with zero melody notes'}`);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
