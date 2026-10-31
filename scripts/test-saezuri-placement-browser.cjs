const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.stack);});
  const report=async()=>{await page.locator('#report').evaluate(n=>n.click());return JSON.parse(await page.locator('#metrics').textContent());};
  const names=()=>page.locator('#sequence-line [data-placement]').allTextContents();
  const connect=async()=>{if(await page.locator('#melody-create').isVisible())await page.locator('#work-connect').click();};
  const saved=()=>page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');
  const reopen=async()=>{await saved();await page.reload();await page.locator('#home-songs').click();await page.locator('[data-song-open]').first().click();if(await page.locator('#song-continue').isVisible())await page.locator('#song-continue').click();};
  await page.goto(base+'/probe/saezuri/');await page.locator('#home-create').click();await page.locator('#new-manual').click();
  await revealCreationControl(page,'[data-pitch="0"]');await page.locator('[data-pitch="0"]').click();await page.locator('#capture-edit-confirm').click();
  await revealCreationControl(page,'#phrase-name');await page.locator('#phrase-name').fill('A');await page.locator('#keep-phrase').click();
  const sourceId=await page.locator('[data-phrase]').getAttribute('data-phrase');
  await page.locator('[data-mode="edit"]').click();await page.locator('#capture-pitch-up').click();const original=await report();
  assert.equal(original.captureEditing.pending,true);assert.ok(original.captureEditing.undoDepth>0);
  const normalHeaders={};for(const width of [320,390,844,1280]){await page.setViewportSize({width,height:844});normalHeaders[width]=await page.locator('#melody-create .screen-heading').evaluate(n=>n.getBoundingClientRect().height);}await page.setViewportSize({width:390,height:844});
  await connect();
  for(let i=0;i<2;i++){await page.locator(`[data-phrase="${sourceId}"]`).click();await page.locator('#sequence-confirm').click();}
  await page.locator('#sequence-line [data-placement]').first().click();await page.locator('#sequence-edit').click();
  await page.locator('#placement-edit-hint').waitFor();assert.equal((await report()).captureCandidate.notes[0].midi,60);
  for(const width of [320,390,844,1280]){await page.setViewportSize({width,height:844});const header=await page.locator('#melody-create .screen-heading').evaluate(n=>{const r=n.getBoundingClientRect(),t=n.querySelector('h2').getBoundingClientRect();return {height:r.height,center:Math.abs((t.left+t.right-innerWidth)/2)};});assert.ok(header.height<=normalHeaders[width]+1,'editing header stays compact '+width);assert.ok(header.center<2,'title stays centered '+width);}await page.setViewportSize({width:390,height:844});
  await page.locator('#capture-pitch-up').click();await page.locator('#capture-edit-confirm').click();await page.locator('#melody-connect').waitFor();
  assert.deepEqual(await names(),['1. A 1','2. A']);
  const derivedId=await page.locator('[data-phrase]').last().getAttribute('data-phrase');
  const restored=await report();assert.deepEqual(restored.captureEditing,original.captureEditing);assert.deepEqual(restored.captureCandidate,original.captureCandidate);
  assert.equal(await page.locator(`[data-phrase-remove="${sourceId}"]`).isDisabled(),true);
  // Other placements still point to the original sound; cancelling preserves both workspaces.
  await page.locator('#sequence-line [data-placement]').nth(1).click();await page.locator('#sequence-edit').click();assert.equal((await report()).captureCandidate.notes[0].midi,60);
  await page.locator('#capture-pitch-down').click();await page.locator('#preview').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');await page.locator('#placement-cancel').click();
  assert.equal(await page.locator('#status').getAttribute('data-state'),'idle');assert.deepEqual(await names(),['1. A 1','2. A']);
  assert.deepEqual((await report()).captureEditing,original.captureEditing);
  const choose=async()=>{await page.locator('#sequence-replace').click();await page.locator(`[data-replacement="${derivedId}"]`).click();};
  await choose();assert.deepEqual(await names(),['1. A 1','2. A 1']);await page.locator('#sequence-undo').click();assert.deepEqual(await names(),['1. A 1','2. A']);
  await choose();await page.locator('#sequence-confirm').click();assert.equal(await page.locator(`[data-phrase-remove="${sourceId}"]`).isEnabled(),true);
  await page.locator(`[data-phrase-remove="${sourceId}"]`).click();await page.locator('#sequence-confirm').click();assert.equal(await page.locator(`[data-phrase="${sourceId}"]`).count(),0);
  await page.locator('#sequence-undo').click();assert.equal(await page.locator(`[data-phrase="${sourceId}"]`).count(),1);assert.deepEqual(await names(),['1. A 1','2. A 1']);
  // A saved in-progress placement resumes separately from the original creation draft.
  await reopen();assert.equal((await report()).captureEditing.undoDepth,0);await connect();await page.locator('#sequence-line [data-placement]').first().click();await page.locator('#sequence-edit').click();
  await page.locator('#capture-pitch-up').click();assert.equal((await report()).captureEditing.editCandidate.notes[0].midi,62);
  await reopen();await page.locator('#placement-edit-hint').waitFor();assert.equal((await report()).captureEditing.editCandidate.notes[0].midi,62);
  await page.locator('#placement-cancel').click();const main=await report();assert.equal(main.captureEditing.editCandidate.notes[0].midi,61);assert.equal(main.captureEditing.undoDepth,0);
  await page.locator('#sequence-edit').click();await page.locator('#capture-pitch-up').click();await page.locator('#capture-edit-confirm').click();await page.locator('#melody-connect').waitFor();
  assert.deepEqual(await names(),['1. A 2','2. A 1']);
  // Phrase deletion is a candidate, and Undo of a derivation keeps its reusable copy.
  await page.locator('#sequence-undo').click();assert.deepEqual(await names(),['1. A 1','2. A 1']);assert.equal(await page.locator('[data-phrase]').count(),3);
  // Per-note entry confirmation stays in the editor; the following OK applies the placement.
  await page.locator('#sequence-edit').click();await page.locator('[data-mode="input"]').click();await revealCreationControl(page,'#composer-replace');await page.locator('#composer-replace').check();
  await page.locator('[data-pitch="4"]').click();await page.locator('#capture-edit-confirm').click();assert.equal(await page.locator('#placement-edit-hint').isVisible(),true);assert.equal(await page.locator('#capture-edit-confirm').isEnabled(),true);
  await page.locator('#capture-edit-confirm').click();await page.locator('#melody-connect').waitFor();assert.deepEqual(await names(),['1. A 3','2. A 1']);
  await page.locator('#sequence-replace').click();await page.locator('[data-replacement-listen]').first().click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
  assert.equal(await page.locator('[data-replacement]').last().isDisabled(),true);await page.locator('#placement-replace-close').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='idle');
  for(const width of [320,390,844,1280]){
   await page.setViewportSize({width,height:844});
   const layout=await page.evaluate(()=>{
    const groups=['.sequence-edit','.sequence-actions','#phrase-shelf'];let overlap=false;
    for(const group of groups){const rects=[...document.querySelectorAll(group+' button')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect());for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)overlap=true;}}
    return {overlap,overflow:document.documentElement.scrollWidth>innerWidth};
   });assert.deepEqual(layout,{overlap:false,overflow:false},'layout '+width);
  }
  assert.deepEqual(errors,[]);console.log('PASS placement derivation, source/other placements, parked Undo, cancel, explicit replacement, safe deletion/Undo, saved edit resume, audition close and four widths');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
