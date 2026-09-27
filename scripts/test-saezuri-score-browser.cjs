const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/probe/saezuri/');
  await page.locator('#score svg').first().waitFor();
  const midiBefore=await page.locator('#score [data-midi]').evaluateAll(nodes=>nodes.map(n=>n.dataset.midi));
  const autoFifths=await page.locator('#score-key-label').getAttribute('data-fifths');
  await page.locator('#score-key-flat').click();
  assert.match(await page.locator('#score-key-label').innerText(),/手動/);
  assert.deepEqual(await page.locator('#score [data-midi]').evaluateAll(nodes=>nodes.map(n=>n.dataset.midi)),midiBefore);
  await page.locator('#score-key-auto').click();
  assert.equal(await page.locator('#score-key-label').getAttribute('data-fifths'),autoFifths);
  for(let i=0;i<15;i++)if(await page.locator('#score-key-flat').isEnabled())await page.locator('#score-key-flat').click();
  assert.equal(await page.locator('#score-key-label').getAttribute('data-fifths'),'-7');
  assert.equal(await page.locator('#score-key-flat').isDisabled(),true);
  for(let i=0;i<14;i++)await page.locator('#score-key-sharp').click();
  assert.equal(await page.locator('#score-key-sharp').isDisabled(),true);
  assert.equal(await page.locator('#score-key-label').getAttribute('data-fifths'),'7');
  const notation=await page.evaluate(async()=>{
   const {renderScore}=await import('./score.js');
   const container=document.createElement('div');
   const draw=(notes,fifths)=>{
    renderScore(container,{bars:4,gridStep:1,notes:notes.map(([startTick,durationTick,midi],i)=>({id:String(i),startTick,durationTick,midi}))},{fifths});
    return {keys:[...container.querySelectorAll('[data-key-signature]')].map(g=>g.textContent),
     notes:[...container.querySelectorAll('[data-note-id]')].map(g=>({id:g.dataset.noteId,tick:Number(g.dataset.startTick),midi:Number(g.dataset.midi),sign:[...g.querySelectorAll('text')].map(t=>t.textContent).join(''),title:g.querySelector('title').textContent}))};
   };
   return {
    sharp:draw([[0,4,66],[4,4,65],[8,4,66],[16,4,66]],1),
    flat:draw([[0,4,70],[4,4,71],[8,4,70],[16,4,70]],-1),
    tied:draw([[12,8,65],[20,4,65],[24,4,66]],1),
    cb:draw([[0,4,59]],-7),bs:draw([[0,4,60]],7)
   };
  });
  assert.deepEqual(notation.sharp.keys,['♯','♯','♯','♯']);
  assert.deepEqual(notation.sharp.notes.map(n=>n.sign),['','♮','♯','']);
  assert.deepEqual(notation.flat.keys,['♭','♭','♭','♭']);
  assert.deepEqual(notation.flat.notes.map(n=>n.sign),['','♮','♭','']);
  assert.deepEqual(notation.tied.notes.map(n=>n.sign),['♮','♮','♮','♯']);
  assert.match(notation.cb.notes[0].title,/C♭4/);assert.equal(notation.cb.notes[0].sign,'');
  assert.match(notation.bs.notes[0].title,/B♯3/);assert.equal(notation.bs.notes[0].sign,'');
  await page.screenshot({path:'.local-tools/saezuri-key-signature.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',base,autoFifths,notation}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
