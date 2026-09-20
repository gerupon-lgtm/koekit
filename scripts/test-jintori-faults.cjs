const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const ctx=await browser.newContext({serviceWorkers:'block'});
  await ctx.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:`export function createSpeechInput(){const h={};return {on(k,f){h[k]=f},off(k){delete h[k]},start(){h.error?.('denied')},stop(){}}}`}));
  const p=await ctx.newPage();await p.goto('http://127.0.0.1:8000/jintori/');
  await p.getByRole('button',{name:'ふたり',exact:true}).click();
  await p.getByRole('button',{name:'はじめから',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#mic-state').classList.contains('denied'));
  assert.match(await p.locator('#mic-state').getAttribute('aria-label'),/タッチ/);
  await p.getByRole('button',{name:'スタート',exact:true}).click();
  await p.getByRole('button',{name:'ストップ',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('[data-cell]')&&!document.querySelector('#board').hasAttribute('aria-busy'));
  await p.locator('[data-cell].legal').first().focus();await p.keyboard.press('Enter');
  assert.equal(await p.evaluate(()=>document.activeElement.hasAttribute('data-cell')),true);
  await p.locator('#confirm-move').click();await p.waitForTimeout(750);
  // A storage quota failure must keep the old save, expose retry, then really delete it on retry.
  await p.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Quota','QuotaExceededError')}});
  await p.getByRole('button',{name:'ゲームをおわる',exact:true}).click();await p.getByRole('button',{name:'おわる',exact:true}).click();
  await p.getByText('まだ おわれません',{exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('koekit.jintori')&&JSON.parse(localStorage.getItem(k)).active)),true);
  await p.evaluate(()=>{Storage.prototype.setItem=window.originalSet});
  await p.getByRole('button',{name:'もういちど おわる',exact:true}).click();
  await p.locator('#title').waitFor({state:'visible'});
  assert.equal(await p.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('koekit.jintori')&&JSON.parse(localStorage.getItem(k)).active)),false);
  // Restore a real, reachable one-game draw and choose extension through the actual UI.
  await p.evaluate(async()=>{
   const {createRun,startRun,rollRun,playMove}=await import('/jintori/run.js');
   const {listLegalMoves}=await import('/jintori/rules.js');const {SlotStore}=await import('/jintori/storage.js');
   let found;
   for(let seed=1;seed<=100&&!found;seed++){
    let value=seed,run=rollRun(startRun(createRun({opponent:'human'})),1);
    while(run.phase==='playing'){value=(value*1664525+1013904223)>>>0;const moves=listLegalMoves(run.match);run=playMove(run,moves[value%moves.length]);}
    if(run.series.outcome===0)found=run;
   }
   if(!found)throw Error('draw not found');const store=new SlotStore();const session=await store.begin(found.mode);store.save(found,session.lease);await store.close();
  });
  await p.reload();await p.getByRole('button',{name:'ふたり',exact:true}).click();await p.getByRole('button',{name:'つづきから',exact:true}).click();
  await p.locator('#extend').click();
  const game=await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('koekit.jintori')).map(k=>JSON.parse(localStorage.getItem(k)).active).find(Boolean));
  assert.equal(game.series.extensionActive,true);assert.equal(game.match.firstSide,2);assert.equal(game.series.completedMatches,1);
  await p.getByRole('button',{name:'ゲームをおわる',exact:true}).click();
  await p.getByRole('button',{name:'おわる',exact:true}).evaluate(button=>{button.click();button.click()});
  await p.locator('#title').waitFor({state:'visible'});assert.equal(await p.locator('#dialog').isVisible(),false);
  await ctx.close();console.log('jintori fault paths: mic denial, keyboard, quota retry, draw extension, double exit passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
