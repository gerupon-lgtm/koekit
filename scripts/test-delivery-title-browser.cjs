const base=process.env.DELIVERY_BASE||'http://127.0.0.1:8000';
const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>localStorage.setItem('koekit.microphone.enabled','false'));const p=await context.newPage(),ref=await context.newPage(),geometry=[];
 for(const [width,height]of[[320,568],[360,640],[390,780],[390,844],[412,840],[478,1004],[768,1024],[1280,800]]){
  await p.setViewportSize({width,height});await ref.setViewportSize({width,height});await ref.goto(base+'/jintori/');
  for(const saved of [false,true]){
   await p.goto(base+'/delivery/');await p.evaluate(async saved=>{localStorage.removeItem('koekit.delivery.v1.session');if(saved){const {createSession}=await import('/delivery/run.js'),{BASIC_STAGE}=await import('/delivery/tutorial.js'),{DeliveryStorage}=await import('/delivery/storage.js');new DeliveryStorage().save('session',createSession(BASIC_STAGE),0)}},saved);await p.reload();await p.evaluate(()=>document.fonts.ready);
   const g=await p.evaluate(()=>{const b=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,logo:b('#title h1'),footer:b('.title-footer'),menu:b('.title-menu'),record:b('#record'),levels:[...document.querySelectorAll('#level-list button')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,bottom:r.bottom,disabled:e.disabled}})}});
   assert.ok(g.scrollHeight<=height,`title ${width} saved=${saved}: ${JSON.stringify(g)}`);assert.ok(g.scrollWidth<=width);assert.equal(g.levels.length,4);
   for(let i=0;i<4;i++){assert.equal(g.levels[i].disabled,false);assert.equal(g.levels[i].x,g.levels[0].x);assert.equal(g.levels[i].width,g.levels[0].width);if(i)assert.ok(g.levels[i].y>=g.levels[i-1].bottom)}assert.ok(g.menu.bottom<=g.record.y);assert.ok(g.record.bottom<=g.footer.y);
   const reference=await ref.locator('#title h1').boundingBox();for(const key of ['x','y','width','height'])assert.ok(Math.abs(g.logo[key]-reference[key])<1,`logo ${width} ${key}`);
   const ink=async page=>page.locator('#title .wordmark').evaluate(async im=>{await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let top=c.height;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(data[(y*c.width+x)*4+3]>128)top=Math.min(top,y);const r=im.getBoundingClientRect();return r.y+top*Math.min(r.width/c.width,r.height/c.height)});
   assert.ok(Math.abs(await ink(p)-await ink(ref))<1,'visible logo top aligns, including transparent padding');
   if([320,390,478].includes(width))await p.screenshot({path:`.local-tools/delivery/title-final-${width}-${saved?'resume':'new'}.png`});geometry.push({saved,...g});
  }
 }
 await p.evaluate(()=>localStorage.removeItem('koekit.delivery.v1.session'));await p.reload();await p.locator('#title [data-level="4"]').click();await p.locator('#game:not([hidden])').waitFor();assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('koekit.delivery.v1.session')).value.level),4);
 await p.locator('#quit').click();await p.getByRole('button',{name:'おわる',exact:true}).click();
 await p.evaluate(async()=>{const {DeliveryStorage}=await import('/delivery/storage.js');const store=new DeliveryStorage(),old=store.load('progress');store.save('progress',{easy:{clearedLevelIds:[4]},hard:{clearedLevelIds:[]},tutorialCompletion:{basic:false,additional:{easy:false,hard:false}}},old.revision)});await p.reload();assert.equal(await p.locator('[data-level="4"] .clear-mark').count(),1);await p.locator('[data-difficulty="hard"]').click();assert.equal(await p.locator('#level-list .clear-mark').count(),0);
 fs.writeFileSync('.local-tools/delivery/title-final-geometry.json',JSON.stringify(geometry,null,2));console.log('delivery title: 16 states, four vertical direct level buttons, resume, difficulty completion, no page scroll and live reference logo frame/ink alignment passed');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
