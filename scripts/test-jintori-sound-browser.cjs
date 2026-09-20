const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 await page.goto('http://127.0.0.1:8000/jintori/');
 const rendered=await page.evaluate(async()=>{
  const {SoundPlayer}=await import('/jintori/sound.js');const results=[];
  for(const event of ['dice','basic','enhanced','strongest','win','loss','draw','invalid','pass']){
   const ac=new OfflineAudioContext(1,44100*2,44100),player=new SoundPlayer({contextFactory:()=>ac});
   player.play(event,{flipped:6});const buffer=await ac.startRendering();const samples=buffer.getChannelData(0);
   let energy=0,peak=0;for(const x of samples){energy+=x*x;peak=Math.max(peak,Math.abs(x));}
   results.push({event,energy,peak,finite:samples.every(Number.isFinite)});
  }
  const ac=new OfflineAudioContext(1,44100,44100),player=new SoundPlayer({contextFactory:()=>ac});
  player.play('win',{},.2);player.stopAll();const cancelled=await ac.startRendering();
  return {results,cancelled:cancelled.getChannelData(0).every(x=>x===0)};
 });
 for(const r of rendered.results){assert.equal(r.finite,true);assert.ok(r.energy>1,r.event+' audible');assert.ok(r.peak<.95,r.event+' no clipping');}
 assert.equal(rendered.cancelled,true,'exit cancels future notes');
 await context.close();
 const c=await browser.newContext({serviceWorkers:'block'});
 await c.addInitScript(()=>{
  const Original=window.AudioContext;window.audioRanges=[];window.audioOverlap=false;
  window.AudioContext=class extends Original {
   constructor(...args){super(...args);window.outputContext=this;}
   track(node){const start=node.start.bind(node),stop=node.stop.bind(node),range={start:Infinity,end:Infinity};window.audioRanges.push(range);
    node.start=(t=0)=>{range.start=t;return start(t)};node.stop=(t=0)=>{range.end=t||this.currentTime;return stop(t)};return node;}
   createOscillator(){return this.track(super.createOscillator())}
   createBufferSource(){return this.track(super.createBufferSource())}
  };
 });
 await c.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:`export function createSpeechInput(){const h={};return {on(k,f){h[k]=f},off(k){delete h[k]},start(){const t=window.outputContext?.currentTime??0;window.audioOverlap ||= window.audioRanges.some(r=>r.start<=t&&r.end>t+.003)},stop(){}}}`}));
 const p=await c.newPage();await p.goto('http://127.0.0.1:8000/jintori/');
 await p.getByRole('button',{name:'ふたり',exact:true}).click();await p.getByRole('button',{name:'6 × 6',exact:true}).click();
 await p.getByRole('button',{name:'はじめから',exact:true}).click();await p.getByRole('button',{name:'スタート',exact:true}).click();await p.getByRole('button',{name:'ストップ',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('[data-cell]')&&!document.querySelector('#board').hasAttribute('aria-busy'));
 await p.locator('#enhanced').click();await p.locator('[data-cell].legal').first().click();await p.locator('#confirm-move').click();
 await p.waitForFunction(()=>!document.querySelector('#board').hasAttribute('aria-busy'));
 assert.equal(await p.evaluate(()=>window.audioOverlap),false,'microphone resumes only after sound');
 assert.ok(await p.evaluate(()=>window.audioRanges.length)>10);
 await c.close();console.log('sound rendering: nine audible distinct cues, no clipping, cancellation, microphone separation passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
