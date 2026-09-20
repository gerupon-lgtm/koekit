const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome'});try{
for(const [width,height] of [[412,840],[390,844],[390,780],[390,664],[360,640],[320,568]]){
for(const route of ['doubutsu/','kioku/','kioku/?mode=sequence','irodori/','jintori/']){
const c=await b.newContext({viewport:{width,height},serviceWorkers:'block'});await c.addInitScript(()=>localStorage.setItem('irodori:draft',JSON.stringify({size:3,cells:['red',null,null,null,null,null,null,null,null]})));
const p=await c.newPage();await p.goto((process.env.MENU_BASE||'http://127.0.0.1:8000/')+route);await p.evaluate(()=>document.fonts.ready);if(route.startsWith('kioku')||route.startsWith('doubutsu'))await p.locator('#approved-menu-layout').waitFor({state:'attached'});
const g=await p.evaluate(()=>{const box=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};return {logo:box('.app-title,.ir-logo,#title>h1'),footer:box('.title-footer,.ir-foot'),group:box('.memory-level-list,.ir-menu,#menu-options'),record:box('#highest-title'),hint:box('.unlock-hint'),action:box('#title .menu-actions'),scroll:document.documentElement.scrollHeight};});
console.log(width,height,route,'checked');assert.ok(g.footer.bottom<=height+.5, 'footer fits '+route);assert.ok(g.scroll<=height,'no page scroll '+route);
if(g.record)assert.ok(g.hint.bottom<=g.record.top,'hint and achievement do not overlap');
if(g.action)assert.ok(g.group.bottom<=g.action.top,'options and start do not overlap');
if(width===412&&height===840){assert.equal(g.logo.top,58);assert.equal(g.footer.bottom,832);assert.equal(g.group.top,229);await p.screenshot({path:'.local-tools/final-menu-'+route.replace(/[^a-z]/g,'')+'.png'});}
if(route==='jintori/'){assert.equal(await p.locator('#toolbar-caption').count(),1);assert.equal(await p.locator('#title .title-caption').innerText(),'こえで、じんとりしょうぶ。');}
if(route==='irodori/')assert.equal(await p.locator('#btn-continue').count(),1);
await c.close();}}
console.log('PASS menu alignment, draft, footer and overlap checks');}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
