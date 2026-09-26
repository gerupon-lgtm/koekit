process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').join(__dirname,'../.local-tools/browsers');
const {chromium,webkit}=require('../.local-tools/node_modules/playwright');
const engine=process.env.DELIVERY_BROWSER||'chromium';
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.DELIVERY_BASE||'http://127.0.0.1:8000',key='koekit.delivery.v1.session';
const mock=`export function createSpeechInput(){const h=new Map();return {on(k,f){if(!h.has(k))h.set(k,new Set());h.get(k).add(f)},off(k,f){h.get(k)?.delete(f)},start(w){window.listening=w;window.say=s=>[...(h.get('result')||[])].forEach(f=>f(s));},stop(){window.listening=[]},dispose(){h.clear()}}}`;
(async()=>{const browser=await (engine==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'chrome',headless:true}));try{
 const ctx=await browser.newContext({serviceWorkers:'block'});await ctx.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:mock}));
 const p=await ctx.newPage(),errors=[],geometry=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/delivery/');
 async function inject(type,size=3){await p.evaluate(async({type,size})=>{
  const {createSession,startExecution,advance,editSequence}=await import('/delivery/run.js'),{BASIC_STAGE,ADDITIONAL_STAGE}=await import('/delivery/tutorial.js'),{generate}=await import('/delivery/generator.js'),{DeliveryStorage}=await import('/delivery/storage.js');
  let s=createSession(type==='additional'?ADDITIONAL_STAGE:type==='normal'?generate(73,(size-1)/2,{difficulty:'hard'}):BASIC_STAGE,{level:(size-1)/2,difficulty:'hard',...(type==='basic'||type==='additional'?{source:'tutorial',tutorialType:type,pendingStart:{level:1,stageIndex:0,difficulty:'hard'}}:{})});
  if(type==='cleared'||type==='failed'){for(const [direction,count]of(type==='failed'?[['up',1]]:[['down',1],['right',2],['down',1]]))s=editSequence(s,{type:'move',direction,count});s=startExecution(s);while(s.phase==='executing')s=advance(s).session;}
  const store=new DeliveryStorage();const saved=store.save('session',s,store.load('session').revision);if(!saved.ok)throw new Error(`fixture ${type}/${size}: ${saved.code}`);
 },{type,size});await p.reload();await p.locator('#resume').click();await p.evaluate(()=>document.fonts.ready)}
 async function measure(label){const g=await p.evaluate(()=>{const r=selector=>{const e=document.querySelector(selector),b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom}};return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,board:r('#board'),key:r('.board-key'),keyFont:getComputedStyle(document.querySelector('.board-key')).fontSize}});assert.ok(g.scrollHeight<=g.height+1,`${label}: vertical overflow ${JSON.stringify(g)}`);assert.ok(g.scrollWidth<=g.width,`${label}: horizontal overflow`);if(!label.includes('failed')){assert.ok(g.board.width>=90&&g.board.height>=90,`${label}: collapsed board ${JSON.stringify(g)}`);assert.ok(g.key.height>=18&&parseFloat(g.keyFont)>=14,`${label}: unreadable legend`)}geometry.push({label,...g})}
 for(const [width,height]of[[320,568],[360,640],[390,844],[478,1004],[768,1024],[1280,800]]){
  await p.setViewportSize({width,height});
  for(const type of ['normal','basic','additional','cleared','failed']){
   await inject(type,type==='normal'?9:3);await measure(`${width} ${type}`);
   await p.evaluate(()=>{document.querySelector('#mic-notice').hidden=false});await measure(`${width} ${type} denied`);
   const gap=await p.evaluate(()=>document.querySelector('[data-action=retryMic]').getBoundingClientRect().top-document.querySelector('#help').getBoundingClientRect().bottom);assert.ok(gap>=8,`${width} ${type}: help/retry gap ${gap}`);
   if(width===320||width===390)await p.screenshot({path:`.local-tools/delivery/review-${type}-${width}.png`});
  }
 }
 await p.setViewportSize({width:390,height:844});
 for(const size of [9,7,5,3]){await inject('normal',size);assert.deepEqual(await p.locator('#step-count option').evaluateAll(es=>es.map(e=>+e.value)),Array.from({length:size-1},(_,i)=>i+1));await p.locator('#step-count').selectOption(String(size-1));}
 const arrows=await p.locator('.directions .direction-icon path').evaluateAll(es=>es.map(e=>({d:e.getAttribute('d'),rotation:e.getAttribute('transform')})));assert.equal(new Set(arrows.map(a=>a.d)).size,1);assert.equal(new Set(arrows.map(a=>a.rotation)).size,4);
 await inject('basic');assert.equal(await p.locator('#game-voice-guide').getAttribute('data-input'),'voice');assert.match(await p.locator('#game-voice-guide').innerText(),/みぎ2/);
 await p.locator('#mic-state').click();assert.equal(await p.locator('#game-voice-guide').getAttribute('data-input'),'touch');assert.equal(await p.locator('#game-voice-guide span').isVisible(),false);
 for(const [direction,count]of[['down','1'],['right','2'],['down','1']]){await p.locator(`[data-direction=${direction}]`).click();await p.locator('#step-count').selectOption(count);await p.locator('#add-command').click()}
 await p.evaluate(()=>{window.framesSeen=[];window.soundCalls=[];const record=()=>{const pos=document.querySelector('#board .robot')?.dataset.position;if(pos!==window.framesSeen.at(-1)?.pos)window.framesSeen.push({pos,time:performance.now()})};record();new MutationObserver(record).observe(document.querySelector('#board'),{subtree:true,childList:true});window.startedAt=performance.now()});
 await p.evaluate(async()=>{const {DeliverySound}=await import('/delivery/sound.js');const play=DeliverySound.prototype.play;DeliverySound.prototype.play=function(event){window.soundCalls.push({event,time:performance.now()});return play.call(this,event)}});
 await p.locator('#execute').click();await p.locator('#result:not([hidden])').waitFor();
 const timing=await p.evaluate(()=>({steps:window.framesSeen,sounds:window.soundCalls,start:window.startedAt,result:performance.now()}));assert.equal(timing.steps.length,5);assert.ok(timing.steps[1].time-timing.start>=350);
 for(let i=2;i<timing.steps.length;i++)assert.ok(timing.steps[i].time-timing.steps[i-1].time>=700,JSON.stringify(timing));assert.ok(timing.result-timing.steps.at(-1).time>=2100);
 assert.ok(timing.steps.at(-1).time-timing.steps.at(-2).time>=950,'goal approach includes pause');
 const goalDelay=timing.sounds.find(s=>s.event==='clear').time-timing.steps.at(-1).time;assert.ok(Math.abs(goalDelay)<100,`goal movement/sound mismatch ${goalDelay}`);
 assert.equal(await p.locator('#board').isVisible(),true);assert.equal(await p.locator('#touch-input').isVisible(),false);await p.waitForTimeout(2400);assert.equal(await p.locator('#result').isVisible(),true);await measure('390 clear touch');
 await p.screenshot({path:'.local-tools/delivery/review-clear-touch-390.png'});await p.locator('#next').click();await p.locator('#execute').waitFor();assert.equal(await p.locator('#input-status').innerText(),'');
 await p.locator('#mic-state').click();assert.equal(await p.locator('#game-voice-guide').getAttribute('data-input'),'voice');
 // Voice next follows the same manual completion path.
 await inject('cleared');assert.ok((await p.evaluate(()=>window.listening)).includes('つぎ'));await p.evaluate(()=>window.say('つぎ'));await p.locator('#execute').waitFor();assert.equal((await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).value,key)).stageIndex,1);
 // Compare the actual existing app's exit button without editing any reference files.
 const ref=await ctx.newPage();await ref.goto(base+'/jintori/');
 for(const [width,height]of[[478,1004],[360,640],[320,568]]){
  await p.setViewportSize({width,height});await ref.setViewportSize({width,height});
  const appearance=()=>{const e=document.querySelector('#quit');e.hidden=false;const s=getComputedStyle(e),icon=getComputedStyle(e.querySelector('svg'));return {path:e.querySelector('path').getAttribute('d'),width:s.width,height:s.height,color:s.color,background:s.backgroundColor,radius:s.borderRadius,iconWidth:icon.width,stroke:icon.stroke,strokeWidth:icon.strokeWidth,fill:icon.fill}};
  assert.deepEqual(await p.evaluate(appearance),await ref.evaluate(appearance));
 }
 await ref.close();
 assert.deepEqual(errors,[]);fs.writeFileSync(`.local-tools/delivery/usability-geometry-${engine}.json`,JSON.stringify({geometry,timing},null,2));console.log(`${engine} delivery usability: 60 layout states, readable legends, all step limits, shared SVG arrows, playback timings, persistent clear board, touch/voice next and reference exit button passed`);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
