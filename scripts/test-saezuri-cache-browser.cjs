const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../.local-tools/node_modules/playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 let deployed=false;const requests=[];
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname),target=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end();return;}
  requests.push(url.pathname+url.search);const extension=path.extname(target);
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[extension]||'application/octet-stream');
  res.setHeader('Cache-Control',extension==='.html'?'no-store':'public, max-age=31536000, immutable');
  let body=fs.readFileSync(target);
  if(!deployed&&['.html','.js','.css'].includes(extension)){
   body=body.toString('utf8').replace(/\?v=[^'"\s)]+(?=['"])/g,'');
   if(url.pathname.endsWith('/keyboard-controls.js'))body=body.replace("b.dataset.midi=key.midi;b.toggleAttribute('data-reference',key.reference);","b.dataset.midi=key.midi;");
  }
  res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/probe/saezuri/`);
  const create=async()=>{await page.locator('#home-create').click();await page.locator('#new-manual').click();await page.locator('#piano-keys').waitFor();};
  await create();await page.locator('[data-keyboard-octave="-1"]').click();assert.equal(await page.locator('#piano-keys [data-reference]').getAttribute('data-midi'),'48','old cached keyboard leaves color at wrong pitch');
  // Same tab, URL and browser cache. Only the deployment changes.
  deployed=true;await page.reload();await create();await page.locator('[data-keyboard-octave="-1"]').click();assert.equal(await page.locator('#piano-keys [data-reference]').getAttribute('data-midi'),'60','new module graph bypasses old cached imports');
  await page.locator('[data-keyboard-octave="1"]').click();assert.equal(await page.locator('#piano-keys [data-reference]').count(),0);
  assert.ok(requests.some(r=>/^\/probe\/saezuri\/keyboard-controls\.js\?v=/.test(r)),'nested module has fresh URL');assert.ok(requests.some(r=>/^\/probe\/saezuri\/keyboard\.css\?v=/.test(r)),'CSS has fresh URL');assert.ok(!requests.some(r=>/^\/src\/speech\/microphone\.js\?/.test(r)),'shared microphone singleton keeps canonical URL');
  assert.deepEqual(errors,[]);console.log('PASS warm browser cache: old key color reproduced; reload fetches new CSS and nested modules without deleting storage');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
