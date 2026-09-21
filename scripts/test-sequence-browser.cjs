const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(()=>{Math.random=()=>0;});
  await context.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:`
    export const METHODS={VOSK:'vosk'};
    export function createSpeechInput(){const h={}; window.say=s=>h.result(s,10);return {name:'vosk',on(k,f){h[k]=f},start(words){window.listening=words},stop(){window.listening=[]},dispose(){window.listening=[]}};}
  `}));
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message)); await page.clock.install();
  const advance=ms=>page.clock.runFor(ms);
  const say=async s=>{
    // Image preparation is asynchronous; speak only once the start interval opens.
    if(s==='スタート') await page.waitForFunction(()=>window.listening?.includes('スタート'));
    return page.evaluate(s=>window.say(s),s);
  };
  const go=async()=>{
    await page.goto('http://127.0.0.1:8000/kioku/?mode=sequence');
    await page.locator('[data-level="1"]').waitFor();
  };
  await go();
  assert.equal(await page.locator('#mode-sequence').getAttribute('aria-current'),'page');
  assert.equal(await page.locator('#speed-play').isDisabled(),true);
  assert.equal(await page.locator('[data-level]').count(),5);
  await page.locator('#start-play').click(); await say('オッケー');
  await say('スタート'); assert.equal(await page.locator('.card.focus').getAttribute('data-key'),'up');
  assert.deepEqual(await page.evaluate(()=>window.listening),[]);
  await advance(800); assert.equal(await page.locator('.card.focus').count(),0);
  await advance(400); assert.equal(await page.locator('.card.focus').count(),1);
  await advance(800); assert.equal(await page.locator('.card.focus').count(),0);
  assert.equal(await page.locator('#confirm-btn').isVisible(),false);
  await advance(400); assert.equal(await page.locator('#confirm-btn').isDisabled(),true);
  await say('オッケー'); assert.match(await page.locator('#sequence-status').innerText(),/0 \/ 2/);
  await say('うえ'); await say('うえ');
  assert.equal(await page.locator('[data-key="up"] .sequence-numbers').innerText(),'1・2');
  await say('みぎ'); assert.equal(await page.locator('.sequence-numbers').count(),1);
  await say('もどす'); assert.equal(await page.locator('#confirm-btn').isDisabled(),true);
  const animals=await page.locator('.card img').evaluateAll(es=>es.map(e=>e.src));
  await say('やりなおし'); assert.equal(await page.locator('.sequence-numbers').count(),0);
  assert.deepEqual(await page.locator('.card img').evaluateAll(es=>es.map(e=>e.src)),animals);
  await page.locator('[data-key="up"]').click(); await page.locator('[data-key="up"]').click();
  await page.locator('#undo-answer').click(); assert.equal(await page.locator('#confirm-btn').isDisabled(),true);
  await page.locator('[data-key="up"]').click(); await page.locator('#confirm-btn').click();
  await advance(600); await say('オッケー');
  await page.locator('#next-btn').click(); await advance(2400);
  await say('うえ'); await say('うえ'); await say('オッケー'); await advance(30000);
  assert.equal(await page.locator('#game').evaluate(e=>e.classList.contains('active')),true,'result must not auto-close');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('koekit.progress.v1.kioku-sequence') || '[]').includes('1')),true,'clear must survive exit before certificate');
  await say('つぎ'); await advance(1000);
  assert.match(await page.locator('#cert-award').innerText(),/2てマスター/);
  await page.evaluate(()=>document.getAnimations().forEach(a=>a.finish()));
  await page.screenshot({path:'.local-tools/sequence-award.png'});
  await say('つぎ'); await advance(800); await say('オッケー'); await advance(800);
  await say('スタート'); await advance(3600);
  await say('みぎ'); await say('みぎ'); await say('みぎ'); await say('オッケー');
  assert.equal(await page.locator('#sequence-status').innerText(),'ざんねん');
  await advance(900); assert.equal(await page.locator('#sequence-status').innerText(),'こたえ');
  assert.equal(await page.locator('[data-key="up"] .sequence-numbers').innerText(),'1・2・3');
  await say('みぎ'); await advance(30000); assert.equal(await page.locator('#sequence-status').innerText(),'こたえ');
  for(const [width,height] of [[320,568],[390,844],[768,1024]]) {
    await page.setViewportSize({width,height}); await page.screenshot({path:`.local-tools/sequence-answer-${width}.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.locator('#next-btn').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),true,'next visible without scroll');
  }
  await say('つぎ'); await say('スタート'); await advance(800);
  await page.locator('#to-title').click(); await advance(30000);
  assert.equal(await page.locator('#title').evaluate(e=>e.classList.contains('active')),true);
  await page.reload(); await page.locator('#highest-title strong').waitFor(); assert.match(await page.locator('#highest-title').innerText(),/2てマスター/);
  await page.locator('#mode-place').click(); await page.locator('#highest-title strong').waitFor(); assert.match(await page.locator('#highest-title').innerText(),/これから/);
  await go(); await page.evaluate(()=>localStorage.setItem('koekit.progress.v1.kioku-sequence',JSON.stringify(['1','2','3','4','5']))); await page.reload();
  assert.equal(await page.locator('#speed-play').isDisabled(),false);
  await page.locator('#speed-play').click();
  await page.locator('#intro-go').click(); await page.locator('#next-btn').click();
  await advance(600); assert.equal(await page.locator('.card.focus').count(),0);
  await advance(300); assert.equal(await page.locator('.card.focus').count(),1);
  await advance(900); assert.equal(await page.locator('#confirm-btn').isVisible(),true);
  await page.locator('#to-title').click();
  await page.evaluate(()=>localStorage.setItem('koekit.progress.v1.kioku-sequence',JSON.stringify(['1','2','3','4','5','s1','s2','s3','s4'])));
  await page.reload(); await page.locator('#speed-play').click();
  for(const [width,height] of [[320,568],[390,844]]) {
    await page.setViewportSize({width,height});
    assert.equal(await page.locator('#intro-go').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),true);
    await page.evaluate(()=>document.getAnimations().forEach(a=>a.finish()));
    assert.equal(await page.locator('.intro-card').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight}),true,'entire introduction visible');
    await page.screenshot({path:`.local-tools/sequence-intro-${width}.png`});
  }
  // Speed has one entry and must traverse all five stages, even with old clear records.
  for (let steps = 2; steps <= 6; steps++) {
    assert.match(await page.locator('#intro-heading').innerText(), new RegExp(String(steps)));
    await page.locator('#intro-go').click();
    for (let n = 0; n < 2; n++) {
      await page.locator('#next-btn').click(); await advance(steps * 900);
      for (let i = 0; i < steps; i++) await say('うえ');
      await say('オッケー'); await advance(600); await say('つぎ');
    }
    if (steps < 6) await page.locator('#cert-next').click();
  }
  assert.match(await page.locator('#cert-award').innerText(),/スピードマスター/);
  await page.evaluate(()=>document.getAnimations().forEach(a=>a.finish()));
  await page.screenshot({path:'.local-tools/sequence-rainbow.png'});
  await page.locator('#cert-next').click();
  assert.match(await page.locator('#highest-title').innerText(),/スピードマスター/);
  assert.deepEqual(errors,[]); await browser.close(); console.log('browser sequence: passed');
})().catch(e=>{console.error(e);process.exit(1)});
