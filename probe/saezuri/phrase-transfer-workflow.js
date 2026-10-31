import {extractSongPhrases} from './phrase-transfer.js?v=v0.1.0-20261031005919-fd25477';
import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261031005919-fd25477';
const $=id=>document.getElementById(id);

// Copy a source snapshot into the current song; never open or write the source song.
export class PhraseTransferWorkflow{
 constructor(workflow){
  this.workflow=workflow;this.shell=workflow.shell;this.request=0;this.songs=[];this.parts=[];
  this.dialog=workflow.makeDialog('phrase-import','ほかの曲から','<label>曲<select id="phrase-import-song"></select></label><label>フレーズ<select id="phrase-import-part"></select></label><p id="phrase-import-status" role="status"></p><div class="song-actions"><button id="phrase-import-listen">▶ 聴く</button><button id="phrase-import-add">この曲に追加</button></div><button data-close>とじる</button>');
  setupPlaybackSheet(this.dialog,{closeId:'phrase-import-close',stopId:'phrase-import-stop',onStop:()=>this.shell.onStop()});
  $('sequence-import').onclick=()=>this.open();
  $('phrase-import-song').onchange=()=>{this.shell.onStop();this.selectSong();};
  $('phrase-import-part').onchange=()=>{this.shell.onStop();this.hint();this.render();};
  $('phrase-import-listen').onclick=()=>this.listen();$('phrase-import-add').onclick=()=>this.add();
  this.dialog.addEventListener('close',()=>{this.request++;this.loading=false;});
 }
 allowed(){return this.shell.screen==='connect'&&!this.shell.busy&&!this.shell.proposal&&!this.shell.placementWorkflow?.active;}
 selected(){return this.parts.find(p=>p.id===$('phrase-import-part').value);}
 hint(){this.message('コピーして追加します。今の曲のはやさで聴けます。');}
 message(text){$('phrase-import-status').textContent=text;}
 render(){
  const locked=this.loading||!this.allowed(),ready=!!this.selected();
  for(const id of ['phrase-import-song','phrase-import-part'])$(id).disabled=locked;
  for(const id of ['phrase-import-listen','phrase-import-add'])$(id).disabled=locked||!ready;
 }
 async open(){
  if(!this.allowed())return;
  const request=++this.request;this.loading=true;this.parts=[];this.songs=[];
  $('phrase-import-song').replaceChildren();$('phrase-import-part').replaceChildren();
  this.message('曲をよみこんでいます…');this.workflow.show('phrase-import');this.render();
  try{
   if(!await this.workflow.flush()){if(this.dialog.open&&request===this.request)this.message('今の曲をほぞんしてから、もういちど開いてね。');return;}
   const songs=await this.workflow.store.list();if(!this.dialog.open||request!==this.request)return;
   if(!this.workflow.id&&songs.length>=this.workflow.store.limit){this.message(`${this.workflow.store.limit}きょく いっぱいです。先に曲をけしてから追加してね。`);return;}
   this.songs=songs.filter(song=>song.id!==this.workflow.id&&extractSongPhrases(song).length);
   for(const song of this.songs){const option=document.createElement('option');option.value=song.id;option.textContent=song.title;$('phrase-import-song').append(option);}
   this.selectSong();
  }catch{if(this.dialog.open&&request===this.request)this.message('曲をよみこめませんでした。とじて、もういちど試してね。');}
  finally{if(request===this.request){this.loading=false;this.render();}}
 }
 selectSong(){
  const song=this.songs.find(s=>s.id===$('phrase-import-song').value);this.parts=song?extractSongPhrases(song):[];
  $('phrase-import-part').replaceChildren();
  for(const part of this.parts){const option=document.createElement('option');option.value=part.id;option.textContent=`${part.label}・${part.pattern.bars}小節`;$('phrase-import-part').append(option);}
  if(this.parts.length)this.hint();else this.message('ほかの曲に、きめたフレーズがまだありません。');this.render();
 }
 async listen(){
  const part=this.selected();if(this.loading||!this.allowed()||!part)return;
  const request=this.request;
  try{const ok=await this.workflow.onAudition({pattern:structuredClone(part.pattern)},Number($('tempo').value));if(ok===false&&this.dialog.open&&request===this.request)this.message('音を出せませんでした。もういちど試してね。');}
  catch{if(this.dialog.open&&request===this.request)this.message('音を出せませんでした。もういちど試してね。');}
 }
 async add(){
  const part=this.selected(),source=this.songs.find(s=>s.id===$('phrase-import-song').value);
  if(this.loading||!this.allowed()||!part||!source)return;
  const request=this.request,target=this.shell.sequence,targetId=this.workflow.id;this.loading=true;this.render();
  try{
   const latest=await this.workflow.store.get(source.id);
   if(!this.dialog.open||request!==this.request||target!==this.shell.sequence||targetId!==this.workflow.id||!this.allowed())return;
   if(!latest){this.message('元の曲がけされました。とじて、別の曲を選んでね。');return;}
   if(latest.revision!==source.revision){this.message('元の曲が変わりました。とじて、もういちど選んでね。');return;}
   const fresh=extractSongPhrases(latest).find(p=>p.id===part.id);
   if(!fresh||!this.shell.addPhrase(fresh.pattern,fresh.label)){this.message('まだ追加できませんでした。もういちど選んでね。');return;}
   this.workflow.practice=false;this.workflow.schedule();this.dialog.close();this.shell.connectKeptPhrase();
  }catch{if(this.dialog.open&&request===this.request)this.message('まだ追加できませんでした。とじて、もういちど試してね。');}
  finally{if(request===this.request){this.loading=false;this.render();}}
 }
}
