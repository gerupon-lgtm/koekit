const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
const p=await b.newPage({serviceWorkers:'block'});await p.addInitScript(()=>{try{localStorage.setItem('koekit.microphone.enabled','false')}catch{}});
await p.goto('http://127.0.0.1:8000/delivery/');
await p.evaluate(async()=>{const {createSession}=await import('/delivery/run.js');const {generate}=await import('/delivery/generator.js');const {DeliveryStorage}=await import('/delivery/storage.js');const store=new DeliveryStorage();store.save('session',createSession(generate(73,4,{difficulty:'hard'}),{level:4,difficulty:'hard'}),0)});
const geometry=[];
for(const [width,height]of[[320,568],[390,844],[768,1024],[1280,800]]){
 await p.setViewportSize({width,height});await p.reload();await p.locator('#resume').click();await p.evaluate(()=>document.fonts.ready);
 const box=await p.locator('#execute').boundingBox();assert.ok(box.y+box.height<=height+1,`${width}: confirm ${JSON.stringify(box)}`);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true,`${width}: page must not scroll vertically`);
 assert.ok((await p.locator('#board').boundingBox()).width>=90,`${width}: board must remain visible`);
 await p.screenshot({path:`.local-tools/delivery/game-${width}.png`});geometry.push({width,height,executeBottom:box.y+box.height});
}
await p.setViewportSize({width:412,height:840});await p.reload();await p.evaluate(()=>document.fonts.ready);
const del=await p.evaluate(()=>({logo:document.querySelector('#title h1').getBoundingClientRect().top,menu:document.querySelector('.title-menu').getBoundingClientRect().top,footer:document.querySelector('.title-footer').getBoundingClientRect().bottom}));
await p.goto('http://127.0.0.1:8000/jintori/');await p.evaluate(()=>document.fonts.ready);const ref=await p.evaluate(()=>({logo:document.querySelector('#title h1').getBoundingClientRect().top,menu:document.querySelector('#menu-options').getBoundingClientRect().top,footer:document.querySelector('.title-footer').getBoundingClientRect().bottom}));assert.deepEqual(del,ref);console.log('live title alignment',del);
fs.writeFileSync('.local-tools/delivery/geometry.json',JSON.stringify({title:del,game:geometry},null,2));console.log('delivery game geometry 4 viewports passed');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
