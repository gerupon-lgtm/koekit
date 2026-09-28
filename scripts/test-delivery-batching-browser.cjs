process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').join(__dirname,'../.local-tools/browsers');
const {chromium,webkit}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const base=process.env.DELIVERY_BASE||'http://127.0.0.1:8001';
const mock=`export function createSpeechInput(){const h=new Map();return {on(k,f){h.set(k,f)},off(k){h.delete(k)},start(){window.say=t=>h.get('result')?.(t)},stop(){},dispose(){h.clear()}}}`;
(async()=>{const browser=await(process.env.DELIVERY_BROWSER==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'chrome',headless:true}));try{
  for(const difficulty of ['easy','hard'])for(const batch of [false,true]){
    const c=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});await c.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:mock}));const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/delivery/');
    await p.evaluate(async()=>{const {DeliveryStorage}=await import('/delivery/storage.js');const store=new DeliveryStorage();store.save('progress',{tutorialCompletion:{basic:true,additional:{easy:false,hard:false}}},store.load('progress').revision)});
    await p.reload();await p.locator('#level-list button').last().waitFor();await p.locator(`[data-difficulty=${difficulty}]`).click();await p.locator('[data-level="3"]').click();await p.locator('#dialog[open]').waitFor();
    const explanation=await p.locator('#dialog-body').innerText();assert.match(explanation,/わけて はこぶ/);assert.match(explanation,/まとめて はこぶ/);assert.match(explanation,/つづきの しじが あれば/);
    await p.setViewportSize({width:320,height:568});await p.evaluate(()=>document.fonts.ready);
    assert.equal(await p.locator('#dialog').evaluate(e=>e.scrollHeight<=e.clientHeight+1),true,'Both examples and start button fit without scrolling');
    await p.setViewportSize({width:390,height:844});
    if(batch)await p.evaluate(()=>window.say('オッケー'));else await p.getByRole('button',{name:'れんしゅうする',exact:true}).click();
    await p.locator('#add-command:not([disabled])').waitFor();
    const saved=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('koekit.delivery.v1.session')).value);
    const add=async(direction,count)=>{await p.locator(`[data-direction=${direction}]`).click();await p.locator('#step-count').selectOption(String(count));await p.locator('#add-command').click()};
    await add('right',4);
    if(batch){await p.evaluate(()=>window.say('左 一'));await p.evaluate(()=>window.say('右 一'))}
    await p.locator('#execute').click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('koekit.delivery.v1.session')).value.runtime.deliveredMask===3);
    if(batch){assert.equal((await saved()).phase,'executing');assert.equal((await saved()).sequence.length,3)}
    else{await p.locator('#add-command:not([disabled])').waitFor();assert.equal((await saved()).phase,'editing');assert.equal((await saved()).runtime.usedSteps,4);assert.match(await p.locator('#tutorial-note').innerText(),/しじが おわったので とまった/);await add('left',1);await add('right',1);await p.locator('#execute').click()}
    await p.locator('#result:not([hidden])').waitFor();assert.equal((await saved()).runtime.usedSteps,6);assert.match(await p.locator('#result-detail').innerText(),/わけても まとめても/);
    assert.equal(await p.evaluate(d=>JSON.parse(localStorage.getItem('koekit.delivery.v1.progress')).value.tutorialCompletion.additional[d],difficulty),true);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true);assert.deepEqual(errors,[]);
    console.log(`${difficulty} ${batch?'batch via voice':'split via touch'} tutorial: passed`);await c.close();
  }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
