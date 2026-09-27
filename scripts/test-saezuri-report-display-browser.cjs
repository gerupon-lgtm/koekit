const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/probe/saezuri/');await page.locator('#score svg').first().waitFor();
  const original=await page.locator('#score [data-note-id]').evaluateAll(nodes=>nodes.map(n=>({midi:n.dataset.midi,tick:n.dataset.startTick,y:Number(n.querySelector('ellipse').getAttribute('cy'))})));
  await page.locator('#score-octave-up').click();
  const raised=await page.locator('#score [data-note-id]').evaluateAll(nodes=>nodes.map(n=>({midi:n.dataset.midi,tick:n.dataset.startTick,y:Number(n.querySelector('ellipse').getAttribute('cy'))})));
  assert.deepEqual(raised,original.map(n=>({...n,y:n.y-42})));
  assert.equal(await page.locator('#score [data-octave-clef="1"]').count(),4);
  assert.equal(await page.locator('#score-octave-up').getAttribute('aria-pressed'),'true');
  await page.locator('#score-octave-down').click();
  assert.equal(await page.locator('#score [data-note-id] ellipse').first().getAttribute('cy'),String(original[0].y+42));
  await page.locator('#score-octave-original').click();
  assert.equal(await page.locator('#score [data-octave-clef]').count(),0);
  assert.equal(await page.locator('#score [data-note-id] ellipse').first().getAttribute('cy'),String(original[0].y));

  // Stub only the OS boundary: exercise the click handler without overwriting
  // the developer's clipboard. Success, pending and denial are deterministic.
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{window.copied=text;return new Promise(resolve=>window.finishCopy=resolve);}}}));
  await page.locator('#conditions').fill('Windows11 コピーの確認');
  await page.locator('#copy-report').click();
  assert.equal(await page.locator('#copy-report').isDisabled(),true);
  await page.evaluate(()=>window.finishCopy());
  await page.waitForFunction(()=>document.querySelector('#copy-status').textContent.includes('コピーしました'));
  const copied=await page.evaluate(()=>window.copied);
  assert.equal(copied,await page.locator('#metrics').innerText());
  assert.equal(JSON.parse(copied).conditions,'Windows11 コピーの確認');
  assert.equal(JSON.parse(copied).prototype,'ML-T01-v12');
  await page.evaluate(()=>navigator.clipboard.writeText=async()=>{throw new DOMException('Denied','NotAllowedError');});
  await page.locator('#conditions').fill('最新の所感');
  await page.locator('#copy-report').click();
  assert.equal(await page.locator('#copy-fallback').isVisible(),true);
  assert.equal(JSON.parse(await page.locator('#copy-text').inputValue()).conditions,'最新の所感');
  assert.equal(await page.locator('#copy-text').evaluate(e=>e.selectionEnd-e.selectionStart),await page.locator('#copy-text').inputValue().then(s=>s.length));
  assert.equal(await page.locator('#copy-report').isEnabled(),true);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
  await page.locator('#copy-report').click();
  assert.equal(await page.locator('#copy-fallback').isVisible(),true);
  await page.evaluate(async()=>{
   const {renderScore}=await import('./score.js');
   const notes=[54,51,52,54,49,51,47].map((midi,i)=>({id:String(i),midi,startTick:i*8,durationTick:6}));
   const pattern={bars:4,gridStep:1,notes},before=JSON.stringify(pattern);
   const box=document.createElement('div');box.id='octave-fixture';box.className='score';document.querySelector('main').append(box);
   renderScore(box,pattern,{fifths:5,displayOctave:1});
   if(JSON.stringify(pattern)!==before)throw new Error('display changed notes');
  });
  await page.locator('#octave-fixture').screenshot({path:'.local-tools/saezuri-octave.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',base,clipboard:'stubbed OS boundary: success/pending/denied/unavailable',octave:'up/down/reset, unchanged MIDI/timing'}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
