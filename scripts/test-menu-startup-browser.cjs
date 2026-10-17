const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=(process.env.MENU_BASE||'http://127.0.0.1:8026/').replace(/\/?$/,'/');
const routes=['doubutsu/','kioku/','kioku/?mode=sequence','irodori/','jintori/','delivery/','story/','probe/saezuri/'];
const folder='.local-tools/menu-startup-20261018';
(async()=>{
 fs.mkdirSync(folder,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  if(process.env.STARTUP_CHECK!=='help')for(const route of routes){
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];let release;
   const gate=new Promise(resolve=>release=resolve);page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',async r=>{if(r.request().resourceType()==='script'&&!r.request().url().includes('/app-startup.js'))await gate;await r.continue();});
   await page.goto(base+route,{waitUntil:'commit'});await page.waitForFunction(()=>document.body&&document.querySelector('main,#title,#app')&&[...document.querySelectorAll('link[rel=stylesheet]')].every(n=>!!n.sheet));
   assert.equal(await page.locator('#app-startup').count(),1,'one branded startup screen: '+route);
   assert.equal(await page.locator('#app-startup').isVisible(),true);
   const state=await page.evaluate(()=>({pending:document.documentElement.classList.contains('app-starting'),mainVisible:getComputedStyle(document.querySelector('main,#title')).visibility,text:document.body.innerText}));
   assert.equal(state.pending,true);assert.equal(state.mainVisible,'hidden');assert.ok(!state.text.includes('技術試作'));assert.ok(state.text.includes('じゅんび中'));
   if(route==='probe/saezuri/')await page.screenshot({path:folder+'/preparing.png'});
   release();await page.waitForFunction(()=>document.documentElement.dataset.appStartup==='ready');assert.equal(await page.locator('#app-startup').isVisible(),false);assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('main,#title')).visibility),'visible');
   const helps=await page.locator('.menu-help').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {width:r.width,height:r.height,color:s.color,font:s.fontSize};}));
   assert.equal(helps.length,1,route);assert.deepEqual(helps[0],{width:50,height:50,color:'rgb(138, 90, 60)',font:'24px'});assert.deepEqual(errors,[]);console.log('PASS delayed application scripts:',route);await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();await page.goto(base+'probe/saezuri/');await page.locator('#home-create').waitFor();
  assert.notEqual(await page.evaluate(()=>document.activeElement.id),'melody-help','help is not selected on arrival');
  await page.locator('#home-create').click();await page.locator('#melody-choose [data-screen-back]').click();assert.notEqual(await page.evaluate(()=>document.activeElement.id),'melody-help','returning home focuses the heading');
  await page.keyboard.press('Shift+Tab');await page.locator('#melody-help').focus();assert.equal(await page.locator('#melody-help').evaluate(n=>getComputedStyle(n).outlineColor),'rgb(138, 90, 60)','keyboard focus uses the suite color');
  await page.locator('#melody-help').click();await page.locator('.menu-help-dismiss').click();await page.locator('dialog[open]').waitFor({state:'detached'});
  for(const width of [320,390,844,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.setViewportSize({width:390,height:844});await page.locator('#home-create').click();await page.locator('#melody-choose [data-screen-back]').click();await page.screenshot({path:folder+'/home.png'});await context.close();
  if(process.env.STARTUP_CHECK!=='help'){
   const failure=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p=await failure.newPage();let abort=true;await failure.route('**/probe/saezuri/app.js*',r=>abort?r.abort():r.continue());
   await p.goto(base+'probe/saezuri/');await p.waitForFunction(()=>document.documentElement.classList.contains('app-startup-failed'));assert.equal(await p.locator('#app-startup').isVisible(),true);assert.equal(await p.locator('#app-startup .startup-error').isVisible(),true);
   abort=false;await p.locator('#app-startup [data-startup-retry]').click();await p.waitForFunction(()=>document.documentElement.dataset.appStartup==='ready');await p.locator('#home-create').waitFor();await failure.close();
   const slow=await browser.newContext({serviceWorkers:'block'}),sp=await slow.newPage();let resume;const pending=new Promise(resolve=>resume=resolve);
   await slow.route('**/probe/saezuri/app.js*',async r=>{await pending;await r.continue();});await sp.goto(base+'probe/saezuri/',{waitUntil:'commit'});
   await sp.waitForFunction(()=>document.documentElement.classList.contains('app-startup-failed'),{},{timeout:20000});assert.equal(await sp.locator('#app-startup [data-startup-retry]').isVisible(),true);
   resume();await sp.waitForFunction(()=>document.documentElement.dataset.appStartup==='ready');assert.equal(await sp.evaluate(()=>document.documentElement.classList.contains('app-startup-failed')),false);await slow.close();
   const nojs=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'}),np=await nojs.newPage();await np.goto(base+'probe/saezuri/');assert.equal(await np.locator('#app-startup noscript').isVisible(),true);assert.equal(await np.locator('#app-startup a[href="../../"]').isVisible(),true);await nojs.close();
   for(const view of ['editor','full']){const c=await browser.newContext({serviceWorkers:'block'}),p=await c.newPage();await p.goto(base+'probe/saezuri/?view='+view);await p.waitForFunction(()=>document.documentElement.dataset.appStartup==='ready');assert.equal(await p.locator('#app-startup').isVisible(),false);await c.close();}
  }
  console.log('PASS suite startup, Saezuri help/keyboard focus, four widths, failed-load retry, slow-load recovery, no-JS fallback and legacy views');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
