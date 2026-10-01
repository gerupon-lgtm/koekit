// Deployment metadata only: preserve native ES modules and shared voice state.
const fs=require('node:fs');
const path=require('node:path');
function stampTrialAssets(root,build){
 const directories=['probe/saezuri','saezuri'].map(name=>path.join(root,name));
 const owned=target=>directories.some(directory=>target.startsWith(directory+path.sep));
 let changed=0;
 function visit(directory){
  if(!fs.existsSync(directory))return;
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
   const file=path.join(directory,entry.name);if(entry.isDirectory()){visit(file);continue;}
   if(!/\.(js|css|html)$/.test(file))continue;
   const before=fs.readFileSync(file,'utf8');
   const after=before.replace(/(["'])((?:\.{1,2}\/)[^"'\s?#]+\.(?:js|css))(\?[^"'\s#]*)?\1/g,(match,quote,reference,query='')=>{
    const target=path.resolve(path.dirname(file),reference);
    // Tagging shared JS would create a second microphone-state singleton.
    if(reference.endsWith('.js')&&!owned(target))return match;
    if(!fs.existsSync(target))return match;
    const params=new URLSearchParams(query.slice(1));params.set('v',build);
    return quote+reference+'?'+params.toString()+quote;
   });
   if(after!==before){fs.writeFileSync(file,after);changed++;}
  }
 }
 for(const directory of directories)visit(directory);
 return changed;
}
module.exports={stampTrialAssets};
