const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8024';
const detailKeys=['analysisComparison','analysisDiagnostics','unquantizedNotes','onsetCorrections'];
const rows=pattern=>pattern.notes.map(note=>[note.midi,note.startTick,note.durationTick]);
(async()=>{
 const {analyzeFrames,quantizeSegments}=await import('../probe/saezuri/analyzer.js');
 const {buildAnalysisComparison}=await import('../probe/saezuri/analysis-comparison.js');
 const options={tempo:120,endSeconds:8,smoothingMs:120,noteMode:'sustain',maxGapSeconds:.1,minDetectedRatio:.1};
 const frames=Array.from({length:400},(_,i)=>({time:i*.02,kind:'pitched',midi:60+(i%25<12?0:1),rms:.1}));
 const result=analyzeFrames(frames,options),notes=quantizeSegments(result.segments,120);
 const capture={notes,frames,samples:384000,sampleRate:48000,unquantizedNotes:result.segments,onsetCorrections:result.onsetCorrections,
  analysisDiagnostics:{gapDecisions:result.gapDecisions,quantizationAdjustments:[]},analysisComparison:buildAnalysisComparison(frames,options,{result,notes,quantizationAdjustments:[]})};
 const fixture={prototype:'retention-fixture',timestamp:'2026-10-18T00:00:00Z',captureOptions:options,capture},text=JSON.stringify(fixture);
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  for(const scenario of [{variant:'current',query:''},{variant:'detail',query:''},{variant:'unsmoothed',query:''},{variant:'detail',query:'?view=editor'},{variant:'detail',query:'?view=full'}]){
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+'/probe/saezuri/'+scenario.query);await page.locator('#report').waitFor({state:'attached'});await page.waitForFunction(()=>typeof document.querySelector('#capture-import-button').onclick==='function');
   const act=id=>page.locator('#'+id).evaluate(node=>node.click());
   const variantCount=()=>page.locator('#capture-variant').evaluate(node=>[...node.options].filter(option=>!option.disabled).length);
   const report=async()=>{await act('report');return JSON.parse(await page.locator('#metrics').textContent());};
   await page.locator('#capture-import-text').evaluate((node,value)=>node.value=value,text);await act('capture-import-button');
   await page.waitForFunction(()=>!document.querySelector('#review').hidden&&document.querySelector('#status').dataset.state==='idle');
   await page.locator('#capture-variant').evaluate((node,value)=>{node.value=value;node.dispatchEvent(new Event('change'));},scenario.variant);
   const baseline=await report();assert.equal(baseline.captureEditing.variant,scenario.variant);assert.ok(baseline.capture.analysisComparison);
   await act('capture-pitch-up');await act('capture-edit-cancel');
   assert.deepEqual((await report()).capture.analysisComparison,capture.analysisComparison,'cancel retains analysis');
   assert.equal(await variantCount(),3);
   if(!scenario.query&&scenario.variant==='current'){
    await act('preview');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');
    assert.equal(await page.locator('#capture-edit-confirm').isDisabled(),true);await act('capture-edit-confirm');
    assert.equal((await report()).captureEditing.accepted,false);assert.ok((await report()).capture.analysisComparison,'blocked confirmation does not release');await act('stop');
   }
   await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('Denied','NotAllowedError');}}}));
   await act('copy-report');await page.waitForFunction(()=>!document.querySelector('#copy-report').disabled);
   assert.ok((await page.locator('#copy-text').inputValue()).includes('pitchTrace'));
   if(!scenario.query&&scenario.variant==='unsmoothed'){
    await page.evaluate(()=>navigator.clipboard.writeText=()=>new Promise((resolve,reject)=>window.rejectRetentionCopy=reject));await act('copy-report');
    assert.equal(await page.locator('#copy-report').isDisabled(),true);
   }
   if(!scenario.query&&scenario.variant==='detail')await page.locator('#capture-import-text').evaluate(node=>node.value='unsubmitted next input');
   await act('capture-pitch-up');const before=await report(),expected=before.captureEditing.editCandidate;
   await act('capture-edit-confirm');const confirmed=await report();
   assert.deepEqual(confirmed.captureCandidate,expected);assert.equal(confirmed.captureEditing.variant,scenario.variant);assert.equal(confirmed.captureEditing.undoDepth,before.captureEditing.undoDepth);
   if(scenario.query==='?view=full'){
    for(const key of detailKeys)assert.deepEqual(confirmed.capture[key],capture[key],key+' retained in full view');
    assert.equal(confirmed.capture.detailsReleased,undefined);assert.equal(await variantCount(),3);
    assert.equal(await page.locator('#capture-import-text').inputValue(),text);assert.ok((await page.locator('#copy-text').inputValue()).includes('pitchTrace'));
   }else{
    assert.equal(confirmed.capture.detailsReleased,true);for(const key of detailKeys)assert.equal(confirmed.capture[key],undefined,key+' released');
    assert.deepEqual(confirmed.capture.frames,baseline.capture.frames);assert.equal(await page.locator('#capture-variant').isDisabled(),true);
    assert.equal(await variantCount(),1);
    assert.equal(await page.locator('#copy-text').inputValue(),'');assert.equal(await page.locator('#capture-import-text').inputValue(),!scenario.query&&scenario.variant==='detail'?'unsubmitted next input':'');
    if(scenario.variant==='unsmoothed'){
     await page.evaluate(()=>window.rejectRetentionCopy(new DOMException('Denied','NotAllowedError')));await page.waitForFunction(()=>!document.querySelector('#copy-report').disabled);
     const fallback=JSON.parse(await page.locator('#copy-text').inputValue());assert.equal(fallback.capture.detailsReleased,true);assert.equal(fallback.capture.analysisComparison,undefined,'late clipboard failure cannot restore traces');
    }
   }
   await act('capture-edit-undo');const undone=await report();assert.deepEqual(rows(undone.captureEditing.editCandidate),rows(baseline.captureCandidate));assert.deepEqual(undone.captureCandidate,expected,'Undo leaves confirmed score until next OK');
   await act('capture-edit-confirm');const again=await report();await act('capture-edit-confirm');const twice=await report();
   assert.deepEqual(twice.captureEditing,again.captureEditing);assert.deepEqual(twice.captureCandidate,again.captureCandidate);assert.deepEqual(twice.capture,again.capture);
   if(!scenario.query){
    await page.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');await page.reload();await page.locator('#home-songs').click();await page.locator('[data-song-open]').first().click();
    if(await page.locator('#song-continue').isVisible())await page.locator('#song-continue').click();
    const restored=await report();assert.deepEqual(restored.captureCandidate,again.captureCandidate);assert.equal(restored.captureEditing.undoDepth,0);assert.equal(restored.capture,null);
   }
   assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${scenario.query||'normal'} ${scenario.variant}: cancel, confirmation, selected Undo, repeated OK, clipboard${scenario.query?'':', save/reopen'}`);
  }
  const recordingContext=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],serviceWorkers:'block'});
  await recordingContext.addInitScript(()=>{
   window.retentionWorkerRuns=0;window.retentionTracks=[];
   const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async options=>{const stream=await gum(options);window.retentionTracks.push(...stream.getTracks());return stream;};
   // Keep the real capture worklet/timing/stream lifecycle. Supply deterministic
   // pitch diagnostics at the Worker boundary, not real-device pitch accuracy.
   window.Worker=class{
    constructor(url){this.url=String(url);this.terminated=false;}
    async postMessage(data){try{
     const {analyzeFrames,quantizeSegments}=await import(new URL('./analyzer.js',this.url).href),{buildAnalysisComparison}=await import(new URL('./analysis-comparison.js',this.url).href);
     const bars=data.options.loop?.bars??4,endSeconds=bars*240/data.tempo;
     const frames=Array.from({length:Math.ceil(endSeconds*50)},(_,i)=>({time:i*.02,kind:'pitched',midi:i*.02<endSeconds/2?72:74,rms:.1}));
     const settings={...data.options,tempo:data.tempo,endSeconds},result=analyzeFrames(frames,settings),notes=quantizeSegments(result.segments,data.tempo,bars*16);
     const output={sessionId:data.sessionId,bars,notes,frames,samples:data.samples.length,sampleRate:data.sampleRate,
      unquantizedNotes:result.segments,onsetCorrections:result.onsetCorrections,analysisDiagnostics:{gapDecisions:result.gapDecisions},
      analysisComparison:buildAnalysisComparison(frames,settings,{result,notes,quantizationAdjustments:[]})};
     window.retentionWorkerRuns++;if(!this.terminated)this.onmessage?.({data:output});
    }catch(error){this.onerror?.(error);}}
    terminate(){this.terminated=true;}
   };
  });
  const recording=await recordingContext.newPage(),recordingErrors=[];recording.on('pageerror',error=>recordingErrors.push(error.message));
  await recording.goto(base+'/probe/saezuri/');await recording.locator('#report').waitFor({state:'attached'});await recording.waitForFunction(()=>typeof document.querySelector('#capture-import-button').onclick==='function');
  const recordAct=id=>recording.locator('#'+id).evaluate(node=>node.click());
  const recordingReport=async()=>{await recordAct('report');return JSON.parse(await recording.locator('#metrics').textContent());};
  await recording.locator('#capture-import-text').evaluate((node,value)=>node.value=value,text);await recordAct('capture-import-button');await recordAct('capture-edit-confirm');
  assert.equal((await recordingReport()).capture.detailsReleased,true);
  await revealCreationControl(recording,'#image-settings-open');await recording.locator('#image-settings-open').click();await recording.locator('#image-enabled').check();await recording.locator('#backing-settings-close').click();await recordAct('capture-edit-confirm');
  await recording.locator('#screen-settings').click();await recording.locator('#tempo').fill('180');await recording.locator('#tempo').dispatchEvent('change');await recording.locator('#settings-close').click();
  const original=(await recordingReport()).captureCandidate;
  await recording.waitForFunction(()=>!document.querySelector('#loop-record').disabled);await recordAct('loop-record');
  await recording.waitForFunction(()=>window.retentionWorkerRuns===1&&document.querySelector('#status').dataset.state==='idle',null,{timeout:22000});
  const taken=await recordingReport();assert.ok(taken.capture.analysisComparison);assert.equal(taken.capture.detailsReleased,undefined);assert.deepEqual(taken.captureCandidate,original);
  assert.equal(taken.capture.samples,Math.round(taken.capture.sampleRate*16/3));assert.equal(await recording.evaluate(()=>retentionTracks.length>0&&retentionTracks.every(track=>track.readyState==='ended')),true);
  const retake=taken.captureEditing.editCandidate;
  await recordAct('capture-edit-cancel');assert.ok((await recordingReport()).capture.analysisComparison,'cancelled retake retains diagnostics');
  await recordAct('capture-edit-undo');assert.deepEqual((await recordingReport()).captureEditing.editCandidate,retake);await recordAct('capture-edit-confirm');
  const retaken=await recordingReport();assert.equal(retaken.capture.detailsReleased,true);assert.deepEqual(retaken.captureCandidate,retake);
  await recordAct('capture-edit-undo');const prior=await recordingReport();assert.deepEqual(prior.captureEditing.editCandidate,original,'retake Undo restores the prior melody and backing after detail release');
  await recordAct('capture-edit-confirm');await recording.waitForFunction(()=>document.querySelector('#song-status').dataset.saved==='true');
  await recording.reload();await recording.locator('#home-songs').click();await recording.locator('[data-song-open]').first().click();if(await recording.locator('#song-continue').isVisible())await recording.locator('#song-continue').click();
  assert.deepEqual((await recordingReport()).captureCandidate,original);assert.deepEqual(recordingErrors,[]);await recordingContext.close();
  console.log('PASS new loop retake after release: real worklet/fake mic, fresh diagnostics, cancel/undo/confirm, stream release and saved prior melody/backing');
  // Exercise the public editor failure guard without making the app's private
  // edit state writable. The original full-view editor is still closed here.
  const page=await browser.newPage();await page.goto(base+'/probe/saezuri/?view=full');await page.locator('#report').waitFor({state:'attached'});await page.waitForFunction(()=>typeof document.querySelector('#capture-import-button').onclick==='function');
  const guard=await page.evaluate(async fixture=>{
   const {CaptureEditorView}=await import('./capture-editor-view.js');let confirmed=0;
   const editor=new CaptureEditorView({onChange:change=>{if(change.confirmed)confirmed++;}});editor.load(fixture.capture,fixture.captureOptions);
   const initial=editor.releaseAnalysisVariants();editor.inputNote({midi:200,durationTick:2});editor.command('confirm');
   const failed=editor.snapshot(),released=editor.releaseAnalysisVariants(),available=[...document.querySelector('#capture-variant').options].filter(option=>!option.disabled).length;
   editor.command('cancel');editor.setBusy(true);editor.command('confirm');const busyReleased=editor.releaseAnalysisVariants();editor.setBusy(false);editor.command('up');editor.command('confirm');
   const before=editor.snapshot(),releasedSuccess=editor.releaseAnalysisVariants(),after=editor.snapshot();editor.releaseAnalysisVariants();editor.command('undo');
   return {initial,failed,released,available,busyReleased,confirmed,releasedSuccess,before,after,undone:editor.snapshot()};
  },fixture);
  assert.equal(guard.initial,false);assert.equal(guard.failed.inputError,'NOTE_PITCH');assert.equal(guard.failed.accepted,false);assert.equal(guard.released,false);assert.equal(guard.available,3);assert.equal(guard.busyReleased,false);
  assert.equal(guard.confirmed,1);assert.equal(guard.releasedSuccess,true);assert.deepEqual(guard.after,guard.before);assert.equal(guard.undone.undoDepth,guard.after.undoDepth-1);
  await page.close();console.log('PASS public editor: invalid/busy/unconfirmed release refused, successful/repeated release preserves selected session and Undo');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
