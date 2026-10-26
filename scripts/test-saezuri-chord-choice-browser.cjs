const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const context=await browser.newContext({viewport:{width:390,height:740},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/probe/saezuri/');
 const original=await page.evaluate(async()=>{
  const {SongStore}=await import('/saezuri/song-store.js'),{emptySequence}=await import('./sequence-session.js');
  const pattern={bars:4,gridStep:1,key:{tonicPitchClass:0,mode:'major'},notes:[{id:'first',midi:60,startTick:0,durationTick:4},{id:'later',midi:67,startTick:32,durationTick:4}],accompaniment:{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'}};
  await new SongStore().save('chord-choice',{title:'コードを選ぶ確認',checkpoint:{confirmed:{pattern,cursor:36,hasRest:false},draft:null},sequence:emptySequence(),settings:{tempo:120,instrument:'piano'}});
  const url=performance.getEntriesByType('resource').find(r=>/\/audio\.js\?/.test(r.name)).name,{ProbeTransport}=await import(url),start=ProbeTransport.prototype.start;
  ProbeTransport.prototype.start=function(notes,options){window.chordStarts??=[];chordStarts.push({notes,options});return start.call(this,notes,options);};
  return pattern;
 });
 const click=id=>page.locator('#'+id).click(),report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
 const openSong=async()=>{await click('home-songs');await page.locator('[data-song-open="chord-choice"]').click();if(await page.locator('#song-continue').isVisible())await click('song-continue');await revealCreationControl(page,'[data-mode="backing"]');await page.locator('[data-mode="backing"]').click();};
 await openSong();assert.equal((await report()).captureEditing.pending,false);
 await page.locator('[data-chord-bar="1"]').click();const before=await report();
 const dm=page.locator('#chord-basic button').filter({hasText:/^Dm$/});await dm.click();
 let selected=await report();assert.equal(selected.captureEditing.pending,true,'selection pins the working chord without requiring an audition');
 assert.equal(await dm.getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>window.chordStarts?.length??0),0,'selection does not start playback');
 assert.deepEqual(selected.captureCandidate,original,'OK is still required to change the confirmed song');
 assert.equal(selected.captureEditing.editCandidate.accompaniment.chords.find(c=>c.startTick===16).root,2);
 await click('chord-close');await page.locator('[data-chord-bar="1"]').click();assert.equal(await page.locator('#chord-root').inputValue(),'2');assert.equal(await dm.getAttribute('aria-pressed'),'true');
 const pinned=await report();await click('chord-single-preview');await page.waitForFunction(()=>window.chordStarts?.length===1);
 let played=await page.evaluate(()=>chordStarts.at(-1));assert.deepEqual(played.notes,[]);assert.equal(played.options.totalTicks,8);assert.equal(played.options.countSound,false);
 assert.ok(played.options.accompaniment.every(e=>e.startTick===0&&e.durationTick===8&&e.part!=='drums'));
 assert.deepEqual(played.options.accompaniment.filter(e=>e.part==='chord').map(e=>e.midi%12).sort((a,b)=>a-b),[2,5,9]);
 await click('chord-stop');assert.deepEqual((await report()).captureEditing,pinned.captureEditing,'single audition changes no selection, candidate or Undo');
 await click('chord-preview');await page.waitForFunction(()=>window.chordStarts?.length===2);played=await page.evaluate(()=>chordStarts.at(-1));
 assert.deepEqual(played.notes.map(n=>[n.midi,n.startTick,n.durationTick]),original.notes.map(n=>[n.midi,n.startTick,n.durationTick]));assert.equal(played.options.totalTicks,64);
 await click('chord-stop');assert.deepEqual((await report()).captureEditing,pinned.captureEditing,'full preview changes no selection, candidate or Undo');
 await page.locator('#chord-detail summary').click();await page.locator('#chord-root').selectOption('11');await page.locator('#chord-quality').selectOption('m7♭5');await page.locator('#chord-bass').selectOption('1');
 selected=await report();const chord=selected.captureEditing.editCandidate.accompaniment.chords.find(c=>c.startTick===16);assert.deepEqual([chord.root,chord.quality,chord.bass],[11,'m7♭5',1]);
 for(const [width,height] of [[320,568],[390,740],[844,390],[1280,800]]){
  await page.setViewportSize({width,height});await page.locator('#chord-sheet .sheet-actions').scrollIntoViewIfNeeded();
  const layout=await page.locator('#chord-sheet').evaluate(dialog=>{
   const boxes=['chord-single-preview','chord-preview','chord-confirm'].map(id=>document.getElementById(id).getBoundingClientRect());
   const stop=document.getElementById('chord-stop').getBoundingClientRect(),bounds=dialog.getBoundingClientRect();
   return {contained:boxes.every(b=>b.left>=0&&b.right<=innerWidth&&b.width>=44&&b.height>=44),separate:boxes.every((a,i)=>boxes.slice(i+1).every(b=>a.right+7.9<=b.left||b.right+7.9<=a.left||a.bottom+7.9<=b.top||b.bottom+7.9<=a.top)),stopCentered:Math.abs((stop.left+stop.right)/2-(bounds.left+bounds.right)/2)<2,overflow:document.documentElement.scrollWidth>innerWidth};
  });assert.ok(layout.contained&&layout.separate&&layout.stopCentered&&!layout.overflow,JSON.stringify({width,height,layout}));
 }
 await page.setViewportSize({width:390,height:740});fs.mkdirSync('.local-tools/nursery-backing-20261026',{recursive:true});await page.screenshot({path:'.local-tools/nursery-backing-20261026/chord-choice.png'});await click('chord-confirm');await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');
 const confirmed=await report();assert.equal(confirmed.captureEditing.pending,false);assert.deepEqual(confirmed.captureCandidate.notes,original.notes);assert.equal(confirmed.captureCandidate.accompaniment.chords[0].quality,'m7♭5');
 assert.equal(confirmed.captureEditing.undoDepth,selected.captureEditing.undoDepth,'OK does not stage the selected chord a second time');
 await page.reload();await openSong();await page.locator('[data-chord-bar="1"]').click();assert.equal(await page.locator('#chord-root').inputValue(),'11');assert.equal(await page.locator('#chord-bass').inputValue(),'1');
 assert.deepEqual(errors,[]);console.log('PASS chord selection: pins immediately, reopen, separate harmony/full audition, no audition side effects, OK/save/reload, 4 viewport sizes');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
