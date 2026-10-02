const { chromium } = require('../.local-tools/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs');
const base = process.env.SAEZURI_BASE || 'http://127.0.0.1:8018';
(async () => {
 const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--autoplay-policy=no-user-gesture-required'] });
 try {
  const page = await browser.newPage({ viewport:{width:390,height:844}, serviceWorkers:'block' }), errors=[];
  page.on('pageerror',error=>errors.push(error.message)); await page.goto(base+'/probe/light-sound/?testDuration=1');
  const pcm = await page.evaluate(async () => {
   const token=new URL(document.querySelector('script[type=module]').src).searchParams.get('v'), suffix=token?'?v='+token:'';
   const {createLightVoice}=await import('../saezuri/light-voice.js'+suffix), rate=48000;
   const rms=(data,a,b)=>{let sum=0;for(let i=Math.round(a*rate);i<Math.round(b*rate);i++)sum+=data[i]**2;return Math.sqrt(sum/((b-a)*rate));};
   const render=async instrument=>{const ctx=new OfflineAudioContext(1,5*rate,rate);const voice=createLightVoice(ctx,ctx.destination,{instrument,midi:69,time:.1,duration:3.2});const data=(await ctx.startRendering()).getChannelData(0);return {data,count:voice.oscillatorCount};};
   const piano=await render('piano'), fm=await render('fm-piano'), bell=await render('wood');
   const difference=Float32Array.from(fm.data,(value,i)=>value-piano.data[i]);
   const amplitude=(data,hz,a,b)=>{let re=0,im=0;const start=Math.round(a*rate),end=Math.round(b*rate);for(let i=start;i<end;i++){const angle=2*Math.PI*hz*i/rate;re+=data[i]*Math.cos(angle);im+=data[i]*Math.sin(angle);}return 2*Math.hypot(re,im)/(end-start);};
   const rows=[];for(const instrument of ['strings','brass','synth-bass','lead']){const {data,count}=await render(instrument);rows.push({instrument,count,late:rms(data,2,3),silence:rms(data,4,4.2),finite:data.every(Number.isFinite)});}
   return {fmDifference:rms(difference,.12,.5),bellMetal:amplitude(bell.data,1100,.6,.8),bellRoot:amplitude(bell.data,440,.6,.8),rows};
  });
  assert.ok(pcm.fmDifference>.02,'FM electric piano differs audibly in its waveform from the retained piano');
  assert.ok(pcm.bellMetal>.001 && pcm.bellRoot>.001,'bell retains pitched carrier and inharmonic metal overtone during decay');
  for(const row of pcm.rows){assert.ok(row.finite && row.late>.01,JSON.stringify(row));assert.equal(row.silence,0);assert.ok(row.count<=2);}
  for(const engine of ['light','simple']) {
   await page.locator('#engine').selectOption(engine);await page.locator('#count').selectOption('6');
   for(const instrument of ['fm-piano','synth-bass','strings','brass','lead','wood']) {
    await page.locator('#scenario').selectOption(instrument);await page.locator('#mode').selectOption('repeat');await page.locator('#listen').click();
    await page.waitForFunction(()=>!document.querySelector('#heard').hidden,null,{timeout:8000});await page.locator('#clean').click();
   }
  }
  await page.locator('#engine').selectOption('classic');
  assert.equal(await page.locator('#scenario').inputValue(),'wood');
  for(const id of ['fm-piano','synth-bass','strings','brass'])assert.equal(await page.locator(`[data-audition="${id}"]`).isDisabled(),true);
  await page.locator('.more-sounds>summary').click();
  for(const width of [320,390,844]){
   await page.setViewportSize({width,height:844});const layout=await page.evaluate(()=>{const boxes=[...document.querySelectorAll('.samples button')].map(n=>n.getBoundingClientRect());return {overflow:document.documentElement.scrollWidth>innerWidth,touch:boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.left<b.right+7.9&&a.right+7.9>b.left&&a.top<b.bottom+7.9&&a.bottom+7.9>b.top))};});assert.ok(!layout.overflow&&!layout.touch);
  }
  fs.mkdirSync('.local-tools/light-timbres-check',{recursive:true});fs.writeFileSync('.local-tools/light-timbres-check/pcm.json',JSON.stringify(pcm,null,2));assert.deepEqual(errors,[]);
  console.log('PASS tone revision: FM difference, bell metal overtones, long strings/brass/bass/lead, 12 six-note trials, clean release, three widths; PC only');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
