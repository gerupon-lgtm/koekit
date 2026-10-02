const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {stampTrialAssets}=require('./stamp-trial-assets.cjs');
test('deployment token reaches CSS, the module graph and workers without duplicating shared state',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'koekit-cache-'));
 try{
  const write=(name,text)=>{fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),text);};
  write('probe/saezuri/index.html','<link href="../../styles.css"><link href="./keyboard.css"><script src="./app.js"></script>');
  write('styles.css','body{}');write('probe/saezuri/keyboard.css','button{}');
  write('probe/saezuri/app.js',"import './keyboard-controls.js';import '../../src/speech/microphone.js';new Worker(new URL('./worker.js',import.meta.url));");
  write('probe/saezuri/keyboard-controls.js',"import {pianoKeys} from './tap-recording.js';");write('probe/saezuri/tap-recording.js',"import '../../saezuri/document.js';");
  write('probe/saezuri/worker.js',"import '../../saezuri/document.js';");write('saezuri/document.js','export const value=1;');write('src/speech/microphone.js','let enabled=true;');
  write('probe/fm-polyphony/index.html','<script src="./main.js"></script>');
  write('probe/fm-polyphony/main.js',"import './config.js';new Worker('./worker.js');audioWorklet.addModule('./live-worklet.js');");
  write('probe/fm-polyphony/config.js','export const test=1;');
  write('probe/light-sound/index.html','<link href="./style.css"><script src="./main.js"></script>');
  write('probe/light-sound/style.css','body{}');
  write('probe/light-sound/main.js',"import '../saezuri/light-voice.js';import '../../saezuri/music/accompaniment.js';");
  write('probe/saezuri/light-voice.js','export const test=1;');
  write('saezuri/music/accompaniment.js','export const test=1;');
  write('probe/fm-polyphony/worker.js',"import './runtime/fmopelab.mjs';");
  write('probe/fm-polyphony/live-worklet.js',"import './runtime/fmopelab.mjs';");
  write('probe/fm-polyphony/runtime/fmopelab.mjs','export const runtime=1;');
  for(const build of ['first','next']){
   assert.ok(stampTrialAssets(root,build)>0);
   const read=name=>fs.readFileSync(path.join(root,name),'utf8');
   for(const name of ['index.html','app.js','keyboard-controls.js','tap-recording.js','worker.js'])assert.ok(read('probe/saezuri/'+name).includes('?v='+build));
   assert.match(read('probe/saezuri/app.js'),/import '\.\.\/\.\.\/src\/speech\/microphone\.js';/);
   assert.match(read('probe/saezuri/index.html'),new RegExp('styles\\.css\\?v='+build));
   assert.equal(read('src/speech/microphone.js'),'let enabled=true;');assert.equal(read('styles.css'),'body{}');
   for(const name of ['index.html','main.js','worker.js','live-worklet.js'])assert.ok(read('probe/fm-polyphony/'+name).includes('?v='+build));
   for(const name of ['index.html','main.js'])assert.ok(read('probe/light-sound/'+name).includes('?v='+build));
   assert.equal(stampTrialAssets(root,build),0,'same token is stable');
   if(build==='next')assert.ok(!read('probe/saezuri/app.js').includes('?v=first'));
  }
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('koekit-cache-'));fs.rmSync(root,{recursive:true,force:true});}
});
