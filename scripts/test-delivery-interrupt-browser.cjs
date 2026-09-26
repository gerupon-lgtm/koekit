const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await ctx.addInitScript(()=>{try{localStorage.setItem('koekit.microphone.enabled','false')}catch{}});
 const p=await ctx.newPage();await p.goto('http://127.0.0.1:8000/delivery/');await p.locator('#new').click();await p.locator('[data-direction="up"]').click();await p.locator('#add-command').click();await p.locator('#execute').click();await p.locator('#result:not([hidden])').waitFor();
 assert.equal(await p.locator('#failure-location').isVisible(),true,'failure must show position');assert.match(await p.locator('#failure-location').innerText(),/1ばん.*うえ/);assert.equal(await p.locator('#failure-location .failed-cell').count(),1);
 await p.getByRole('button',{name:'おわり',exact:true}).click();
 await p.evaluate(async()=>{const {DeliveryStorage}=await import('/delivery/storage.js');const s=new DeliveryStorage();s.save('progress',{easy:{clearedLevelIds:[]},hard:{clearedLevelIds:[]},tutorialCompletion:{basic:true,additional:{easy:true,hard:true}}},s.load('progress').revision)});await p.reload();
 await ctx.route('**/delivery/search-worker.js',async r=>{await new Promise(res=>setTimeout(res,1000));await r.continue().catch(()=>{})});
 await p.locator('#new').click();await p.locator('#preparing:not([hidden])').waitFor();await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});
 assert.equal(await p.locator('#prepare-retry').isVisible(),true,'cancelled preparation has retry');await p.locator('#prepare-retry').click();await p.locator('#game:not([hidden])').waitFor();
 const result=await p.evaluate(async()=>{const {DeliverySpeech}=await import('/delivery/phase.js');const states=[];let disposed=0;const voice=new DeliverySpeech({onText:()=>{},onState:s=>states.push(s),factory:()=>({on(){},off(){},start(){return new Promise(()=>{})},stop(){},dispose(){disposed++}}),startupTimeoutMs:30});voice.open(['オッケー'],'editing','test');await new Promise(r=>setTimeout(r,60));voice.dispose();return {states,disposed}});
 assert.ok(result.states.includes('denied'));assert.ok(!result.states.includes('listening'));assert.ok(result.disposed>=1);
 console.log('delivery interruptions: failure location, cancelled generation retry and bounded speech initialization passed');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
