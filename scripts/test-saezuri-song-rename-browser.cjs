const {openSongActions}=require('./saezuri-browser-controls.cjs');
const {chromium,webkit}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026',layoutOnly=process.env.SAEZURI_BROWSER==='webkit';
(async()=>{const browser=layoutOnly?await webkit.launch({headless:true,executablePath:process.env.SAEZURI_WEBKIT_PATH}):await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:390,height:740},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const click=async id=>{if(id==='home-resume'){if(await page.locator('#melody-connect').isVisible())await page.locator('#sequence-work-create').click();return;}return page.locator('#'+id).click();},report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
 const get=id=>page.evaluate(async id=>{const {SongStore}=await import('/saezuri/song-store.js');return new SongStore().get(id);},id);
 const library=async()=>{if(await page.locator('#melody-create').isVisible())await click('work-connect');await click('sequence-song');await page.locator('[data-song-open="rename-active"]').waitFor({state:'visible'});};
 const rename=async(id,title)=>{await openSongActions(page,id);await page.locator('[data-song-rename="'+id+'"]').click();await page.locator('#song-rename-title').fill(title);await click('song-rename-confirm');await page.locator('#song-rename').waitFor({state:'hidden'});await page.locator('[data-song-rename="'+id+'"]').waitFor({state:'attached'});};
 await page.goto(base+'/probe/saezuri/');await page.locator('#home-songs').waitFor();
 const original=await page.evaluate(async()=>{
  const {SongStore}=await import('/saezuri/song-store.js'),{openEditSession,confirmEditSession}=await import('./edit-session.js'),{proposeEntry}=await import('./entry-session.js'),{songCheckpoint,restoreCheckpoint}=await import('./song-session.js'),{emptySequence,keepPhrase,proposeSequence}=await import('./sequence-session.js');
  const p={bars:4,gridStep:1,source:'manual',key:{tonicPitchClass:9,mode:'minor'},notes:[{id:'first',midi:69,startTick:0,durationTick:4}],accompaniment:{enabled:true,genre:'pop',rhythm:'offbeat',progression:'home',chords:[{root:1,quality:'maj7',bass:5,startTick:0,durationTick:16}]}};
  let session=confirmEditSession(openEditSession(p));session.working.cursor=4;session=proposeEntry(session,{midi:72,durationTick:2});
  const sequence=keepPhrase(emptySequence(),p,'元のフレーズ'),sequenceDraft=proposeSequence(sequence,{type:'append',placement:{id:'p',patternId:sequence.patterns[0].id}}).next;
  // Use the ordinary restored-session shape, including its empty Undo list.
  const data={navigation:{screen:'create',mode:'input'},title:'元の曲',checkpoint:songCheckpoint(restoreCheckpoint(songCheckpoint(session))),sequence,sequenceDraft:{...sequenceDraft,undoStack:[]},placementDraft:null,settings:{tempo:110,instrument:'fm-piano'}};
  const saved=await new SongStore().save('rename-active',data);await new SongStore().save('rename-other',{...structuredClone(data),title:'別の曲'});return saved;
 });
 // Storage transactions edit only the name, including full capacity and stale writers.
 const storage=await page.evaluate(async payload=>{
  const {SongStore}=await import('/saezuri/song-store.js'),store=new SongStore({database:'rename-contract',limit:1}),error=async action=>{try{await action();return null;}catch(e){return e.code;}};
  const first=await store.save('one',payload),changed=await store.rename('one','  新しい名前  ',first.revision),same=await store.rename('one','新しい名前',changed.revision);
  const blank=await error(()=>store.rename('one','　 ',changed.revision)),stale=await error(()=>store.rename('one','古い名前',first.revision));
  const writes=await Promise.allSettled([store.rename('one','先の変更',changed.revision),store.rename('one','後の変更',changed.revision)]),current=await store.get('one');
  await store.remove('one',current.revision);const deleted=await error(()=>store.rename('one','復活',current.revision));
  await store.save('future',payload);await store.read(songs=>new Promise((resolve,reject)=>{const req=songs.get('future');req.onsuccess=()=>{const r=req.result;r.schemaVersion=2;const put=songs.put(r);put.onsuccess=()=>resolve();put.onerror=()=>reject(put.error);};req.onerror=()=>reject(req.error);}),'readwrite');
  const schema=await error(()=>store.rename('future','上書き',1));return {first,changed,same,blank,stale,writes:writes.map(r=>r.status),deleted,schema};
 },original.data);
 assert.equal(storage.changed.title,'新しい名前');assert.equal(storage.changed.data.title,'新しい名前');assert.equal(storage.changed.revision,storage.first.revision+1);assert.equal(storage.changed.createdAt,storage.first.createdAt);
 const withoutTitle=record=>{const clone=structuredClone(record.data);delete clone.title;return clone;};assert.deepEqual(withoutTitle(storage.changed),withoutTitle(storage.first));assert.deepEqual(storage.same,storage.changed);
 assert.equal(storage.blank,'SONG_TITLE_EMPTY');assert.equal(storage.stale,'SONG_CONFLICT');assert.deepEqual(storage.writes,['fulfilled','rejected']);assert.equal(storage.deleted,'SONG_DELETED');assert.equal(storage.schema,'SONG_SCHEMA');
 await click('home-songs');await page.locator('[data-song-open="rename-active"]').click();await click('song-continue');const before=await report();await library();
 const storedBefore=await get('rename-active');await rename('rename-active',' 春のうた ');const active=await get('rename-active');assert.equal(active.title,'春のうた');
 assert.deepEqual(withoutTitle(active),withoutTitle(storedBefore));assert.equal(await page.locator('#song-title').inputValue(),'春のうた');
 // Empty and canceled edits leave the saved record and pending work untouched.
 await openSongActions(page,'rename-active');await page.locator('[data-song-rename="rename-active"]').click();await page.locator('#song-rename-title').fill(' ');await click('song-rename-confirm');assert.match(await page.locator('#song-rename-status').textContent(),/名前を/);assert.deepEqual(await get('rename-active'),active);
 await page.locator('#song-rename-title').fill('取り消す名前');await click('song-rename-cancel');assert.deepEqual(await get('rename-active'),active);
 // Renaming another song must not switch the current workspace or change its title.
 await rename('rename-other','別の曲の名前');assert.equal(await page.locator('#song-title').inputValue(),'春のうた');const after=await report();assert.deepEqual(after.captureCandidate,before.captureCandidate);assert.deepEqual(after.captureEditing.inputCandidate,before.captureEditing.inputCandidate);
 await openSongActions(page,'rename-other');const otherRow=page.locator('.song-row').filter({has:page.locator('[data-song-open="rename-other"]')});await otherRow.getByRole('button',{name:'コピー',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-song-open]').length===3);
 const copies=await page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return new SongStore().list();});assert.ok(copies.some(r=>r.title==='別の曲の名前 のコピー'));
 // An external update wins; the dialog keeps the user's attempted name for review.
 await openSongActions(page,'rename-other');await page.locator('[data-song-rename="rename-other"]').click();await page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js'),store=new SongStore(),r=await store.get('rename-other');await store.rename(r.id,'ほかの画面の名前',r.revision);});
 await page.locator('#song-rename-title').fill('競合した名前');await click('song-rename-confirm');await page.waitForFunction(()=>document.querySelector('#song-rename-status').textContent.includes('ほかの画面'));
 assert.equal((await get('rename-other')).title,'ほかの画面の名前');assert.equal(await page.locator('#song-rename-title').inputValue(),'競合した名前');await click('song-rename-close');
 // A storage error keeps both the old record and typed name, then allows retry.
 await openSongActions(page,'rename-active');await page.locator('[data-song-rename="rename-active"]').click();await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(r=>/\/saezuri\/song-store\.js\?/.test(r.name)).name,{SongStore}=await import(url);window.renameStore=SongStore;window.originalRename=SongStore.prototype.rename;SongStore.prototype.rename=async()=>{throw new DOMException('full','QuotaExceededError');};});
 await page.locator('#song-rename-title').fill('もうひとつの名前');await click('song-rename-confirm');await page.waitForFunction(()=>document.querySelector('#song-rename-status').textContent.includes('まだ'));
 assert.equal((await get('rename-active')).title,'春のうた');assert.equal(await page.locator('#song-rename-title').inputValue(),'もうひとつの名前');await page.evaluate(()=>renameStore.prototype.rename=originalRename);await click('song-rename-confirm');await page.locator('#song-rename').waitFor({state:'hidden'});
 await click('song-library-close');await click('home-resume');await click('capture-edit-confirm');await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');
 const edited=await get('rename-active');assert.equal(edited.title,'もうひとつの名前');assert.equal(edited.data.checkpoint.confirmed.pattern.notes.length,2,'editing after active rename uses its new storage revision');assert.equal(edited.data.settings.tempo,110);assert.deepEqual(edited.data.sequence,storedBefore.data.sequence);assert.deepEqual(edited.data.sequenceDraft,storedBefore.data.sequenceDraft);
 await library();for(const [width,height] of [[320,568],[390,740]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>document.querySelector('#song-library .sheet-body').scrollTop=0);
  const layout=await page.locator('.song-row').first().evaluate(row=>{const boxes=[...row.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect());return {targets:boxes.every(b=>b.width>=44&&b.height>=44),gaps:boxes.every((a,i)=>boxes.slice(i+1).every(b=>a.right+7.9<=b.left||b.right+7.9<=a.left||a.bottom+7.9<=b.top||b.bottom+7.9<=a.top)),width:document.documentElement.scrollWidth<=innerWidth};});assert.ok(layout.targets&&layout.gaps&&layout.width,JSON.stringify({width,layout}));
  await openSongActions(page,'rename-active');await page.locator('[data-song-rename="rename-active"]').click();const centered=await page.locator('#song-rename').evaluate(d=>{const r=d.getBoundingClientRect(),h=d.querySelector('h2').getBoundingClientRect(),c=d.querySelector('#song-rename-close').getBoundingClientRect();return {center:Math.abs((h.left+h.right-r.left-r.right)/2),right:c.left>r.left+r.width/2,overflow:d.scrollWidth>d.clientWidth};});assert.ok(centered.center<2&&centered.right&&!centered.overflow,JSON.stringify(centered));await click('song-rename-close');
 }
 await page.setViewportSize({width:390,height:740});fs.mkdirSync('.local-tools/chord-only-phrase-20261030',{recursive:true});await page.screenshot({path:'.local-tools/chord-only-phrase-20261030/rename-'+(layoutOnly?'webkit':'chrome')+'.png'});
 await openSongActions(page,'rename-active');await page.locator('[data-song-rename="rename-active"]').click();await page.screenshot({path:'.local-tools/chord-only-phrase-20261030/rename-dialog-'+(layoutOnly?'webkit':'chrome')+'.png'});await click('song-rename-close');
 // A conflict in the active song must not block renaming a different saved song.
 const external=await page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js'),store=new SongStore(),r=await store.get('rename-active');return store.save(r.id,r.data,r.revision);});
 await click('song-library-close');await click('home-resume');await click('screen-settings');await page.locator('#tempo').fill('150');await page.locator('#tempo').dispatchEvent('change');await click('settings-close');
 await page.waitForFunction(()=>document.querySelector('#song-status').textContent.includes('ほかの画面'));await library();await rename('rename-other','保存失敗中も改名');
 assert.equal((await get('rename-other')).title,'保存失敗中も改名');assert.deepEqual(await get('rename-active'),external);assert.equal(await page.locator('#tempo').inputValue(),'150');assert.equal(await page.locator('#song-title').inputValue(),'もうひとつの名前');
 await page.reload();await click('home-songs');assert.match(await page.locator('[data-song-open="rename-active"]').getAttribute('aria-label'),/もうひとつの名前/);assert.deepEqual(errors,[]);
 console.log('PASS '+(layoutOnly?'WebKit':'Chrome')+' rename: title-only transaction, full capacity, stale/delete/schema protection, pending draft/sequence preserved, active/other rename, cancel/error/retry, next edit, copy/reload and mobile spacing');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
