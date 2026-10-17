// Compare deployed bytes with Git blobs, so Windows checkout line endings do not affect the result.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=(process.env.SAEZURI_BASE||'https://koekit.sikumilab.com').replace(/\/$/,'');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const tracked=execFileSync('git',['ls-files','--','probe/saezuri','saezuri','probe/light-sound','probe/fm-polyphony'],{encoding:'utf8'}).trim().split('\n');
const files=[...new Set(['index.html','styles.css','manifest.json','sw-register.js','sw.js','version.json','assets/brand/saezurhythm.svg',...tracked.filter(p=>/\.(?:html|m?js|css|json)$/.test(p))])].sort();
const folder='.local-tools/saezuri-entry-20261018',hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 assert.equal(new URL(base).protocol,'https:');const results=[];
 for(let i=0;i<files.length;i+=4){
  const group=await Promise.all(files.slice(i,i+4).map(async file=>{
   const expected=execFileSync('git',['show',commit+':'+file]),url=new URL(file,base+'/');url.searchParams.set('verify',commit);
   const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
   const bytes=Buffer.from(await response.arrayBuffer()),type=response.headers.get('content-type')||'';
   const validType=/\.html$/.test(file)?/text\/html/.test(type):/\.m?js$/.test(file)?/(?:application|text)\/(?:java|ecma)script/.test(type):/\.css$/.test(file)?/text\/css/.test(type):/\.svg$/.test(file)?/image\/svg\+xml/.test(type):/(?:application\/json|text\/plain)/.test(type);
   return {file,status:response.status,type,length:bytes.length,expectedLength:expected.length,sha256:hash(bytes),expectedSha256:hash(expected),https:new URL(response.url).protocol==='https:',pass:response.ok&&validType&&bytes.equals(expected)&&new URL(response.url).protocol==='https:'};
  }));results.push(...group);
 }
 fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/public-assets.json',JSON.stringify({base,commit,results},null,2));
 const failed=results.filter(r=>!r.pass);if(failed.length)console.error(JSON.stringify(failed,null,2));
 assert.equal(failed.length,0,'all public assets match the committed bytes, type and HTTPS');
 console.log(JSON.stringify({result:'PASS',base,commit,files:results.length,checks:'HTTPS, status, content type, length, SHA-256'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
