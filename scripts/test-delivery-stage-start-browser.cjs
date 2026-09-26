const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.DELIVERY_BASE||'http://127.0.0.1:8001';
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
  const c=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  await c.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:`export function createSpeechInput(){return {on(){},off(){},start(){window.listening=true;window.listenAt=performance.now()},stop(){window.listening=false},dispose(){window.listening=false}}}`}));
  await c.route('**/delivery/sound.js',async r=>{const response=await r.fetch();await r.fulfill({response,body:await response.text()+`
    const play=DeliverySound.prototype.play;
    DeliverySound.prototype.play=function(event){const duration=play.call(this,event);window.sound=this;(window.sounds||=[]).push({event,duration,time:performance.now(),listening:!!window.listening,running:this.context?.state,visible:!document.querySelector('#game').hidden});return duration};`})});
  const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const ready=()=>p.locator('#level-list button').last().waitFor();
  async function checkStage(){
    await p.waitForFunction(()=>window.sounds?.some(s=>s.event==='stageStart'));
    const event=await p.evaluate(()=>window.sounds.find(s=>s.event==='stageStart'));
    assert.equal(event.listening,false);assert.equal(event.visible,true);assert.equal(event.running,'running');assert.ok(event.duration>=530&&event.duration<=550);
    await p.waitForFunction(()=>window.listening===true);assert.ok(await p.evaluate(e=>window.listenAt-e.time>=e.duration,event));
    assert.equal(await p.locator('#add-command').isEnabled(),true);assert.equal(await p.evaluate(()=>window.sounds.filter(s=>s.event==='stageStart').length),1);
  }
  await p.goto(base+'/delivery/');await ready();await p.locator('#new').click();await checkStage();
  assert.match(await p.locator('#tutorial-note').innerText(),/まずは/);
  // A restored session is not a new stage.
  await p.reload();await ready();await p.locator('#resume').click();await p.waitForFunction(()=>window.listening);assert.equal(await p.evaluate(()=>window.sounds?.length||0),0);
  // Both normal and custom stage progression use the same entrance, once per stage.
  for(const source of ['normal','custom']){
    await p.evaluate(async source=>{const {BASIC_STAGE,BASIC_SEQUENCE}=await import('/delivery/tutorial.js'),{createSession,editSequence,startExecution,advance}=await import('/delivery/run.js'),{DeliveryStorage}=await import('/delivery/storage.js');const store=new DeliveryStorage();let session=createSession(BASIC_STAGE,{source,level:1,stageIndex:0,...(source==='custom'?{orderedStageSnapshots:[BASIC_STAGE,BASIC_STAGE]}:{})});for(const command of BASIC_SEQUENCE)session=editSequence(session,{type:'move',...command});session=startExecution(session);while(session.phase==='executing')session=advance(session).session;const saved=store.save('session',session,store.load('session').revision);if(!saved.ok)throw Error(saved.code);store.save('progress',{tutorialCompletion:{basic:true,additional:{easy:true,hard:true}}},store.load('progress').revision)},source);
    await p.reload();await ready();await p.locator('#resume').click();await p.locator('#next').click();await checkStage();
  }
  // Initial custom preview, entered through the actual editor.
  await p.locator('#quit').click();await p.locator('#dialog-actions').getByRole('button',{name:'おわる',exact:true}).click();
  await p.getByRole('button',{name:'つくる・あそぶ',exact:true}).click();await p.getByRole('button',{name:'あたらしく つくる'}).click();
  for(const [cell,piece]of[['A1','ロボット'],['B1','にもつ'],['C1','とどけさき']]){await p.getByRole('button',{name:`${cell} 空きマス`,exact:true}).click();await p.getByRole('button',{name:piece,exact:true}).click();await p.getByRole('button',{name:'ここに おく（オッケー）',exact:true}).click()}
  await p.evaluate(()=>{window.sounds=[]});await p.getByRole('button',{name:'ためしに あそぶ',exact:true}).click();await checkStage();
  // Interrupt a fresh entrance before its sound ends. No delayed microphone restart.
  await p.goto(base+'/delivery/');await ready();await p.locator('#new').click();await p.locator('#dialog-actions').getByRole('button',{name:'さいしょから',exact:true}).click();
  await p.waitForFunction(()=>window.sounds?.some(s=>s.event==='stageStart'));await p.locator('#quit').click();
  assert.equal(await p.evaluate(()=>window.sound.playing.size),0);await p.waitForTimeout(800);assert.equal(await p.evaluate(()=>!!window.listening),false);assert.equal(await p.locator('#dialog').isVisible(),true);
  await p.locator('#dialog-actions').getByRole('button',{name:'つづける',exact:true}).click();await p.waitForFunction(()=>window.listening);assert.equal(await p.locator('#add-command').isEnabled(),true);
  assert.deepEqual(errors,[]);console.log('Stage entrance: tutorial, normal/custom next, custom preview, first-gesture audio, recognition delay, resume exclusion and cancellation passed');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
