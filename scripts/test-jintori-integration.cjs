// Broad integration paths: real Worker, competing tabs, strongest tie and offline shell.
const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.JINTORI_BASE || 'http://127.0.0.1:8000';
const mockSpeech = `export function createSpeechInput(){const h={};window.say=s=>h.result?.(s);return {on(k,f){h[k]=f},off(k,f){if(h[k]===f)delete h[k]},start(){},stop(){},dispose(){}}}`;
(async () => {
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
  const context = await browser.newContext({viewport:{width:320,height:568},serviceWorkers:'block'});
  await context.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:mockSpeech}));
  const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/jintori/');
  assert.equal(await page.getByRole('button',{name:'まいかいほじゅう',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'もちこし',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'6 × 6',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'まいかいほじゅう',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'もちこし',exact:true}).click();
  await page.getByRole('button',{name:'4 × 4',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'もちこし',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'もちこし',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'6 × 6',exact:true}).click();
  await page.getByRole('button',{name:'まいかいほじゅう',exact:true}).click();
  await page.getByRole('button',{name:'4 × 4',exact:true}).click();
  await page.screenshot({path:'.local-tools/jintori-title-320.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true,'menu fits small screen');
  // Seed through production run/storage APIs; the app still resumes through its normal menu.
  const seed = async options => page.evaluate(async options=>{
   const {createRun,startRun,rollRun}=await import('/jintori/run.js');
   const {SlotStore}=await import('/jintori/storage.js');
   const store=new SlotStore();const session=await store.begin(options);
   const run=rollRun(startRun(createRun(options)),2);store.save(run,session.lease);await store.close();return run;
  },options);
  await seed({size:8,difficultyId:'hard'});
  await page.getByRole('button',{name:'むずかしい',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true,'menu with resume fits small screen');
  await page.getByRole('button',{name:'つづきから',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#board [data-cell]')&&!document.querySelector('#board').hasAttribute('aria-busy'));
  const active=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('koekit.jintori')).map(k=>JSON.parse(localStorage.getItem(k))).find(r=>r.active?.mode.difficultyId==='hard').active);
  assert.equal((await active()).match.moveNumber,1,'CPU Worker committed exactly one move');
  // A second tab must not begin a replacement game while this tab owns the slot.
  const other=await context.newPage();await other.goto(base+'/jintori/');
  await other.getByRole('button',{name:'むずかしい',exact:true}).click();
  await other.getByRole('button',{name:'はじめから',exact:true}).click();
  await other.getByText('ほかのがめんで あそんでいるよ',{exact:true}).waitFor();
  assert.equal((await active()).match.moveNumber,1);
  await other.close();
  await page.getByRole('button',{name:'ゲームをおわる',exact:true}).click();
  await page.getByRole('button',{name:'おわる',exact:true}).click();
  await page.locator('#title').waitFor({state:'visible'});
  // Find a reachable tied strongest preview using actual moves, not an impossible board.
  await page.evaluate(async()=>{
   const {createRun,startRun,rollRun,playMove}=await import('/jintori/run.js');
   const {listLegalMoves,analyzeMove}=await import('/jintori/rules.js');
   const {SlotStore}=await import('/jintori/storage.js');
   let run=rollRun(startRun(createRun({opponent:'human',size:6})),1), found;
   for(let i=0;i<32&&run.phase==='playing';i++){
    const moves=listLegalMoves(run.match);found=moves.find(cell=>analyzeMove(run.match,cell,'strongest').needsDirection);
    if(found!==undefined)break;
    run=playMove(run,moves[0]);
   }
   if(found===undefined)throw Error('tie fixture unavailable');
   window.tieCell=found;const store=new SlotStore();const s=await store.begin(run.mode);store.save(run,s.lease);await store.close();
  });
  await page.getByRole('button',{name:'ふたり',exact:true}).click();await page.getByRole('button',{name:'つづきから',exact:true}).click();
  await page.locator('#strongest').click();const cell=await page.evaluate(()=>window.tieCell);
  await page.locator(`[data-cell="${cell}"]`).click();
  assert.equal(await page.locator('#confirm-move').isDisabled(),true);
  await page.evaluate(()=>window.say('1 オッケー'));
  assert.equal(await page.locator('#confirm-move').isEnabled(),true);
  await page.screenshot({path:'.local-tools/jintori-direction-320.png'});
  assert.equal(await page.locator('#confirm-move').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),true,'tie preview fits');
  await page.evaluate(()=>window.say('オッケー'));
  await page.waitForTimeout(800);
  assert.equal(await page.locator('#strongest').getAttribute('aria-pressed'),'false');
  assert.deepEqual(errors,[]);await context.close();
  // Fresh service worker pre-caches all game modules and assets, then touch + CPU works offline.
  const offline=await browser.newContext({viewport:{width:390,height:844}});
  await offline.route('https://**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  const p=await offline.newPage();await p.goto(base+'/jintori/');
  await p.evaluate(()=>navigator.serviceWorker.ready);
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await offline.setOffline(true);await p.reload();
  await p.getByRole('button',{name:'はじめから',exact:true}).click();
  await p.getByRole('button',{name:'スタート',exact:true}).click();
  await p.getByRole('button',{name:'ストップ',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#board [data-cell]')&&!document.querySelector('#board').hasAttribute('aria-busy'));
  await p.locator('[data-cell].legal').first().click();await p.locator('#confirm-move').click();
  await p.waitForFunction(()=>!document.querySelector('#board').hasAttribute('aria-busy'));
  assert.equal(await p.locator('[data-cell]').count(),16);
  assert.equal(await p.evaluate(async()=>Boolean(await caches.match('/jintori/cpu-worker.js'))),true);
  await offline.close();
  console.log('jintori integration: CPU, exclusive tabs, numbered strongest preview and offline touch passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
