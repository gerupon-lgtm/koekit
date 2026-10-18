const {chromium}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage({viewport:{width:390,height:640},serviceWorkers:'block'});
 await page.goto(base+'/probe/saezuri/');await page.locator('#home-create').click();await page.locator('#new-tutorial').click();
 await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(r=>/\/audio\.js\?/.test(r.name)).name;const {ProbeTransport}=await import(url);window.transportStops=[];const original=ProbeTransport.prototype.stop;ProbeTransport.prototype.stop=function(notify=true,reason='STOPPED'){if(this.active&&notify)transportStops.push(reason);return original.call(this,notify,reason);};});
 await page.locator('#learning-model').click();await page.waitForFunction(()=>document.querySelector('#learning-preview').dataset.phase==='music');
 await page.evaluate(()=>{const until=performance.now()+700;while(performance.now()<until){}});
 await page.waitForTimeout(120);
 const result=await page.evaluate(()=>({phase:document.querySelector('#learning-preview').dataset.phase,status:document.querySelector('#status').dataset.state,stops:window.transportStops}));console.log(JSON.stringify(result));assert.equal(result.phase,'music','a 700ms busy screen must not cut off a four-bar audition');assert.ok(!result.stops.includes('SCHEDULER_LATE'));await page.locator('#learning-preview-close').click();
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
