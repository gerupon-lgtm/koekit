const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8000/kioku/');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  // 手動の画像取得なし。SWの事前保存だけで全動物が使えることを確認。
  assert.equal(await page.evaluate(async()=>{
    const {ANIMAL_FILES,animalUrl}=await import('/src/game/animals.js');
    return (await Promise.all(ANIMAL_FILES.map(file=>caches.match(animalUrl(file))))).every(Boolean);
  }),true);
  await context.setOffline(true);
  await page.locator('#mode-sequence').click();
  await page.locator('[data-level="1"]').click(); await page.locator('#intro-go').click();
  assert.equal(await page.locator('.card').count(),9);
  await page.waitForFunction(()=>[...document.querySelectorAll('.card img')].every(img=>img.complete && img.naturalWidth>0));
  await page.locator('#next-btn').click();
  await page.locator('#confirm-btn').waitFor({state:'visible'});
  await page.locator('[data-key="up"]').click(); await page.locator('[data-key="right"]').click();
  assert.equal(await page.locator('#confirm-btn').isEnabled(),true);
  await page.locator('#confirm-btn').click(); await page.locator('#next-btn').waitFor({state:'visible'});
  await page.goto('http://127.0.0.1:8000/doubutsu/');
  await page.locator('#approved-menu-layout').waitFor({state:'attached'});
  await page.locator('[data-level="1"]').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true);
  assert.deepEqual(errors,[]);
  await browser.close(); console.log('offline cached sequence + touch without microphone: passed');
})().catch(e=>{console.error(e);process.exit(1)});
