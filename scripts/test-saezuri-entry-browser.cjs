const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const base=(process.env.SAEZURI_BASE||'http://127.0.0.1:8026').replace(/\/$/,'');
const build=fs.readFileSync('sw.js','utf8').match(/const BUILD = '([^']+)'/)[1];
const oldMenu=execFileSync('git',['show','f7c4952:index.html'],{encoding:'utf8'});
const folder='.local-tools/saezuri-entry-20261018';
(async()=>{
 fs.mkdirSync(folder,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const errors=[],context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  for(const width of [320,390,844,1280]){
   await page.setViewportSize({width,height:844});await page.goto(base+'/');
   const card=page.getByRole('link',{name:/サエズリズム/});await card.waitFor();
   assert.equal(await card.getAttribute('href'),'./probe/saezuri/');
   assert.equal(await page.locator('.app-list li').count(),7,'reuse the existing card');
   assert.equal(await page.locator('.app-list a.app-card').count(),7);
   assert.equal(await page.locator('.coming-soon').count(),0);
   assert.deepEqual(await page.locator('.app-list a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),['./doubutsu/','./kioku/','./irodori/','./jintori/','./delivery/','./story/','./probe/saezuri/']);
   const layout=await card.evaluate(n=>{
    const a=n.getBoundingClientRect(),b=n.closest('li').previousElementSibling.getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth,height:a.height,previousHeight:b.height,gap:a.top-b.bottom,logo:n.querySelector('img').complete&&n.querySelector('img').naturalWidth>0};
   });assert.equal(layout.overflow,false);assert.ok(layout.gap>=7);assert.ok(Math.abs(layout.height-layout.previousHeight)<2);assert.equal(layout.logo,true);
   await card.scrollIntoViewIfNeeded();await card.focus();assert.equal(await card.evaluate(n=>document.activeElement===n),true);
   if(width===390)await page.screenshot({path:folder+'/menu-390.png',fullPage:true});
   await card.click();await page.locator('#home-create').waitFor();assert.equal(new URL(page.url()).pathname,new URL(base+'/probe/saezuri/').pathname);assert.equal(await page.title(),'サエズリズム');
   assert.equal(await page.locator('.home-credit').getAttribute('data-build'),build);
   const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name));
   for(const module of ['placement-workflow.js','ending-workflow.js','capture-retention.js'])assert.ok(resources.some(url=>url.includes('/'+module+'?v='+build)),module+' uses the current deployment');
   await page.locator('#melody-home .menu-home').click();await card.waitFor();
  }
  await context.close();
  // A separate browser profile: real root SW, a synthetic saved song, and the actual previous menu HTML.
  const swContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'}),swPage=await swContext.newPage();
  swPage.on('pageerror',e=>errors.push(e.message));await swPage.goto(base+'/');
  await swPage.evaluate(()=>navigator.serviceWorker.ready);await swPage.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await swPage.getByRole('link',{name:/サエズリズム/}).click();await swPage.locator('#home-create').waitFor();
  await swPage.evaluate(async()=>{
   const {SongStore}=await import('../../saezuri/song-store.js');
   const p={id:'A',familyId:'A',name:'A',bars:4,gridStep:2,source:'manual',key:{tonicPitchClass:0,mode:'major'},notes:[{id:'n',midi:60,startTick:0,durationTick:4}]};
   await new SongStore().save('entry-fixture',{title:'入口の保存確認',checkpoint:null,sequence:{patterns:[p],placements:[{id:'p1',patternId:'A'}],revision:0,undoStack:[],ending:{enabled:true,bars:1,mode:'custom',bassMode:'custom',customChord:{root:9,quality:'major',bass:5}}},sequenceDraft:null,settings:{tempo:120,instrument:'piano'}});
  });
  await swPage.locator('#melody-home .menu-home').click();
  await swPage.evaluate(async({build,oldMenu})=>{
   const name='koekit-app-'+build;if(!(await caches.keys()).includes(name))throw new Error('Current SW cache is missing');
   const cache=await caches.open(name);
   for(const target of ['./','./index.html'])await cache.put(new URL(target,location.href),new Response(oldMenu,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
  },{build,oldMenu});
  await swContext.setOffline(true);await swPage.reload();await swPage.locator('.coming-soon').waitFor();assert.equal(await swPage.locator('a[href="./probe/saezuri/"]').count(),0,'previous menu is reproduced offline');
  await swContext.setOffline(false);await swPage.reload();await swPage.getByRole('link',{name:/サエズリズム/}).click();await swPage.locator('#home-songs').click();
  await swPage.getByRole('button',{name:'入口の保存確認',exact:true}).click();await swPage.locator('#ending-open').waitFor();
  assert.match(await swPage.locator('#sequence-count').textContent(),/5小節/);await swPage.locator('#ending-open').click();assert.equal(await swPage.locator('#ending-length').inputValue(),'1');await swPage.locator('#ending-close').click();
  await swContext.setOffline(true);await swPage.goto(base+'/probe/saezuri/');await swPage.locator('#home-songs').click();await swPage.getByRole('button',{name:'入口の保存確認',exact:true}).click();assert.match(await swPage.locator('#sequence-count').textContent(),/5小節/);await swContext.setOffline(false);
  assert.deepEqual(errors,[]);await swContext.close();
  console.log('PASS top entry and return, unchanged seven-card layout at four widths, current three feature modules/build, real root SW, previous cached menu recovery, saved song/ending retained and visited app reopened offline');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
