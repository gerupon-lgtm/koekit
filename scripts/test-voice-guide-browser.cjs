const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.GUIDE_BASE || 'http://127.0.0.1:8000';
const speech = `export const METHODS={VOSK:'vosk'};export function createSpeechInput(){const h={};window.say=s=>h.result?.(s,0);return {name:'vosk',async isAvailable(){return true},on(k,f){h[k]=f},off(){},start(w){window.words=w},stop(){window.words=[]},dispose(){}}}`;
(async()=>{const browser=await chromium.launch({channel:'chrome'});try{
for(const route of ['doubutsu/','kioku/','kioku/?mode=sequence','irodori/','jintori/']){
 if(process.env.GUIDE_ROUTE && route!==process.env.GUIDE_ROUTE)continue;
 const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await c.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:speech}));
 const p=await c.newPage(), errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await p.goto(base+'/'+route);
 const expectWord=async(id,word)=>{await p.waitForFunction(({id,word})=>document.getElementById(id)?.dataset.voiceWord===word,{id,word},{timeout:15000});assert.match(await p.locator('#'+id).innerText(),new RegExp(word));};
 if(route==='irodori/'){
  await p.locator('#tutorial-primary').waitFor({state:'attached'});await p.locator('[data-go="tutorial"]').click();assert.match(await p.locator('.ir-tutorial-voice').innerText(),/つぎ/);
  await p.evaluate(()=>window.say('つぎ'));await p.evaluate(()=>window.say('つぎ'));
  await p.getByRole('button',{name:'きいろ',exact:true}).click();await p.locator('[data-row="0"][data-col="0"]').click();
  await expectWord('make-voice-guide','オッケー');await p.locator('#mic-state').click();assert.equal(await p.locator('#make-voice-guide').getAttribute('data-input'),'touch');
  await p.locator('#btn-confirm').click();
 }else if(route==='jintori/'){
  await p.locator('[data-option="opponent"][data-value="human"]').click();await p.locator('#new').click();await expectWord('setup-voice-guide','スタート');
  await p.locator('[data-action="start"]').click();await expectWord('dice-voice-guide','ストップ');await p.locator('#stop-dice').click();assert.equal(await p.locator('#dice-voice-guide').getAttribute('data-voice-word'),'');
  await p.locator('#board .legal').first().click();await expectWord('game-voice-guide','オッケー');
  for(const [width,height] of [[320,568],[390,844]]){await p.setViewportSize({width,height});assert.ok(await p.locator('#confirm-move').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));}
 }else{
  await p.locator('#start-play').click();assert.match(await p.locator('.intro-voice-hint').innerText(),/オッケー/);assert.doesNotMatch(await p.locator('.intro-voice-hint').innerText(),/つぎ/);
  await p.locator('#intro-go').click();await expectWord('game-voice-guide','スタート');
  const button=p.locator(route==='doubutsu/'?'#spin-btn':'#next-btn');assert.match(await button.innerText(),/スタート/);
  for(const [width,height] of [[320,568],[390,844]]){await p.setViewportSize({width,height});assert.ok(await button.evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),'controls fit '+route);assert.ok(await p.locator('#game-voice-guide').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));}
  await p.screenshot({path:'.local-tools/guide-'+(route==='doubutsu/'?'pitari':route.includes('?')?'sequence':'memory')+'.png'});
  if(route==='doubutsu/'){
   for(let round=0;round<2;round++){await button.click();await expectWord('game-voice-guide','ストップ');await p.waitForTimeout(250);assert.match(await p.locator('#game-voice-guide').innerText(),/ストップ/);await button.click();assert.equal(await p.locator('#game-voice-guide').getAttribute('data-voice-word'),'');await expectWord('game-voice-guide','スタート');}
  }
  await p.locator('#mic-state').click();assert.equal(await p.locator('#game-voice-guide').getAttribute('data-input'),'touch');assert.match(await p.locator('#game-voice-guide').innerText(),/タッチ/);await p.locator('#mic-state').click();await expectWord('game-voice-guide','スタート');
  await p.evaluate(async()=>{const {setMicState}=await import('/src/ui/micstate.js');setMicState(document.getElementById('mic-state'),null,'denied')});assert.equal(await p.locator('#game-voice-guide').getAttribute('data-input'),'touch');
 }
 assert.deepEqual(errors,[]);console.log('PASS voice guide '+route);await c.close();
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
