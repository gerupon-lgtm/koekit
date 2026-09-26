const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.DELIVERY_BASE||'http://127.0.0.1:8000';
const key='koekit.delivery.v1.session';
const mock=`export function createSpeechInput(){const h=new Map();return {on(k,f){if(!h.has(k))h.set(k,new Set());h.get(k).add(f)},off(k,f){h.get(k)?.delete(f)},start(w){window.listening=w;window.say=s=>[...(h.get('result')||[])].forEach(f=>f(s));window.staleSay=window.say},stop(){window.listening=[]},dispose(){h.clear()}}}`;
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await ctx.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:mock}));
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/delivery/');
 const stored=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k))?.value,key);
 async function say(text){await page.evaluate(s=>window.say(s),text)}
 async function injectBasic(){await page.evaluate(async()=>{const {BASIC_STAGE}=await import('/delivery/tutorial.js');const {createSession}=await import('/delivery/run.js');const {DeliveryStorage}=await import('/delivery/storage.js');const store=new DeliveryStorage();const old=store.load('session');store.save('session',createSession(BASIC_STAGE,{difficulty:'easy'}),old.revision)});await page.reload();await page.locator('#resume').click()}
 await injectBasic();
 // No partial/multiple/single-number instruction is adopted. Same words are two rows.
 await say('2');await say('みぎ2 した1');assert.equal((await stored()).sequence.length,0);
 await say('した1');await say('みぎ2');await say('した1');await say('した1');assert.equal((await stored()).sequence.length,4);
 await say('2ばん');await say('みぎ1');assert.equal((await stored()).sequence[1].count,1);assert.equal((await stored()).selectedIndex,null);
 await say('もどす');await say('やりなおし');assert.equal((await stored()).sequence.length,0);
 await say('した3');await say('みぎ5');await say('した4');assert.match(await page.locator('#budget').innerText(),/-8歩/);assert.equal(await page.locator('#execute').isEnabled(),true);
 await say('やりなおし');await say('した1');await say('みぎ2');await say('した1');
 const before=await stored();await page.getByRole('button',{name:'ヒント',exact:true}).click();await page.locator('#hint-panel:not([hidden])').waitFor();assert.equal(await page.locator('.hint-target').count(),1);assert.equal(await page.locator('.hint-arrow').count(),0);
 await page.getByRole('button',{name:'つぎのヒント'}).click();assert.equal(await page.locator('.hint-arrow').count(),1);await say('オッケー');assert.deepEqual((await stored()).sequence,before.sequence);assert.equal((await stored()).runtime.position,0);
 await page.locator('#execute').click();await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k))?.value?.runtime.usedSteps>0,key);await page.reload();await page.locator('#resume').click();
 assert.equal((await stored()).phase,'paused');const position=(await stored()).runtime.position;await page.waitForTimeout(450);assert.equal((await stored()).runtime.position,position);await page.locator('#continue').click();
 // Interrupt clear jingle after final step: returning from dialog must expose result controls.
 await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k))?.value?.phase==='cleared',key);
 await page.locator('#help').click();await page.getByRole('button',{name:'とじる',exact:true}).click();
 assert.equal(await page.locator('#result').isVisible(),true,'terminal state after interrupted sound routes to result');
 await page.getByRole('button',{name:'おわり',exact:true}).click();assert.equal(await stored(),null);
 // Difficulty-specific generator margin must reach Worker.
 await page.evaluate(async()=>{const {DeliveryStorage}=await import('/delivery/storage.js');const s=new DeliveryStorage();const p=s.load('progress');s.save('progress',{easy:{clearedLevelIds:[]},hard:{clearedLevelIds:[]},tutorialCompletion:{basic:true,additional:{easy:true,hard:true}}},p.revision)});
 await page.reload();await page.getByRole('button',{name:'むずかしい',exact:true}).click();await page.locator('[data-level="4"]').click();await page.locator('#game:not([hidden])').waitFor();
 const generated=await stored();const minimum=await page.evaluate(async stage=>(await import('/delivery/solver.js')).solve(stage).minSteps,generated.stageSnapshot);
 assert.equal(generated.stageSnapshot.stepLimit,minimum+Math.ceil(minimum*.15),'hard margin passed to Worker');
 // Complete Lv4 directly through UI input, preserve lower levels, and duplicate next cannot skip a stage.
 for(let stage=0;stage<3;stage++){
  const path=await page.evaluate(async k=>{const s=JSON.parse(localStorage.getItem(k)).value;return (await import('/delivery/solver.js')).solve(s.stageSnapshot,s.runtime).path},key);
  const labels={up:'うえ',down:'した',left:'ひだり',right:'みぎ'};
  for(const dir of path)await say(labels[dir]+'1');
  console.log(`Lv4 stage ${stage+1}: ${path.length} steps`);
  await page.locator('#execute').click();await page.locator('#result:not([hidden])').waitFor({timeout:path.length*1000+10000});
  if(stage<2){await page.evaluate(()=>{window.say('つぎ');window.say('つぎ')});await page.locator('#game:not([hidden])').waitFor();assert.equal((await stored()).stageIndex,stage+1)}
 }
 const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('koekit.delivery.v1.progress')).value);assert.deepEqual(progress.hard.clearedLevelIds,[4]);assert.deepEqual(progress.easy.clearedLevelIds,[]);
 await page.getByRole('button',{name:'おわり',exact:true}).click();assert.match(await page.locator('#record').innerText(),/おつかいマスター/);
 assert.deepEqual(errors,[]);console.log('delivery flow: command editing, overbudget, hints, paused cursor, interrupted result, hard Worker budget, direct Lv4 and double-next passed');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
