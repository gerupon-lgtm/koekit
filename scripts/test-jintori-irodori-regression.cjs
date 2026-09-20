const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('https://**/*',r=>r.abort());
 const p=await context.newPage();await p.goto('http://127.0.0.1:8000/irodori/');
 await p.locator('[data-go="free"]').click();await p.locator('[data-size="3"]').click();
 await p.getByRole('button',{name:'つくりはじめる',exact:true}).click();
 assert.equal(await p.locator('[data-screen="mode"]').isVisible(),false,'menu hides during drawing');
 await p.getByRole('button',{name:'あか',exact:true}).click();await p.locator('[data-row="0"][data-col="0"]').click();
 assert.equal(await p.locator('#btn-confirm').isEnabled(),true);
 assert.equal(await p.locator('[data-row="0"][data-col="0"]').evaluate(e=>e.classList.contains('ir-preview')),true);
 await p.locator('#btn-confirm').click();assert.equal(await p.locator('[data-row="0"][data-col="0"]').evaluate(e=>e.style.background),'rgb(226, 65, 58)');
 await p.locator('#btn-undo').click();assert.equal(await p.locator('[data-row="0"][data-col="0"]').evaluate(e=>e.classList.contains('ir-empty')),true);
 await p.getByRole('button',{name:'やめる',exact:true}).click();
 assert.equal(await p.locator('[data-screen="mode"]').isVisible(),true,'menu returns after exit');
 assert.equal(await p.locator('[data-screen="make"]').isVisible(),false,'drawing screen hides after exit');
 await context.close();console.log('irodori existing palette, preview, confirm and undo: passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
