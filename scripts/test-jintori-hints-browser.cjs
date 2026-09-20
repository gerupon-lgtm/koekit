const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome'});try{
for(const difficulty of ['easy','normal','hard','human']){
const context=await browser.newContext({viewport:{width:320,height:568},serviceWorkers:'block'});
await context.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:'export function createSpeechInput(){return {on(){},off(){},start(){},stop(){},dispose(){}}}'}));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8000/jintori/');
await page.evaluate(async difficulty=>{const {createRun,startRun,rollRun}=await import('/jintori/run.js');const {SlotStore}=await import('/jintori/storage.js');const options={size:6,opponent:difficulty==='human'?'human':'cpu',difficultyId:difficulty};const store=new SlotStore();const session=await store.begin(options);store.save(rollRun(startRun(createRun(options)),1),session.lease);await store.close();},difficulty);
if(difficulty==='human')await page.locator('[data-option="opponent"][data-value="human"]').click();else await page.locator(`[data-option="difficultyId"][data-value="${difficulty}"]`).click();
await page.locator('[data-option="size"][data-value="6"]').click();await page.locator('#resume').click();await page.locator('#board .legal').first().click();
const toggle=page.locator('#hint-toggle');assert.equal(await toggle.getAttribute('aria-pressed'),String(difficulty==='easy'));
const snapshot=()=>page.locator('#board').innerHTML();const before=await snapshot();
const countShown=async()=>/↻\d+マスかえる/.test(await page.locator('#selection-status').innerText());assert.equal(await countShown(),difficulty==='easy');
await toggle.click();assert.equal(await countShown(),difficulty!=='easy');assert.equal(await snapshot(),before);assert.equal(await page.locator('#confirm-move').isEnabled(),true);
if(await toggle.getAttribute('aria-pressed')==='true')await toggle.click();
for(const item of ['enhanced','strongest']){await page.locator('#'+item).click();await page.locator('#board .legal').first().click();assert.equal(await countShown(),false);const preview=await snapshot();await toggle.click();assert.equal(await snapshot(),preview);assert.equal(await countShown(),true);await toggle.click();}
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#confirm-move').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),true);
await page.locator('#confirm-move').click();await toggle.click();assert.equal(await page.locator('#board').getAttribute('aria-busy'),'true');await toggle.click();await page.waitForFunction(()=>!document.querySelector('#board').hasAttribute('aria-busy'));assert.equal(await toggle.getAttribute('aria-pressed'),'false');
if(difficulty==='human'){
const result=await page.evaluate(async()=>{
const {createRun,startRun,rollRun}=await import('/jintori/run.js');const {analyzeMove}=await import('/jintori/rules.js');const {renderGame}=await import('/jintori/view.js');
const r=rollRun(startRun(createRun({opponent:'human',size:8})),1);r.match.cells.fill(0);r.match.cells.splice(0,8,0,2,1,2,2,1,0,0);[2,2,1,2,1].forEach((x,i)=>r.match.cells[(i+1)*8]=x);
const pending={item:'strongest',cell:0,directionId:null,analysis:analyzeMove(r.match,0,'strongest')};
renderGame(r,pending,false,false);const off=[...document.querySelectorAll('#direction-options button')].map(b=>b.textContent);const disabled=document.querySelector('#confirm-move').disabled;
renderGame(r,pending,false,true);const on=[...document.querySelectorAll('#direction-options button')].map(b=>b.textContent);
pending.directionId='E';renderGame(r,pending,false,false);return {off,on,disabled,confirmed:!document.querySelector('#confirm-move').disabled,status:document.querySelector('#selection-status').textContent};
});assert.equal(result.off.length,2);assert.ok(result.off.every(t=>!t.includes('マス')));assert.ok(result.on.every(t=>t.includes('3マス')));assert.equal(result.disabled,true);assert.equal(result.confirmed,true);assert.ok(!result.status.includes('マスかえる'));
}
assert.deepEqual(errors,[]);console.log('PASS hints '+difficulty+': default, live toggle, previews, special stones, next turn, small screen');await context.close();
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
