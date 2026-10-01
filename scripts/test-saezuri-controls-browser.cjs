const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.SAEZURI_BASE||'http://127.0.0.1:8017')+'/probe/saezuri/');await page.locator('#home-create').click();await page.locator('#new-manual').click();await revealCreationControl(page,'[data-pitch="0"]');await page.locator('[data-pitch="0"]').click();await page.locator('#capture-edit-confirm').click();await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');await page.locator('#discard').click();await page.locator('#melody-home').waitFor({state:'visible'});
 await page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');const s=new SongStore(),[record]=await s.list();for(let i=0;i<5;i++)await s.save('layout-'+i,{...record.data,title:'ながいきょくの名前でも ボタンを重ねない '+i});});
 const gaps=async root=>{
  const result=await page.locator(root).evaluate(node=>{
   const boxes=[...node.querySelectorAll('button')].filter(n=>{if(n.closest('#piano-keys')||!n.checkVisibility())return false;const frame=n.closest('.sheet-body');if(!frame)return true;const b=n.getBoundingClientRect(),clip=frame.getBoundingClientRect();return b.top>=clip.top&&b.bottom<=clip.bottom;}).map(n=>{const b=n.getBoundingClientRect();return {id:n.id||n.textContent.trim(),x:b.x,y:b.y,r:b.right,b:b.bottom,w:b.width,h:b.height};});
   const bad=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j],dx=Math.max(0,a.x-b.r,b.x-a.r),dy=Math.max(0,a.y-b.b,b.y-a.b);if(Math.hypot(dx,dy)<7.9)bad.push([a.id,b.id,dx,dy]);}
   return {bad,overflow:document.documentElement.scrollWidth>innerWidth};
  });assert.deepEqual(result.bad,[],root+' keeps at least 8px between buttons');assert.equal(result.overflow,false,root+' fits the screen');
 };
 const sheet=async(id,closeId,stopId)=>{
  const geometry=await page.locator('#'+id).evaluate((node,ids)=>{const d=node.getBoundingClientRect(),c=node.querySelector('#'+ids.close).getBoundingClientRect(),s=node.querySelector('#'+ids.stop).getBoundingClientRect();return {right:d.right-c.right,top:c.top-d.top,stopCenter:(s.left+s.right)/2,screenCenter:innerWidth/2,visible:c.top>=0&&c.bottom<=innerHeight&&s.top>=0&&s.bottom<=innerHeight};},{close:closeId,stop:stopId});
  assert.ok(geometry.top>=0&&geometry.top<25&&geometry.right>=0&&geometry.right<25,id+' close stays at upper right');assert.ok(Math.abs(geometry.stopCenter-geometry.screenCenter)<1,id+' stop stays horizontally centered');assert.ok(geometry.visible,id+' close and stop remain visible');await gaps('#'+id);return geometry;
 };
 for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
  await page.setViewportSize(size);await page.locator('#home-songs').click();await page.locator('.song-row').first().waitFor();
  await sheet('song-library','song-library-close','song-list-stop');
  await page.locator('#song-library .sheet-body').evaluate(n=>n.scrollTop=n.scrollHeight);await sheet('song-library','song-library-close','song-list-stop');
  if(size.width===390)await page.screenshot({path:'.local-tools/saezuri-song-controls.png'});
  await page.locator('.song-row').last().locator('button').filter({hasText:'▶ 聴く'}).click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');await page.locator('#song-list-stop').click();assert.equal(await page.locator('#status').getAttribute('data-state'),'idle');
  await page.locator('.song-row').last().locator('button').filter({hasText:'けす',exact:true}).click();await gaps('#song-delete');await page.locator('#song-delete [data-close]').click();
  await page.locator('#song-library-close').click();
  for(const id of ['song-resume','song-failure']){await page.locator('#'+id).evaluate(n=>n.showModal());await gaps('#'+id);await page.locator('#'+id+' [data-close]').click();}
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#home-create').click();await page.locator('#new-image').click();await page.locator('#phrase-bars').waitFor({state:'visible'});await page.locator('#capture-edit-confirm').click();
 const openers=[['melody-settings','settings-close','settings-stop',()=>page.locator('#screen-settings').click()],['backing-settings','backing-settings-close','backing-settings-stop',()=>page.locator('#image-settings-open').click()],['progression-suggestions','progression-close','progression-stop',()=>page.locator('#image-suggest').click()],['chord-sheet','chord-close','chord-stop',()=>page.locator('[data-chord-bar="0"]').click()],['sounds-sheet','sounds-close','sounds-stop',async()=>{await page.locator('#image-settings-open').click();await page.locator('#image-sounds').click();}]];
 for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
  await page.setViewportSize(size);
  for(const [id,close,stop,open] of openers){if(['backing-settings','progression-suggestions','sounds-sheet'].includes(id))await revealCreationControl(page,'#image-settings-open');await open();const before=await sheet(id,close,stop);await page.locator('#'+id+' .sheet-body').evaluate(n=>n.scrollTop=n.scrollHeight);const after=await sheet(id,close,stop);assert.ok(Math.abs(before.top-after.top)<1&&Math.abs(before.right-after.right)<1,'scroll preserves the close position');await page.locator('#'+close).click();if(id==='sounds-sheet')await page.locator('#backing-settings-close').click();}
  for(const mode of ['input','edit','backing']){await page.locator(`[data-mode="${mode}"]`).click();await gaps('#melody-create');}
  const stop=await page.locator('#stop').boundingBox();assert.ok(Math.abs(stop.x+stop.width/2-size.width/2)<1,'main stop is centered '+JSON.stringify({size,stop,footer:await page.locator('body>footer').evaluate(n=>({width:n.getBoundingClientRect().width,grid:getComputedStyle(n).gridTemplateColumns,box:getComputedStyle(n).boxSizing}))}));
 }
 await page.locator('[data-mode="backing"]').click();await page.locator('[data-chord-bar="0"]').click();await page.locator('#chord-preview').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');assert.equal(await page.locator('#chord-close').isEnabled(),true);await page.locator('#chord-close').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='idle',{},{timeout:1000});
 await page.locator('#image-suggest').click();await page.locator('.suggestion-row').first().locator('button').first().click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='idle',{},{timeout:1000});
 await page.locator('#discard').click();await page.locator('#melody-home').waitFor({state:'visible'});await page.locator('#home-create').click();await page.locator('#choose-example').click();await gaps('#melody-samples');await page.locator('#samples-back').click();await page.locator('[data-screen-back]').filter({visible:true}).first().click();await page.locator('#home-connect').click();await gaps('#melody-connect');
 assert.deepEqual(errors,[]);console.log('PASS controls: library and five audio sheets, fixed close/stop, 8px button spacing, scroll, playback close/Escape, all creation tabs/samples/sequence and four widths');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
