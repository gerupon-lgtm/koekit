const {chromium,webkit}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026',layoutOnly=process.env.SAEZURI_BROWSER==='webkit';
(async()=>{const browser=layoutOnly?await webkit.launch({headless:true,executablePath:process.env.SAEZURI_WEBKIT_PATH}):await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 for(const [source,bars] of [['free',8],['image',4]]){
  const context=await browser.newContext({viewport:{width:390,height:740},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.toneNodes=[];window.audioContexts=[];if(typeof AudioContext!=='function')return;const Native=AudioContext,make=Native.prototype.createOscillator;
   window.AudioContext=class extends Native{constructor(options){super(options);this.testHint=options?.latencyHint;audioContexts.push(this);}};
   Native.prototype.createOscillator=function(){const oscillator=make.call(this),ctx=this,row={started:false,ended:false},start=oscillator.start.bind(oscillator);
    oscillator.start=(time=ctx.currentTime)=>{Object.assign(row,{started:true,lead:time-ctx.currentTime});return start(time);};
    oscillator.addEventListener('ended',()=>row.ended=true);toneNodes.push(row);return oscillator;
   };
  });
  await page.goto(base+'/probe/saezuri/');
  const original=await page.evaluate(async({source,bars})=>{
   const {SongStore}=await import('/saezuri/song-store.js'),{emptySequence}=await import('./sequence-session.js'),{generateImageAccompaniment}=await import('/saezuri/music/image-arrangement.js');
   const pattern={bars,gridStep:1,key:{tonicPitchClass:0,mode:'major'},notes:[{id:'first',midi:60,startTick:0,durationTick:4},{id:'later',midi:67,startTick:32,durationTick:4}],accompaniment:{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'}};
   if(source==='image')pattern.accompaniment=generateImageAccompaniment(pattern,{type:'nursery',speed:'normal',mood:'bright'});
   await new SongStore().save('chord-choice',{title:'コードを選ぶ確認',checkpoint:{confirmed:{pattern,cursor:36,hasRest:false},draft:null},sequence:emptySequence(),settings:{tempo:120,instrument:'piano'}});
   const url=performance.getEntriesByType('resource').find(r=>/\/audio\.js\?/.test(r.name)).name,{ProbeTransport}=await import(url),start=ProbeTransport.prototype.start;
   ProbeTransport.prototype.start=function(notes,options){window.chordStarts??=[];chordStarts.push({notes,options});return start.call(this,notes,options);};return pattern;
  },{source,bars});
  const click=id=>page.locator('#'+id).click(),report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
  const choose=async label=>{if(!await page.locator('#chord-basic').isVisible())await click('chord-basic-mode');await page.locator('#chord-basic button').getByText(label,{exact:true}).click();};
  const open=async()=>{await click('home-songs');await page.locator('[data-song-open="chord-choice"]').click();if(await page.locator('#song-continue').isVisible())await click('song-continue');await revealCreationControl(page,'[data-mode="backing"]');await page.locator('[data-mode="backing"]').click();};
  await open();const initialHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
  await page.locator('[data-chord-bar="1"]').click();assert.equal(await page.locator('dialog:modal').count(),0);assert.equal(await page.locator('#live-keyboard').isVisible(),false);assert.ok(await page.evaluate(()=>document.querySelector('#image-chords').getBoundingClientRect().bottom<=document.querySelector('#chord-sheet').getBoundingClientRect().top),'bar buttons stay above the inline editor');
  await choose('Dm');assert.equal((await report()).captureEditing.pending,false,'choose does not apply');
  if(!layoutOnly){await page.evaluate(()=>window.quickBefore=toneNodes.length);await click('chord-single-preview');await page.waitForFunction(()=>toneNodes.slice(quickBefore).filter(n=>n.started).length===7);
  const quick=await page.evaluate(()=>({nodes:toneNodes.slice(quickBefore),hint:audioContexts.at(-1).testHint,transportStarts:window.chordStarts?.length??0}));
  assert.equal(quick.hint,'interactive');assert.equal(quick.transportStarts,0);assert.ok(quick.nodes.every(n=>n.lead>=-.01&&n.lead<=.04),'no 600ms song lead');}
  assert.equal((await report()).captureEditing.pending,false);assert.deepEqual((await report()).captureCandidate,original);
  await click('chord-use');const used=await report(),working=used.captureEditing.editCandidate;assert.equal(used.captureEditing.pending,true);assert.equal(working.accompaniment.chords[0].root,2);assert.deepEqual(used.captureCandidate,original);
  await click('chord-next');await choose('Am');await click('chord-previous');assert.equal(await page.locator('#chord-root').inputValue(),'2');assert.deepEqual((await report()).captureEditing.editCandidate,working);assert.equal((await report()).captureEditing.undoDepth,used.captureEditing.undoDepth);
  await click('chord-next');await click('chord-all-mode');await page.locator('#chord-root').selectOption('6');assert.equal(await page.locator('#chord-bass').inputValue(),'6');
  await page.locator('#chord-quality').selectOption('m7♭5');await page.locator('#chord-bass').selectOption('1');assert.equal(await page.locator('#chord-root option').count(),12);assert.deepEqual((await report()).captureEditing.editCandidate,working);
  if(!layoutOnly){await page.evaluate(()=>window.quickBefore=toneNodes.length);await click('chord-single-preview');await page.waitForFunction(()=>toneNodes.slice(quickBefore).filter(n=>n.started).length===9);}assert.deepEqual((await report()).captureEditing.editCandidate,working);
  await click('chord-use');const applied=await report(),chord=applied.captureEditing.editCandidate.accompaniment.chords.find(c=>c.startTick===32);assert.deepEqual([chord.root,chord.quality,chord.bass],[6,'m7♭5',1]);
  for(const [width,height] of [[320,568],[390,740],[844,390],[1280,800]]){
   await page.setViewportSize({width,height});const heights=[];
   for(const mode of ['basic','all']){
    await click('chord-'+mode+'-mode');const layout=await page.locator('#chord-sheet').evaluate(dialog=>{
     const b=dialog.getBoundingClientRect(),boxes=[...dialog.querySelectorAll('button,select')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect());
     const stop=document.getElementById('stop').getBoundingClientRect();
     return {height:b.height,targets:boxes.every(r=>r.width>=44&&r.height>=44),gap:boxes.every((a,i)=>boxes.slice(i+1).every(c=>a.right+7.9<=c.left||c.right+7.9<=a.left||a.bottom+7.9<=c.top||c.bottom+7.9<=a.top)),inside:b.left>=0&&b.right<=innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,stop:{top:stop.top,bottom:stop.bottom,width:stop.width},stopVisible:stop.width>=44&&stop.top>=0&&stop.bottom<=innerHeight+.5};
    });assert.ok(layout.targets&&layout.gap&&layout.inside&&!layout.overflow&&layout.stopVisible,JSON.stringify({source,width,height,mode,layout}));heights.push(layout.height);
   }assert.ok(Math.abs(heights[0]-heights[1])<1,'chromatic mode retains editor height');
  }
  await page.setViewportSize({width:390,height:740});assert.ok(await page.evaluate(n=>document.documentElement.scrollHeight<=n+100,initialHeight));
  fs.mkdirSync('.local-tools/chord-workspace-20261027',{recursive:true});await page.screenshot({path:'.local-tools/chord-workspace-20261027/'+(layoutOnly?'webkit-':'')+source+'-all.png',fullPage:true});
  if(!layoutOnly){await click('chord-preview');await page.waitForFunction(()=>window.chordStarts?.length===1);const played=await page.evaluate(()=>chordStarts.at(-1));assert.deepEqual(played.notes.map(n=>[n.midi,n.startTick,n.durationTick]),original.notes.map(n=>[n.midi,n.startTick,n.durationTick]));assert.equal(played.options.totalTicks,bars*16);await click('stop');}assert.equal((await report()).captureEditing.undoDepth,applied.captureEditing.undoDepth);
  await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');const savedDraft=await page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return (await new SongStore().get('chord-choice')).data.checkpoint;});assert.deepEqual(savedDraft.draft.working.pattern,applied.captureEditing.editCandidate,'only used chords enter the saved draft');
  await click('chord-basic-mode');await choose('Am');await click('chord-confirm');await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');await page.locator('#live-keyboard').waitFor({state:'visible'});const confirmed=await report();assert.equal(confirmed.captureEditing.pending,false);assert.deepEqual(confirmed.captureCandidate.notes,original.notes);assert.equal(confirmed.captureCandidate.accompaniment.chords.find(c=>c.startTick===32).root,6,'OK never applies an unused local choice');
  await page.reload();await open();await page.locator('[data-chord-bar="2"]').click();assert.equal(await page.locator('#chord-all-mode').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#chord-root').inputValue(),'6');assert.equal(await page.locator('#chord-bass').inputValue(),'1');
  await page.locator('[data-chord-bar="0"]').click();assert.equal(await page.locator('#chord-previous').isDisabled(),true);await page.locator('[data-chord-bar="'+(bars-1)+'"]').click();assert.equal(await page.locator('#chord-next').isDisabled(),true);
  await click('chord-close');await page.locator('#live-keyboard').waitFor({state:'visible'});assert.deepEqual(errors,[]);await context.close();console.log('PASS '+source+'/'+bars+': inline choose/use/OK, '+(layoutOnly?'WebKit UI only (no audio API)':'quick voices')+', chromatic/slash, bar navigation, save/reload and 4 sizes');
 }
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
