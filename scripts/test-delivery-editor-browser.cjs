const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.DELIVERY_BASE||'http://127.0.0.1:8000';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await ctx.addInitScript(()=>localStorage.setItem('koekit.microphone.enabled','false'));
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/delivery/');await page.getByRole('button',{name:'つくる・あそぶ',exact:true}).click();await page.getByRole('button',{name:'あたらしく つくる'}).click();
 await page.getByLabel('めんの名前').fill('まっすぐ おとどけ');
 const place=async(cell,piece)=>{await page.getByRole('button',{name:new RegExp(`^${cell} 空きマス$`)}).click();await page.getByRole('button',{name:piece,exact:true}).click();await page.getByRole('button',{name:'ここに おく（オッケー）',exact:true}).click()};
 await place('A1','ロボット');await place('B1','にもつ');await place('C1','とどけさき');
 await page.getByRole('button',{name:'ためしに あそぶ'}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='ためしに あそぶ'&&!b.disabled));
 assert.match(await page.locator('.delivery-editor-analysis').innerText(),/最低 2歩/);
 assert.equal(await page.getByRole('button',{name:'− 1歩',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'ためしに あそぶ',exact:true}).click();
  await page.reload();await page.locator('#resume').click();
 await page.selectOption('#step-count','2');await page.locator('#add-command').click();await page.locator('#execute').click();await page.locator('#result:not([hidden])').waitFor();
 await page.getByRole('button',{name:'つくる にもどる',exact:true}).click();assert.equal(await page.getByLabel('めんの名前').inputValue(),'まっすぐ おとどけ');
 await page.getByRole('button',{name:'一覧へ もどる',exact:true}).click();await page.getByRole('button',{name:'ふくせい',exact:true}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.delivery-editor-card')].filter(e=>e.innerText.includes('あそべます')).length===2);
 await page.getByRole('button',{name:'じゅんばんを えらんで あそぶ'}).click();
 await page.getByRole('button',{name:'まっすぐ おとどけ',exact:true}).click();await page.getByRole('button',{name:'まっすぐ おとどけ のコピー',exact:true}).click();
 await page.getByRole('button',{name:'上へ',exact:true}).last().click();
 assert.match(await page.locator('.delivery-editor ol li').first().innerText(),/のコピー/);
 await page.getByRole('button',{name:'このじゅんばんで スタート'}).click();
 for(let i=0;i<2;i++){await page.selectOption('#step-count','2');await page.locator('#add-command').click();await page.locator('#execute').click();await page.locator('#result:not([hidden])').waitFor();await page.locator('#next').click()}
 await page.locator('#title:not([hidden])').waitFor();
 const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('koekit.delivery.v1.progress'))?.value);assert.ok(!progress||!progress.easy?.clearedLevelIds?.length);
 await page.getByRole('button',{name:'つくる・あそぶ',exact:true}).click();await page.getByRole('button',{name:'あたらしく つくる'}).click();
 await page.getByLabel('ばんめんのサイズ').selectOption('9');await page.getByRole('button',{name:'ばんめんを おおきく',exact:true}).click();
 await page.getByRole('button',{name:'I9 空きマス',exact:true}).click();await page.getByRole('button',{name:'ロボット',exact:true}).click();await page.getByRole('button',{name:'ここに おく（オッケー）',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'I9 ロボット',exact:true}).count(),1);
 for(const [width,height]of[[320,568],[390,844],[768,1024],[1280,800]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`.local-tools/delivery/editor-${width}.png`,fullPage:true})}
 await page.getByRole('button',{name:'ほぞん',exact:true}).click();await page.getByRole('button',{name:'一覧へ もどる',exact:true}).click();
 await page.getByRole('button',{name:'削除',exact:true}).last().click();await page.getByRole('button',{name:'やめる',exact:true}).click();assert.equal(await page.locator('.delivery-editor-card').count(),3);
 await page.getByRole('button',{name:'削除',exact:true}).last().click();await page.getByRole('button',{name:'削除する',exact:true}).click();assert.equal(await page.locator('.delivery-editor-card').count(),2);
 assert.deepEqual(errors,[]);console.log('delivery editor browser: touch-only draft/place/minimum/preview return/duplicate/ordered play/no awards/9x9 zoom/delete passed');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
