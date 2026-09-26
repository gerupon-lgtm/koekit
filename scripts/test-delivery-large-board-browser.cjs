const {chromium}=require('../.local-tools/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.DELIVERY_BASE||'http://127.0.0.1:8001';
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
  const p=await b.newPage({serviceWorkers:'block'});
  await p.route('**/src/speech/index.js',r=>r.fulfill({contentType:'application/javascript',body:'export function createSpeechInput(){return {on(){},off(){},start(){},stop(){},dispose(){}}}'}));
  await p.goto(base+'/delivery/');const results=[];
  for(const size of [5,7,9]){
    await p.evaluate(async size=>{const {generate}=await import('/delivery/generator.js'),{createSession}=await import('/delivery/run.js'),{DeliveryStorage}=await import('/delivery/storage.js');const level=(size-1)/2,store=new DeliveryStorage();const result=store.save('session',createSession(generate(73,level,{difficulty:'hard'}),{level,difficulty:'hard'}),store.load('session').revision);if(!result.ok)throw Error(result.code)},size);
    await p.reload();await p.locator('#level-list button').last().waitFor();await p.locator('#resume').click();
    for(const [width,height,minBoard] of [[320,568,180],[360,640,220],[390,740,250],[390,844,350],[478,1004,440],[768,1024,530]]){
      await p.setViewportSize({width,height});await p.evaluate(()=>document.fonts.ready);
      for(const denied of [false,true]){
        await p.evaluate(denied=>{document.querySelector('#mic-notice').hidden=!denied},denied);
        const metrics=await p.evaluate(()=>{const board=document.querySelector('#board').getBoundingClientRect(),key=document.querySelector('.board-key').getBoundingClientRect(),execute=document.querySelector('#execute').getBoundingClientRect();return {board:board.width,boardBottom:board.bottom,keyTop:key.top,executeBottom:execute.bottom,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth}});
        assert.ok(metrics.scrollHeight<=height+1&&metrics.scrollWidth<=width,JSON.stringify({size,width,height,denied,metrics}));
        assert.ok(metrics.board>= (denied?minBoard-70:minBoard),JSON.stringify({size,width,height,denied,metrics}));
        assert.ok(metrics.boardBottom<=metrics.keyTop+1);assert.ok(metrics.executeBottom<=height);
        results.push({size,width,height,denied,...metrics});
        if(size===5&&width===390&&height===844&&!denied)await p.screenshot({path:'.local-tools/delivery/large-board-5x5-390.png'});
      }
    }
  }
  fs.writeFileSync('.local-tools/delivery/large-board-geometry.json',JSON.stringify(results,null,2));
  console.log('5/7/9 grids × 6 mobile/tablet viewports × voice/denied: 36 larger boards, visible legend/execute and no page overflow passed');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
