const {chromium,webkit}=require('../.local-tools/node_modules/playwright'),assert=require('node:assert/strict');
const base=process.env.SAEZURI_BASE||'http://127.0.0.1:8026';
(async()=>{
 for(const [engine,type,options] of [['chrome',chromium,{channel:'chrome'}],['webkit',webkit,process.env.SAEZURI_WEBKIT_PATH?{executablePath:process.env.SAEZURI_WEBKIT_PATH}:{}]]){
  const browser=await type.launch({headless:true,...options});try{
   const page=await browser.newPage({viewport:{width:390,height:740},hasTouch:true,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/probe/saezuri/?view=editor');await page.locator('html[data-app-ui-ready]').waitFor();
   const result=await page.evaluate(async()=>{
    document.body.classList.add('melody-app');
    const {createRestSymbol}=await import('./rest-symbol.js'),{renderTutorialView,highlightTutorialView}=await import('./tutorial-view.js'),{renderScore}=await import('./score.js'),{tutorialPattern,tutorialExcerpt}=await import('./tutorial-data.js'),{TutorialPreview}=await import('./tutorial-preview.js');
    const pixels=[];
    for(const duration of [16,8,4,2,1]){
     const rest=createRestSymbol(duration),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width','32');svg.setAttribute('height','48');svg.setAttribute('viewBox','-16 -24 32 48');svg.style.color='#514479';svg.style.fontFamily='missing-music-font';svg.append(rest);
     const canvas=document.createElement('canvas');canvas.width=32;canvas.height=48;const context=canvas.getContext('2d'),image=new Image(),url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
     try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});context.drawImage(image,0,0);}finally{URL.revokeObjectURL(url);}
     const data=context.getImageData(0,0,32,48).data;let ink=0;for(let i=3;i<data.length;i+=4)if(data[i]>32)ink++;
     pixels.push({kind:rest.dataset.restKind,ink,text:rest.querySelector('text')!==null});
    }
    const pattern=tutorialPattern(),before=JSON.stringify(pattern),tutorial=document.createElement('div'),normal=document.createElement('div');document.querySelector('main').append(tutorial,normal);renderTutorialView(tutorial,pattern,{display:'score'});renderScore(normal,pattern,{fitWidth:true});
    const eighth=tutorial.querySelector('[data-rest-kind="eighth"]'),timing=eighth.closest('[data-start-tick]');highlightTutorialView(tutorial,36);
    const result={pixels,tutorialEighth:tutorial.querySelectorAll('[data-rest-kind="eighth"]').length,normalEighth:normal.querySelectorAll('[data-rest-kind="eighth"]').length,start:timing.dataset.startTick,duration:timing.dataset.durationTick,highlight:timing.hasAttribute('data-playing'),restText:tutorial.querySelectorAll('[data-rest-kind] text').length+normal.querySelectorAll('[data-rest-kind] text').length,unchanged:JSON.stringify(pattern)===before};
    tutorial.remove();normal.remove();const preview=new TutorialPreview({onPlay:()=>{},onStop:()=>{}});preview.setDisplay('score');preview.open(tutorialExcerpt(tutorialPattern({backing:true}),0,64));return result;
   });
   for(const glyph of result.pixels){assert.ok(glyph.ink>=20,engine+'/'+glyph.kind+' draws visible pixels without a music font');assert.equal(glyph.text,false);}
   assert.equal(result.tutorialEighth,1);assert.ok(result.normalEighth>=1);assert.equal(result.start,'36');assert.equal(result.duration,'2');assert.equal(result.highlight,true);assert.equal(result.restText,0);assert.equal(result.unchanged,true);
   for(const [width,height] of [[320,568],[390,740],[768,900]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(()=>document.querySelector('#learning-preview [data-rest-kind="eighth"]').getBoundingClientRect().width>0);
    const bounds=await page.evaluate(()=>{const box=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height};};return {rest:box(document.querySelector('#learning-preview [data-rest-kind="eighth"]')),sheet:box(document.querySelector('#learning-preview')),footer:box(document.querySelector('#learning-preview .sheet-stop')),last:box([...document.querySelectorAll('#learning-preview .tutorial-bar')].at(-1))};});
    assert.ok(bounds.rest.width>0&&bounds.rest.height>0);assert.ok(bounds.sheet.top>=0&&bounds.sheet.bottom<=height+1);assert.ok(bounds.last.bottom<=bounds.footer.top+1,'four measures fit above playback controls');
    if(width===390)await page.screenshot({path:'.local-tools/saezuri-rest-'+engine+'.png'});
   }
   assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',base,engine,checks:'all five rest symbols draw without fonts, tutorial and production, exact rest time and highlighting, unchanged music, three viewport sizes',...result}));
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
