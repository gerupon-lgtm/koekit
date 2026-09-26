process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').join(__dirname,'../.local-tools/browsers');
const {chromium,webkit}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
const engine=process.env.DELIVERY_BROWSER||'chromium';
(async()=>{const b=await(engine==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'chrome',headless:true}));try{
for(const [width,height,mode,additional] of [[320,568,'voice',false],[320,568,'denied',true],[390,844,'touch',false],[390,844,'denied',false],[478,1004,'voice',false]]){
const c=await b.newContext({serviceWorkers:'block',viewport:{width,height}});await c.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:`export function createSpeechInput(){return {on(){},off(){},start(){${mode==='denied'?"return Promise.reject(new Error('denied'))":''}},stop(){},dispose(){}}}`}));
const p=await c.newPage();await p.goto((process.env.DELIVERY_BASE||'http://127.0.0.1:8000')+'/delivery/');
await p.evaluate(async additional=>{const {createSession,editSequence}=await import('/delivery/run.js'),{BASIC_STAGE,ADDITIONAL_STAGE}=await import('/delivery/tutorial.js'),{DeliveryStorage}=await import('/delivery/storage.js');let s=createSession(additional?ADDITIONAL_STAGE:BASIC_STAGE,{source:'tutorial',tutorialType:additional?'additional':'basic',difficulty:'easy',pendingStart:{level:1,stageIndex:0,difficulty:'easy'}});for(const [direction,count]of(additional?[['right',4]]:[['down',1],['right',2],['down',1]]))s=editSequence(s,{type:'move',direction,count});const store=new DeliveryStorage();const assertSave=store.save('session',s,store.load('session').revision);if(!assertSave.ok)throw Error(assertSave.code)},additional);
await p.reload();await p.locator('#resume').click();await p.evaluate(()=>document.fonts.ready);if(mode==='touch')await p.locator('#mic-state').click();if(mode==='denied')await p.locator('#mic-notice').waitFor();
await p.evaluate(()=>{window.samples=[];window.record=true;const sample=()=>{if(!window.record)return;const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};window.samples.push({board:rect('#board'),sequence:rect('#sequence'),controls:rect('#touch-input'),scrollY,scrollH:document.documentElement.scrollHeight,time:performance.now(),pos:document.querySelector('#board .robot')?.dataset.position});requestAnimationFrame(sample)};sample()});
await p.locator('#execute').click();if(additional){await p.locator('#add-command:not([disabled])').waitFor()}else await p.locator('#result:not([hidden])').waitFor();
const samples=await p.evaluate(()=>{window.record=false;return window.samples});
for(const s of samples){for(const key of ['board','sequence','controls'])for(const dim of ['x','y','width','height'])assert.ok(Math.abs(s[key][dim]-samples[0][key][dim])<1,`${width} ${mode} ${additional} ${key}.${dim}: ${samples[0][key][dim]} -> ${s[key][dim]} pos ${s.pos}`);assert.equal(s.scrollY,0);assert.ok(s.scrollH<=height+1)}
if(!additional){const gap=await p.evaluate(()=>document.querySelector('#result').getBoundingClientRect().top-document.querySelector('.board-key').getBoundingClientRect().bottom);assert.ok(gap>=0,`result overlaps legend: ${gap}`)}
await p.screenshot({path:`.local-tools/delivery/stable-${width}-${mode}.png`});
console.log(`${width}x${height} ${mode} ${additional?'partial delivery':'goal'} stable (${samples.length} frames)`);await c.close();
}
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
