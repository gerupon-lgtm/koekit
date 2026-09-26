process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').join(__dirname,'../.local-tools/browsers');
const {chromium,webkit}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.DELIVERY_BASE||'http://127.0.0.1:8001';
(async()=>{const browser=await (process.env.DELIVERY_BROWSER==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'chrome',headless:true}));try{
  const c=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  await c.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:`export function createSpeechInput(){const h=new Map();return {on(k,f){h.set(k,f)},off(k){h.delete(k)},start(w){window.listening=w;window.say=t=>h.get('result')?.(t)},stop(){window.listening=[]},dispose(){h.clear()}}}`}));
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/delivery/');
  async function fixture({ids=[1,2,3],difficulty='easy',level=4,source='normal',editing=false}={}){
    await p.evaluate(async o=>{const {BASIC_STAGE,BASIC_SEQUENCE}=await import('/delivery/tutorial.js'),{createSession,editSequence,startExecution,advance}=await import('/delivery/run.js'),{DeliveryStorage}=await import('/delivery/storage.js');const store=new DeliveryStorage();let s=createSession(BASIC_STAGE,{source:o.source,difficulty:o.difficulty,level:o.level,stageIndex:o.source==='normal'?2:0,...(o.source==='custom'?{orderedStageSnapshots:[BASIC_STAGE]}:{}),...(o.source==='tutorial'?{tutorialType:'basic',pendingStart:{level:o.level,stageIndex:0,difficulty:o.difficulty}}:{})});for(const cmd of BASIC_SEQUENCE)s=editSequence(s,{type:'move',...cmd});if(!o.editing){s=startExecution(s);while(s.phase==='executing')s=advance(s).session}for(const [kind,value]of[['session',s],['progress',{easy:{clearedLevelIds:o.difficulty==='easy'?o.ids:[]},hard:{clearedLevelIds:o.difficulty==='hard'?o.ids:[]},tutorialCompletion:{basic:true,additional:{easy:true,hard:true}}}]]){const saved=store.save(kind,value,store.load(kind).revision);if(!saved.ok)throw Error(saved.code)}},{ids,difficulty,level,source,editing});
    await p.reload();await p.locator('#level-list button').last().waitFor();
    await p.evaluate(async()=>{const {DeliverySound}=await import('/delivery/sound.js');const play=DeliverySound.prototype.play;window.sounds=[];DeliverySound.prototype.play=function(event){const duration=play.call(this,event);window.sound=this;window.sounds.push({event,duration,time:performance.now(),listening:window.listening?.length||0,state:this.context?.state});return duration}});
    await p.locator('#resume').click();
  }
  const saved=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('koekit.delivery.v1.session'))?.value);
  await fixture({editing:true});await p.locator('#execute').click();await p.locator('#result:not([hidden])').waitFor();assert.equal((await saved()).allClearReady,true);assert.equal(await p.locator('#ending').isVisible(),false);
  await p.locator('#next').click();await p.locator('#ending:not([hidden])').waitFor();await p.waitForFunction(()=>window.sounds.some(s=>s.event==='allClear'));
  let music=await p.evaluate(()=>window.sounds.find(s=>s.event==='allClear'));assert.equal(music.listening,0);
  const audioAvailable=await p.evaluate(async()=>{try{const Audio=window.AudioContext||window.webkitAudioContext;const context=new Audio();await context.close();return true}catch{return false}});
  if(audioAvailable)assert.equal(music.state,'running');else console.log('AudioContext unavailable in this test engine: validating silent fallback, not audible playback');
  assert.ok(music.duration>=4700&&music.duration<=4800);
  assert.equal(await p.locator('#ending img').evaluate(e=>e.complete&&e.naturalWidth===1254),true);
  for(const [width,height]of[[320,568],[360,640],[390,844],[478,1004],[768,1024],[1280,800]]){
    await p.setViewportSize({width,height});await p.evaluate(()=>document.fonts.ready);
    const geometry=await p.evaluate(()=>{const img=document.querySelector('#ending img').getBoundingClientRect(),button=document.querySelector('#ending button').getBoundingClientRect();return {h:document.documentElement.scrollHeight,w:document.documentElement.scrollWidth,img:{w:img.width,h:img.height,bottom:img.bottom},buttonTop:button.top,buttonBottom:button.bottom}});
    assert.ok(geometry.h<=height+1&&geometry.w<=width,JSON.stringify({width,height,geometry}));assert.ok(geometry.img.w>=180&&Math.abs(geometry.img.w-geometry.img.h)<1);assert.ok(geometry.img.bottom<=geometry.buttonTop&&geometry.buttonBottom<=height);
    if(width===390)await p.screenshot({path:'.local-tools/delivery/ending-390.png'});
  }
  await p.waitForFunction(()=>window.listening?.includes('オッケー'));assert.equal(await p.locator('#ending').isVisible(),true);assert.equal(await p.evaluate(()=>window.sounds.filter(s=>s.event==='allClear').length),1);
  await p.evaluate(()=>window.say('オッケー'));await p.locator('#title:not([hidden])').waitFor();assert.equal(await saved(),null);
  for(const source of ['normal','custom','tutorial']){await fixture({ids:source==='normal'?[]:[1,2,3,4],source});assert.equal(!!(await saved()).allClearReady,false);}
  await fixture({ids:[1,3,4],level:2,difficulty:'hard'});assert.equal((await saved()).allClearReady,true);await p.locator('#next').click();await p.waitForFunction(()=>window.sounds.some(s=>s.event==='allClear'));assert.match(await p.locator('#ending-difficulty').innerText(),/むずかしい/);
  // Interrupt by help; neither closing it nor restoring the ending replays the music.
  await p.locator('#help').click();assert.equal(await p.evaluate(()=>window.sound.playing.size),0);await p.getByRole('button',{name:'とじる',exact:true}).click();await p.waitForTimeout(5100);assert.equal(await p.evaluate(()=>window.sounds.filter(s=>s.event==='allClear').length),1);
  await p.reload();await p.locator('#level-list button').last().waitFor();await p.locator('#resume').click();assert.equal(await p.locator('#ending').isVisible(),true);assert.equal(await p.evaluate(()=>window.sounds?.length||0),0);
  await p.locator('#ending button').click();await p.locator('#title:not([hidden])').waitFor();
  await fixture();await p.locator('#next').click();await p.waitForFunction(()=>window.sounds.some(s=>s.event==='allClear'));await p.locator('#ending button').click();assert.equal(await p.evaluate(()=>window.sound.playing.size),0);await p.waitForTimeout(5100);assert.equal(await p.locator('#title').isVisible(),true);assert.equal(await p.evaluate(()=>window.listening?.length||0),0);
  assert.deepEqual(errors,[]);console.log('Full completion: actual final move, all four levels per difficulty, out-of-order completion, excluded shortcuts/custom/tutorial, six viewports, one-shot music, voice/touch exit, interruption and restore passed');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
