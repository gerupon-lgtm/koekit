// Deployment metadata only: preserve native ES modules and shared voice state.
const fs=require('node:fs');
const path=require('node:path');
function stampTrialAssets(root,build){
 const directories=['probe/saezuri','probe/fm-polyphony','probe/light-sound','saezuri'].map(name=>path.join(root,name));
 const owned=target=>directories.some(directory=>target.startsWith(directory+path.sep));
 const startup=target=>['app-startup.js','app-startup.css'].some(name=>target===path.join(root,'src/ui',name));
 let changed=0;
 function stamp(file,startupOnly=false){
   const before=fs.readFileSync(file,'utf8');
   const after=before.replace(/(["'])((?:\.{1,2}\/)[^"'\s?#]+\.(?:m?js|css))(\?[^"'\s#]*)?\1/g,(match,quote,reference,query='')=>{
    const target=path.resolve(path.dirname(file),reference);
    if(startupOnly&&!startup(target))return match;
    // The startup script has no imports or shared voice state.
    if(/\.m?js$/.test(reference)&&!owned(target)&&!startup(target))return match;
    if(!fs.existsSync(target))return match;
    const params=new URLSearchParams(query.slice(1));params.set('v',build);
    return quote+reference+'?'+params.toString()+quote;
   });
   if(after!==before){fs.writeFileSync(file,after);changed++;}
 }
 function visit(directory){
  if(!fs.existsSync(directory))return;
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
   const file=path.join(directory,entry.name);if(entry.isDirectory()){visit(file);continue;}
   if(!/\.(m?js|css|html)$/.test(file))continue;
   stamp(file);
  }
 }
 for(const directory of directories)visit(directory);
 for(const name of ['doubutsu','kioku','irodori','jintori','delivery','story']){
  const file=path.join(root,name,'index.html');if(fs.existsSync(file))stamp(file,true);
 }
 return changed;
}
module.exports={stampTrialAssets};
