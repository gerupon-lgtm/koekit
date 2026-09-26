const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.DELIVERY_BASE||'http://127.0.0.1:8000';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await ctx.addInitScript(()=>localStorage.setItem('koekit.microphone.enabled','false'));
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/delivery/');
 // A second tab awards level 2 while first is playing level 4; neither record may disappear.
 await page.evaluate(async()=>{const {DeliveryStorage}=await import('/delivery/storage.js');const {createSession}=await import('/delivery/run.js');const {BASIC_STAGE}=await import('/delivery/tutorial.js');const s=new DeliveryStorage();s.save('session',createSession(BASIC_STAGE,{level:4,stageIndex:2}),0)});
 await page.reload();await page.locator('#resume').click();
 const peer=await ctx.newPage();await peer.goto(base+'/delivery/');
 await peer.evaluate(async()=>{const {DeliveryStorage}=await import('/delivery/storage.js');const s=new DeliveryStorage();s.save('progress',{easy:{clearedLevelIds:[2]},hard:{clearedLevelIds:[]},tutorialCompletion:{basic:true,additional:{easy:false,hard:false}}},0)});
 async function add(dir,count){await page.locator(`[data-direction="${dir}"]`).click();await page.locator('#step-count').selectOption(String(count));await page.locator('#add-command').click()}
 await add('down',1);await add('right',2);await add('down',1);await page.locator('#execute').click();await page.locator('#result:not([hidden])').waitFor();
 const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('koekit.delivery.v1.progress')).value);assert.deepEqual(progress.easy.clearedLevelIds,[2,4]);
 await page.getByRole('button',{name:'おわり',exact:true}).click();
 // Both tabs open one session; a step edit in first must stop the older tab from overwrite.
 await page.getByRole('button',{name:'はじめから',exact:true}).click();await page.locator('#game:not([hidden])').waitFor();
 await peer.reload();await peer.locator('#resume').click();
 await page.getByRole('button',{name:'最新を よみこむ',exact:true}).waitFor();
 const current=await peer.evaluate(()=>localStorage.getItem('koekit.delivery.v1.session'));
 await page.locator('#add-command').click();assert.equal(await page.evaluate(()=>localStorage.getItem('koekit.delivery.v1.session')),current);
 await page.getByRole('button',{name:'最新を よみこむ',exact:true}).click();await page.locator('#title:not([hidden])').waitFor();
 await peer.close();
 // Unknown schema remains untouched and usable navigation still works.
 await page.evaluate(()=>localStorage.setItem('koekit.delivery.v1.session','{"schemaVersion":77,"opaque":"keep"}'));await page.reload();
 assert.equal(await page.locator('#resume').isVisible(),false);assert.match(await page.locator('#save-status').innerText(),/残しています/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('koekit.delivery.v1.session')),'{"schemaVersion":77,"opaque":"keep"}');
 // No storage available: an honest notice and touch-only game still works.
 const denied=await browser.newContext({viewport:{width:320,height:568},serviceWorkers:'block'});
 await denied.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('koekit.delivery.'))throw new DOMException('Quota','QuotaExceededError');return original.call(this,k,v)};localStorage.setItem('koekit.microphone.enabled','false')});
 const p=await denied.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/delivery/');await p.getByRole('button',{name:'はじめから',exact:true}).click();
 assert.match(await p.locator('#save-status').innerText(),/保存を更新できません/);assert.equal(await p.locator('#board .robot').isVisible(),true);
 await p.locator('[data-direction="down"]').click();await p.locator('#add-command').click();await p.locator('#execute').click();await p.locator('#result:not([hidden])').waitFor();await p.locator('#retry').click();
 assert.equal(await p.locator('#execute').isVisible(),true);
 await denied.close();assert.deepEqual(errors,[]);console.log('delivery resilience: progress merge, competing session edits, unknown schema preservation and storage denied touch passed');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
