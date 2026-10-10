const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8018';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const [query,engine] of [['','light'],['?sound=light','light'],['?sound=simple','simple'],['?sound=classic','classic'],['?sound=unknown','light']]){
   await page.goto(base+'/probe/saezuri/'+query);
   await page.locator('#home-create').click();await page.locator('#new-manual').click();
   await page.locator('#report').evaluate(n=>n.click());
   const report=JSON.parse(await page.locator('#metrics').textContent());
   assert.equal(report.audioEngine,engine,query||'normal URL');
   assert.equal(report.soundPolicyRevision,'2026-10-10-light-default');
  }
  const pcm=await page.evaluate(async()=>{
   const {scheduleVoice,ProbeTransport}=await import('./audio.js');
   const audio=new OfflineAudioContext(1,48000,48000);
   let oscillators=0;const makeOscillator=audio.createOscillator.bind(audio);
   audio.createOscillator=()=>{oscillators++;return makeOscillator();};
   scheduleVoice(audio,audio.destination,{midi:60,time:.1,duration:.2});
   const samples=(await audio.startRendering()).getChannelData(0);
   const rms=(a,b)=>Math.sqrt(samples.slice(a*48000,b*48000).reduce((sum,n)=>sum+n*n,0)/((b-a)*48000));
   return {oscillators,tail:rms(.45,.5),silence:rms(.85,.95),transportEngine:new ProbeTransport(audio,()=>{}).engine};
  });
  assert.equal(pcm.oscillators,2,'omitted engine uses the two-oscillator piano');
  assert.ok(pcm.tail>0,'default playback preserves release');assert.equal(pcm.silence,0);
  assert.equal(pcm.transportEngine,'light');
  await page.goto(base+'/probe/light-sound/');
  for(const engine of ['light','simple','classic']){
   await page.locator('#engine').selectOption(engine);
   assert.equal(new URL(await page.locator('#try-app').getAttribute('href'),page.url()).searchParams.get('sound'),engine);
  }
  assert.match(await page.locator('#engine option[value=classic]').textContent(),/以前の音/);
  await page.goto(base+'/probe/saezuri/');
  for(const width of [320,390,844]){
   await page.setViewportSize({width,height:844});
   const info=await page.locator('.home-credit').evaluate(node=>({text:node.textContent,build:node.dataset.build,overflow:document.documentElement.scrollWidth>innerWidth}));
   assert.ok(info.build&&info.text.includes('開発版'));assert.equal(info.overflow,false);
  }
  await page.setViewportSize({width:390,height:844});
  fs.mkdirSync('.local-tools/resume-20261010',{recursive:true});
  await page.screenshot({path:'.local-tools/resume-20261010/standard-home.png'});
  await page.locator('#home-create').click();await page.locator('#new-manual').click();
  await page.screenshot({path:'.local-tools/resume-20261010/standard-create.png'});
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS default light: five URL modes, scheduled PCM/release, comparison links, visible deployment build and three widths; PC Chrome only');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
