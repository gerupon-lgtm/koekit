// 検証専用: npm install --prefix .local-tools --no-save playwright
const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/src/speech/index.js', r => r.fulfill({ contentType: 'application/javascript', body: `
    export const METHODS={VOSK:'vosk'};
    export function createSpeechInput(){ const handlers={}; const a={name:'vosk',on(k,f){handlers[k]=f},start(){},stop(){},dispose(){}}; window.say=(s)=>handlers.result(s,10); return a; }
  ` }));
  const page = await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  const advance = ms => page.clock.runFor(ms);
  for (const game of ['kioku','doubutsu']) {
    await page.goto('http://127.0.0.1:8000/'+game+'/');
    assert.equal(await page.locator('[data-level="extra"]').isDisabled(),true);
    assert.match(await page.locator('#highest-title').innerText(),/これから/);
    await page.locator('[data-level="1"]').click(); await page.locator('#intro-go').click();
    for(let n=0;n<(game==='kioku'?1:3);n++) {
      if(game==='kioku') {
        await page.locator('#next-btn').click();
        await advance(3100);
        await advance(750);
        const target = await page.locator('#target-prompt img').getAttribute('src');
        const key = await page.locator('.card').evaluateAll((els,src)=>els.find(e=>e.querySelector('img').getAttribute('src')===src).dataset.key,target);
        await advance(1250);
        await page.locator(`.card[data-key="${key}"]`).click();
      } else {
        await page.locator('#spin-btn').click(); await advance(1000); await page.locator('#spin-btn').click(); await advance(4000);
        const key = await page.locator('.card.focus').getAttribute('data-key');
        await page.locator(`.card[data-key="${key}"]`).click();
      }
      await page.locator('#confirm-btn').click(); await advance(3100);
    }
    assert.match(await page.locator('#cert-award').innerText(),/ひだりみぎマスター/);
    await advance(1200);
    await page.evaluate(()=>document.getAnimations().forEach(a=>a.finish()));
    await page.screenshot({path:`.local-tools/${game}-award.png`});
    await page.locator('#cert-quit').click(); await page.reload(); await page.locator('#highest-title strong').waitFor();
    assert.match(await page.locator('#highest-title').innerText(),/ひだりみぎマスター/);
    assert.equal(await page.locator('[data-level="1"]').evaluate(e=>e.classList.contains('completed')),true);
    const key='koekit.progress.v1.'+(game==='kioku'?'kioku-place':'doubutsu');
    await page.evaluate(key=>localStorage.setItem(key,JSON.stringify(['5'])),key); await page.reload(); await page.locator('#highest-title strong').waitFor();
    assert.equal(await page.locator('[data-level="extra"]').isDisabled(),true);
    await page.evaluate(key=>localStorage.setItem(key,JSON.stringify(['1','2','3','4','5','extra'])),key); await page.reload(); await page.locator('#highest-title strong').waitFor();
    assert.equal(await page.locator('[data-level="extra"]').isDisabled(),false);
    assert.match(await page.locator('#highest-title').innerText(),/スピードマスター/);
    for(const [width,height] of [[320,568],[390,844],[768,1024]]) {
      await page.setViewportSize({width,height});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:`.local-tools/${game}-${width}.png`});
    }
    await page.setViewportSize({width:390,height:844});
  }
  await page.goto('http://127.0.0.1:8000/kioku/');
  await page.locator('[data-level="1"]').click(); await page.locator('#intro-go').click();
  for(let n=0;n<5;n++) {
    await page.locator('#next-btn').click(); await advance(3900);
    const target=await page.locator('#target-prompt img').getAttribute('src');
    const key=await page.locator('.card').evaluateAll((els,src)=>els.find(e=>e.querySelector('img').getAttribute('src')!==src).dataset.key,target);
    await advance(1300); await page.locator(`.card[data-key="${key}"]`).click(); await page.locator('#confirm-btn').click(); await advance(2900);
  }
  assert.equal(await page.locator('#cert').getAttribute('data-kind'),'gameover');
  await page.locator('#cert-next').click();
  assert.equal(await page.locator('#level-intro').evaluate(e=>e.open),true);
  assert.match(await page.locator('#intro-badge').innerText(),/1/);
  assert.deepEqual(errors,[]);
  await browser.close(); console.log('browser progression: passed');
})().catch(e=>{console.error(e);process.exit(1)});
