const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.JINTORI_BASE||'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const context=await browser.newContext({viewport:{width:320,height:568},serviceWorkers:'block'});
 await context.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:`export function createSpeechInput(){const h={};window.say=s=>h.result?.(s);return {on(k,f){h[k]=f},off(k){delete h[k]},start(){window.micOn=true},stop(){window.micOn=false}}}`}));
 await context.route('**/jintori/sound.js',r=>r.fulfill({contentType:'application/javascript',body:`window.ticks=[];export const primeAudio=()=>{};export const stopAll=()=>{};export const playDiceSound=()=>0;export const playInvalidSound=()=>0;export const playMoveSound=()=>0;export const playDiceTick=(interval,stopping)=>{window.ticks.push({interval,stopping,micOn:window.micOn})};`}));
 await context.route('**/jintori/cpu-worker.js',r=>r.fulfill({contentType:'application/javascript',body:`import {listLegalMoves} from './rules.js';onmessage=({data})=>postMessage({token:data.token,move:{cell:listLegalMoves(data.state)[0],item:'basic',directionId:null}});`}));
 const p=await context.newPage();await p.goto(base+'/jintori/');
 await p.evaluate(async()=>{
  const {createRun,startRun,rollRun}=await import('./run.js');const {SlotStore}=await import('./storage.js');
  const run=rollRun(startRun(createRun()),2),store=new SlotStore(),s=await store.begin(run.mode);store.save(run,s.lease);await store.close();
 });
 await p.reload();
 await p.evaluate(()=>{
  new MutationObserver(()=>{if(!window.cpuShownAt&&document.querySelector('#turn-status').textContent.includes('コンピュータ'))window.cpuShownAt=performance.now()}).observe(document.querySelector('#turn-status'),{childList:true,subtree:true});
  const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){const r=JSON.parse(v);if(r.active?.match?.moveNumber===1)window.cpuSavedAt=performance.now();return original.call(this,k,v)};
 });
 await p.locator('#resume').click();await p.waitForFunction(()=>window.cpuSavedAt);
 assert.ok(await p.evaluate(()=>window.cpuSavedAt-window.cpuShownAt)>=550,'CPU shows thinking before playing');
 await p.locator('#quit').click();await p.getByRole('button',{name:'おわる',exact:true}).click();await p.locator('#title').waitFor({state:'visible'});
 await p.evaluate(async()=>{
  const {createRun,startRun,rollRun}=await import('./run.js');const {SlotStore}=await import('./storage.js');
  const run=rollRun(startRun(createRun()),2),store=new SlotStore(),s=await store.begin(run.mode);store.save(run,s.lease);await store.close();
 });
 await p.getByRole('button',{name:'やさしい',exact:true}).click();await p.locator('#resume').click();
 await p.locator('#game').waitFor({state:'visible'});
 await p.locator('#quit').click();await p.getByRole('button',{name:'おわる',exact:true}).click();
 await p.waitForTimeout(800);
 assert.equal(await p.locator('#title').isVisible(),true);
 assert.equal(await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('koekit.jintori.')).every(k=>JSON.parse(localStorage.getItem(k)).active===null)),true,'exiting during CPU wait never resurrects the save');
 await p.getByRole('button',{name:'ふたり',exact:true}).click();await p.locator('#new').click();await p.getByRole('button',{name:'スタート',exact:true}).click();
 await p.waitForFunction(()=>window.ticks.length>=5);assert.equal(await p.evaluate(()=>window.ticks.every(t=>!t.stopping&&t.micOn)),true);
 await p.evaluate(()=>window.say('ストップ'));await p.waitForFunction(()=>!document.querySelector('#game').hidden);
 const slowing=await p.evaluate(()=>window.ticks.filter(t=>t.stopping));assert.ok(slowing.length>=5);assert.ok(slowing.at(-1).interval>slowing[0].interval*2);
 assert.equal(slowing.every((t,i)=>!t.micOn&&(i===0||t.interval>slowing[i-1].interval)),true);
 await p.evaluate(()=>window.say('H8'));await p.locator('#toast').waitFor({state:'visible'});
 const toast=await p.locator('#toast').evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {font:parseFloat(s.fontSize),weight:Number(s.fontWeight),left:r.left,right:r.right,width:innerWidth}});
 assert.ok(toast.font>=20&&toast.weight>=700);assert.ok(toast.left>=0&&toast.right<=toast.width);
 await p.screenshot({path:'.local-tools/jintori-toast-320.png'});
 await context.close();console.log('feedback: CPU delay, rotating dice sound with voice stop, audible deceleration, large toast passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
