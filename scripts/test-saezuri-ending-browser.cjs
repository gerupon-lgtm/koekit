const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
  const saved=()=>page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');
  const connect=async()=>{if(await page.locator('#melody-create').isVisible())await page.locator('#work-connect').click();};
  const reopen=async()=>{await saved();await page.reload();await page.locator('#home-songs').click();await page.locator('[data-song-open]').first().click();if(await page.locator('#song-continue').isVisible())await page.locator('#song-continue').click();};
  const phrase=async(key,name,pitch)=>{
   await page.locator('#new-manual').click();if(key==='Am'){await page.locator('#composer-key').selectOption('Am');await page.locator('#capture-edit-confirm').click();}
   await revealCreationControl(page,`[data-pitch="${pitch}"]`);await page.locator(`[data-pitch="${pitch}"]`).click();await page.locator('#capture-edit-confirm').click();await revealCreationControl(page,'#phrase-name');await page.locator('#phrase-name').fill(name);await page.locator('#keep-phrase').click();
  };
  await page.goto(base+'/probe/saezuri/');await page.locator('#home-create').click();await phrase('Am','A',5);await page.locator('#after-keep-more').click();await phrase('C','B',0);
  await page.locator('#screen-settings').click();await page.locator('#tempo').fill('180');await page.locator('#tempo').dispatchEvent('change');await page.locator('#settings-close').click();await connect();
  const ids=await page.locator('[data-phrase]').evaluateAll(nodes=>nodes.map(n=>n.dataset.phrase));
  for(const id of ids){await page.locator(`[data-phrase="${id}"]`).click();await page.locator('#sequence-confirm').click();}
  assert.match(await page.locator('#ending-open').textContent(),/追加なし/);assert.match(await page.locator('#sequence-count').textContent(),/8小節/);
  await page.locator('#ending-open').click();assert.equal(await page.locator('#ending-quality option').count(),13);assert.equal(await page.locator('#ending-preview').isDisabled(),true);
  await page.locator('#ending-length').selectOption('2');assert.match(await page.locator('#ending-recommendation').textContent(),/おすすめ：C。/);assert.match(await page.locator('#sequence-count').textContent(),/10小節/);
  await page.evaluate(()=>{window.endingPositions=[];new MutationObserver(()=>window.endingPositions.push(document.querySelector('#position').textContent)).observe(document.querySelector('#position'),{childList:true});});
  const started=Date.now();await page.locator('#ending-preview').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
  assert.equal(await page.locator('#ending-root').isDisabled(),true);assert.equal(await page.locator('#ending-close').isEnabled(),true);
  await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='idle',null,{timeout:12000});const audition=await report();
  assert.ok(Date.now()-started>=2600);assert.equal(audition.playback.bars,2);assert.equal(audition.playback.reason,'ENDED');assert.equal(audition.playback.notes,0);assert.equal(audition.playback.accompanimentEvents,4);
  assert.ok((await page.evaluate(()=>window.endingPositions)).every(text=>Number(text.match(/\d+/)[0])<=2),'release stays on the final bar');
  await page.locator('#ending-confirm').click();assert.equal(await page.locator('#ending-sheet').isVisible(),false);
  await page.locator('#sequence-line [data-placement]').nth(1).click();await page.locator('#sequence-left').click();await page.locator('#sequence-confirm').click();
  await page.locator('#ending-open').click();assert.match(await page.locator('#ending-recommendation').textContent(),/おすすめ：Am。/);
  const custom=async()=>{await page.locator('#ending-root').selectOption('9');await page.locator('#ending-quality').selectOption('major');if(!await page.locator('#ending-bass-detail').evaluate(n=>n.open))await page.locator('#ending-bass-detail > summary').click();await page.locator('#ending-bass').selectOption('5');await page.locator('#ending-length').selectOption('4');};
  await custom();await page.locator('#ending-close').click();assert.match(await page.locator('#ending-open').textContent(),/4小節・A\/F/);await page.locator('#sequence-undo').click();assert.match(await page.locator('#ending-open').textContent(),/2小節・Am/);
  await page.locator('#ending-open').click();await custom();await page.locator('#ending-confirm').click();await reopen();await connect();assert.match(await page.locator('#ending-open').textContent(),/4小節・A\/F/);
  await page.locator('#sequence-line [data-placement]').first().click();await page.locator('#sequence-right').click();await page.locator('#sequence-confirm').click();
  await page.locator('#ending-open').click();assert.match(await page.locator('#ending-recommendation').textContent(),/おすすめ：C。/);assert.equal(await page.locator('#ending-root').inputValue(),'9');assert.equal(await page.locator('#ending-quality').inputValue(),'major');
  assert.match(await page.locator('#ending-open').textContent(),/A\/F/);await page.locator('#ending-length').selectOption('1');await page.locator('#ending-close').click();
  await reopen();await connect();assert.match(await page.locator('#ending-open').textContent(),/1小節・A\/F/);await page.locator('#ending-open').click();await page.locator('#ending-cancel').click();assert.match(await page.locator('#ending-open').textContent(),/4小節・A\/F/);
  // Full-song playback reaches the separate ending range and can stop inside it.
  await page.locator('#sequence-preview').click();await page.waitForFunction(()=>document.querySelector('[data-ending][data-playing]'),null,{timeout:20000});
  const full=await report();assert.equal(full.playback.bars,12);assert.equal(full.playback.ending.startTick,128);assert.equal(full.playback.ending.durationTick,64);
  await page.locator('#stop').click();assert.equal(await page.locator('#status').getAttribute('data-state'),'idle');
  // Render the same realtime voice implementation offline solely as an audio test.
  const pcm=await page.evaluate(async()=>{
   const {endingEvents}=await import('../../saezuri/music/ending.js'),{scheduleVoice}=await import('./audio.js');
   const duration=16/3,start=.05,rate=48000,ctx=new OfflineAudioContext(1,Math.ceil((start+duration+1)*rate),rate),times=[];
   const create=ctx.createOscillator.bind(ctx);ctx.createOscillator=()=>{const node=create(),begin=node.start.bind(node);node.start=(at=0)=>{times.push(at);begin(at);};return node;};
   const p={id:'A',familyId:'A',name:'A',bars:4,gridStep:2,key:{tonicPitchClass:9,mode:'minor'},notes:[],accompaniment:{enabled:true,genre:'ballad',rhythm:'arpeggio',progression:'home',sounds:{chord:'strings',bass:'soft'}}};
   const s={patterns:[p],placements:[{id:'p',patternId:'A'}],ending:{enabled:true,bars:4,mode:'custom',customChord:{root:9,quality:'major',bass:5}}};
   const notes=endingEvents(s),ends=notes.map(note=>scheduleVoice(ctx,ctx.destination,{...note,time:start,duration,gain:note.gain,engine:'light'}).endTime);
   const data=(await ctx.startRendering()).getChannelData(0),rms=(at,length=.06)=>{let sum=0;const begin=Math.floor(at*rate),end=Math.min(data.length,begin+Math.floor(length*rate));for(let i=begin;i<end;i++)sum+=data[i]*data[i];return Math.sqrt(sum/(end-begin));};
   return {events:notes.length,starts:times,held:rms(start+duration-.2),tail:rms(start+duration+.05),silence:rms(start+duration+.5),lastEnd:Math.max(...ends),musicalEnd:start+duration};
  });
  assert.equal(pcm.events,4);assert.equal(pcm.starts.length,7);assert.ok(pcm.starts.every(t=>t===.05));assert.ok(pcm.held>.001);assert.ok(pcm.tail>.00001);assert.ok(pcm.silence<1e-8);assert.ok(pcm.lastEnd>pcm.musicalEnd+.3);
  for(const width of [320,390,844,1280]){
   await page.setViewportSize({width,height:844});await page.locator('#ending-open').click();
   const layout=await page.evaluate(()=>{const d=document.querySelector('#ending-sheet'),close=d.querySelector('#ending-close').getBoundingClientRect(),stop=d.querySelector('#ending-stop').getBoundingClientRect(),r=d.getBoundingClientRect(),rects=[...d.querySelectorAll('.sheet-actions button')].map(n=>n.getBoundingClientRect());let gap=Infinity;for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top))gap=Math.min(gap,Math.max(a.left,b.left)-Math.min(a.right,b.right));else if(Math.min(a.right,b.right)>Math.max(a.left,b.left))gap=Math.min(gap,Math.max(a.top,b.top)-Math.min(a.bottom,b.bottom));}return {gap,overflow:document.documentElement.scrollWidth>innerWidth,center:Math.abs((stop.left+stop.right-r.left-r.right)/2),right:close.right<=r.right&&close.left>r.left+r.width/2};});
   assert.equal(layout.overflow,false);assert.ok(layout.center<2);assert.equal(layout.right,true);assert.ok(layout.gap>=7.5);await page.locator('#ending-close').click();
  }
  assert.deepEqual(errors,[]);await context.close();
  // Public storage API fixtures model old saved songs with no new optional fields.
  const oldContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),old=await oldContext.newPage(),oldErrors=[];old.on('pageerror',e=>oldErrors.push(e.message));
  await old.goto(base+'/probe/saezuri/');await old.locator('#home-songs').waitFor();
  await old.evaluate(async()=>{
   const {SongStore}=await import('../../saezuri/song-store.js'),store=new SongStore();
   const p={id:'A',familyId:'A',name:'古いA',bars:4,gridStep:2,source:'manual',key:{tonicPitchClass:0,mode:'major'},notes:[{id:'n',midi:60,startTick:0,durationTick:4}]};
   await store.save('legacy-fixture',{title:'以前のきょく',checkpoint:null,sequence:{patterns:[p],placements:[{id:'p',patternId:'A'}],revision:0,undoStack:[]},sequenceDraft:null,settings:{tempo:180,instrument:'piano'}});
   await store.save('shelf-fixture',{title:'棚だけのきょく',checkpoint:null,sequence:{patterns:[p],placements:[],revision:0,undoStack:[]},sequenceDraft:null,settings:{tempo:180,instrument:'piano'}});
   await store.save('long-fixture',{title:'132小節のきょく',checkpoint:null,sequence:{patterns:[{...p,bars:8}],placements:Array.from({length:16},(_,i)=>({id:`p${i}`,patternId:'A'})),revision:0,undoStack:[],ending:{enabled:true,bars:4,mode:'custom',customChord:{root:9,quality:'major',bass:5}}},sequenceDraft:null,settings:{tempo:180,instrument:'piano'}});
  });
  await old.reload();await old.locator('#home-songs').click();await old.locator('[data-song-open="legacy-fixture"]').click();assert.match(await old.locator('#ending-open').textContent(),/追加なし/);assert.match(await old.locator('#sequence-count').textContent(),/4小節/);
  await old.locator('#melody-connect [data-screen-back]').click();await old.locator('#home-songs').click();await old.locator('[data-song-open="long-fixture"]').click();
  assert.match(await old.locator('#sequence-count').textContent(),/132小節/);assert.equal(await old.locator('[data-placement]').count(),16);assert.equal(await old.locator('[data-ending]').count(),1);
  await old.locator('#sequence-preview').click();await old.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');await old.locator('#report').evaluate(n=>n.click());
  const long=JSON.parse(await old.locator('#metrics').textContent());assert.equal(long.playback.bars,132);assert.equal(long.playback.ending.startTick,2048);assert.equal(long.playback.ending.durationTick,64);await old.locator('#stop').click();
  await old.locator('#melody-connect [data-screen-back]').click();await old.locator('#home-songs').click();await old.locator('[data-song-open="shelf-fixture"]').click();
  await old.locator('[data-phrase-remove="A"]').click();await old.locator('#sequence-confirm').click();await old.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');
  await old.reload();await old.locator('#home-songs').click();await old.locator('#song-library').waitFor();await old.waitForFunction(()=>!document.querySelector('#song-list-status').textContent.startsWith('よみこんでいます'));
  assert.equal(await old.locator('[data-song-open]').count(),3,'deleting the last unused phrase does not delete any saved song');
  await old.locator('[data-song-open="shelf-fixture"]').click();assert.equal(await old.locator('[data-phrase]').count(),0);assert.deepEqual(oldErrors,[]);await oldContext.close();
  console.log('PASS endings: editable last-key recommendation, slash/custom persistence, pending restore/cancel, exact realtime duration/end/stop, one attack and PCM release, four widths, legacy songs and empty-shelf preservation');
  console.log(JSON.stringify({pcm}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
