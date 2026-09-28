const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8014';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/probe/saezuri/');await page.locator('#home-create').click();await page.locator('#new-tutorial').click();
 for(const [width,height] of [[320,568],[360,800],[390,844],[412,915],[844,390],[1280,800]]){
  await page.setViewportSize({width,height});
  const layout=await page.locator('#composer-keys').evaluate(n=>[...n.children].map(b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,overflow:b.scrollWidth>b.clientWidth,outline:parseFloat(s.outlineWidth),offset:parseFloat(s.outlineOffset)};}));
  assert.ok(layout[1].x-layout[0].right>=3.9,`card gap at ${width}`);
  assert.ok(layout.every(r=>r.width>=37&&r.height>=48&&!r.overflow),`readable touch targets ${width}`);
  assert.ok(layout[0].outline+layout[0].offset<=0,`guide stays inside card ${width}`);
  assert.equal(layout.length,7);assert.ok(layout.every(r=>Math.abs(r.y-layout[0].y)<1),`single row ${width}`);
  assert.ok(await page.locator('#learning-action').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=20));
  assert.ok(await page.locator('#learning-message').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=16));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`viewport ${width}`);
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local-tools/saezuri-v25-tutorial.png',fullPage:true});
 assert.equal(await page.locator('.phrase-register').isVisible(),false,'hide registration only while tutorial is in progress');
 await page.locator('[data-pitch="0"]').click();assert.match(await page.locator('#learning-action').textContent(),/オッケー/);await page.locator('#capture-edit-confirm').click();assert.match(await page.locator('#learning-action').textContent(),/ミ/);
 await page.locator('#learning-close').click();assert.equal(await page.locator('.phrase-register').isVisible(),true);
 await page.evaluate(()=>{for(const n of document.querySelectorAll('#composer-keys button'))n.style.fontSize='36px';});
 assert.ok(await page.locator('#composer-keys').evaluate(n=>[...n.children].every(b=>b.scrollWidth<=b.clientWidth)),'enlarged labels stay inside their cards');
 assert.deepEqual(errors,[]);console.log('PASS readability: 6 widths, card spacing/targets, guide font sizes, step changes and registration restore');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
