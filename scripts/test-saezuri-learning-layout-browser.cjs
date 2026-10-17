const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=(process.env.SAEZURI_BASE||'http://127.0.0.1:8026').replace(/\/$/,'');
const folder='.local-tools/learning-layout-20261018';
(async()=>{
 fs.mkdirSync(folder,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const [width,height] of [[320,568],[360,640],[390,740],[412,840],[844,390],[1280,800]]){
   const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/probe/saezuri/');try{await page.locator('#home-create').click();}catch(error){console.error('startup diagnostic',JSON.stringify({width,height,errors,state:await page.evaluate(()=>({ready:document.readyState,root:document.documentElement.outerHTML.slice(0,700),text:document.body.innerText.slice(0,700)}))}));throw error;}await page.locator('#new-tutorial').click();
   await page.screenshot({path:folder+`/input-${width}x${height}.png`});
   const fits=async selectors=>{
    const result=await page.evaluate(selectors=>{const footer=document.querySelector('body > footer').getBoundingClientRect();return {scroll:scrollY,overflow:document.documentElement.scrollWidth>innerWidth,boxes:selectors.map(selector=>{const n=document.querySelector(selector),r=n.getBoundingClientRect();return {selector,top:r.top,bottom:r.bottom,width:r.width,height:r.height,footer:footer.top};})};},selectors);
    assert.equal(result.scroll,0,'no automatic page scrolling');assert.equal(result.overflow,false);
    for(const r of result.boxes){assert.ok(r.width>=44&&r.height>=44,JSON.stringify({viewport:[width,height],...r}));assert.ok(r.top>=0&&r.bottom<=r.footer-8,`visible above stop bar: ${JSON.stringify({viewport:[width,height],...r})}`);}
    assert.equal(await page.locator('#capture-score').evaluate(n=>{const s=n.querySelector('svg').getBoundingClientRect(),r=n.getBoundingClientRect();return s.top>=r.top&&s.bottom<=r.bottom;}),true,'the complete staff fits, without cropping notes');
   };
   await fits(['[data-pitch="0"]','[data-pitch="6"]','#capture-edit-confirm','#preview']);
   await page.locator('[data-pitch="0"]').click();await fits(['#capture-edit-confirm']);await page.locator('#capture-edit-confirm').click();await page.locator('[data-pitch="2"]').click();await page.locator('#capture-edit-confirm').click();
   await fits(['#capture-blocks button:first-child','#capture-pitch-up','#capture-edit-confirm','#preview']);
   await page.locator('#capture-blocks button').first().click();await page.locator('#capture-pitch-up').click();await page.locator('#capture-pitch-up').click();
   const notes=await page.locator('#capture-blocks').innerText();await page.locator('#learning-close').click();assert.equal(await page.locator('#learning-guide').isVisible(),false);assert.equal(await page.locator('#piano-keys').isVisible(),false,'closing guidance does not replace the lesson controls');assert.equal(await page.locator('#keep-phrase').isVisible(),false,'closing guidance does not introduce registration controls');
   await fits(['#capture-pitch-up','#capture-edit-confirm','#preview']);assert.equal(await page.locator('#capture-blocks').innerText(),notes);await page.locator('#learning-reopen').click();assert.equal(await page.locator('#learning-guide').isVisible(),true);assert.match(await page.locator('#learning-step').textContent(),/5/);
   await page.screenshot({path:folder+`/tutorial-${width}x${height}.png`});assert.deepEqual(errors,[]);console.log('PASS lesson controls fit and guidance reopen:',width,height);await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
