const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.DELIVERY_BASE || 'http://127.0.0.1:8000';
const speech = `export function createSpeechInput(){const listeners=new Map();return {on(k,f){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f)},off(k,f){listeners.get(k)?.delete(f)},start(words){window.listening=words;window.say=s=>[...(listeners.get('result')||[])].forEach(f=>f(s));},stop(){window.listening=[]},dispose(){listeners.clear()}}}`;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.route('**/src/speech/index.js',route=>route.fulfill({contentType:'application/javascript',body:speech}));
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/delivery/');
  await page.getByRole('button',{name:'はじめから',exact:true}).click();
  await page.locator('#board .robot').waitFor();
  assert.equal(await page.locator('#title').isVisible(),false);
  assert.match(await page.locator('#tutorial-note').innerText(),/した.*1/);
  await page.evaluate(()=>window.say('した1'));
  await page.evaluate(()=>window.say('みぎ2'));
  await page.evaluate(()=>window.say('した1'));
  assert.equal(await page.locator('#sequence button').count(),3);
  assert.equal(await page.locator('#board .robot').getAttribute('data-position'),'0');
  await page.getByRole('button',{name:'オッケー',exact:true}).click();
  await page.locator('#result:not([hidden])').waitFor();
  assert.match(await page.locator('#result-heading').innerText(),/できた|とどけた/);
  await page.getByRole('button',{name:'つぎ',exact:true}).click();
  await page.locator('#game:not([hidden])').waitFor();
  await page.getByRole('button',{name:'ゲームをおわる',exact:true}).click();
  await page.getByRole('button',{name:'おわる',exact:true}).click();
  await page.locator('#title:not([hidden])').waitFor();
  for(const [width,height] of [[320,568],[390,844],[768,1024],[1280,800]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.locator('.title-footer').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight+1),true);
   await page.screenshot({path:`.local-tools/delivery/title-${width}.png`});
  }
  assert.deepEqual(errors,[]);
  console.log('delivery browser: fixed tutorial, two-step input, sound interval, normal entry, end and four viewports passed');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
