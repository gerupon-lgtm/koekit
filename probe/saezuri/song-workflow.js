import {SongStore,SONG_LIMIT} from '../../saezuri/song-store.js?v=v0.1.0-20261010113359-a5daded';
import {checkpointFingerprint,restoreCheckpoint} from './song-session.js?v=v0.1.0-20261010113359-a5daded';
import {emptySequence} from './sequence-session.js?v=v0.1.0-20261010113359-a5daded';
import {validateComposition} from '../../saezuri/sequence.js?v=v0.1.0-20261010113359-a5daded';
import {sequencePlayback} from './sequence-session.js?v=v0.1.0-20261010113359-a5daded';
import {entryPreview} from './entry-session.js?v=v0.1.0-20261010113359-a5daded';
import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261010113359-a5daded';
const $=id=>document.getElementById(id);
const copy=value=>structuredClone(value);
const messages={SONG_LIMIT:`${SONG_LIMIT}きょく いっぱいです。きょくを けすと、新しく ほぞんできます。`,SONG_CONFLICT:'ほかの画面で きょくが変わりました。この画面のつくりかけは残っています。',SONG_DELETED:'ほかの画面で このきょくが消されました。この画面のつくりかけは残っています。'};
export class SongWorkflow {
 constructor({editor,shell,onDiscard,onRestore,onSaving,onAudition}){
  Object.assign(this,{editor,shell,onDiscard,onRestore,onSaving,onAudition});this.store=new SongStore();this.queue=Promise.resolve();this.id=null;this.revision=null;this.savedFingerprint=null;this.suspended=false;
  const status=document.createElement('small');status.id='song-status';status.className='song-status';status.setAttribute('role','status');$('melody-create').querySelector('.screen-heading h2').append(status);
  $('melody-home').querySelector('.session-note').textContent='きょくは この端末に ほぞんします。';
  const button=document.createElement('button');button.id='home-songs';button.textContent='ほぞんした きょく';button.onclick=()=>this.library();$('melody-home').querySelector('.home-menu').append(button);
  this.makeDialog('song-library','ほぞんした きょく','<p id="song-list-status" role="status"></p><div id="song-list"></div><button id="song-list-stop">■ とめる</button><button data-close>とじる</button>');
  setupPlaybackSheet($('song-library'),{closeId:'song-library-close',stopId:'song-list-stop',onStop:()=>shell.onStop()});
  $('song-list-stop').onclick=()=>shell.onStop();
  $('song-library').addEventListener('close',()=>shell.onStop());
  this.makeDialog('song-resume','つくりかけがあるよ。どうする？','<p id="song-resume-copy"></p><div class="song-actions"><button id="song-continue">つづきから つくる</button><button id="song-discard-draft">つくりかけを けす</button><button data-close>やめておく</button></div>');
  this.makeDialog('song-failure','まだ ほぞんできていないよ','<p id="song-failure-copy"></p><div class="song-actions"><button id="song-retry">もういちど ほぞん</button><button data-close>つくるのを つづける</button><button id="song-leave">ほぞんせず やめる</button></div>');
  this.makeDialog('song-delete','このきょくを けす？','<p>きめたところと つくりかけを けすよ。</p><div class="song-actions"><button id="song-delete-confirm">このきょくを けす</button><button data-close>やめておく</button></div>');
  for(const id of ['tempo','instrument'])$(id).addEventListener('change',()=>this.schedule());
  const name=document.createElement('label');name.textContent='きょくの名前';const input=document.createElement('input');input.id='song-title';input.maxLength=24;input.placeholder='わたしのきょく';input.onchange=()=>this.schedule();name.append(input);$('creation-settings').prepend(name);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.schedule();});
 }
 makeDialog(id,title,body){const d=document.createElement('dialog');d.id=id;d.className='song-dialog';d.setAttribute('aria-label',title);const h=document.createElement('h2');h.textContent=title;d.append(h);const content=document.createElement('div');content.innerHTML=body;d.append(content);document.querySelector('main').append(d);for(const b of d.querySelectorAll('[data-close]'))b.onclick=()=>d.close();d.addEventListener('close',()=>this.shell.onNavigate());return d;}
 show(id){this.shell.onStop();$(id).showModal();this.shell.onNavigate();}
 snapshot(){
  if(this.practice)return null;
  const checkpoint=this.editor.checkpoint(!!this.id||!!this.requestedFingerprint);
  if(!checkpoint&&!this.shell.sequence.patterns.length)return null;
  const sequence=copy(this.shell.sequence);sequence.undoStack=[];
  return {title:$('song-title')?.value||this.title||'',checkpoint,sequence,
   sequenceDraft:this.shell.proposal?copy({...this.shell.proposal.next,undoStack:[]}):null,
   settings:{tempo:Number($('tempo').value),instrument:$('instrument').value}};
 }
 schedule(){if(this.suspended)return;const snapshot=this.snapshot();if(!snapshot&&!this.id&&!this.requestedFingerprint)return;
  const fingerprint=checkpointFingerprint(snapshot);
  if(fingerprint===this.requestedFingerprint)return;
  this.requestedFingerprint=fingerprint;this.status('ほぞんしています…',false);
  this.queue=this.queue.catch(()=>{}).then(async()=>{
   if(fingerprint===this.savedFingerprint&&!['SONG_CONFLICT','SONG_DELETED'].includes(this.error?.code)){this.error=null;if(this.requestedFingerprint===fingerprint)this.status('ほぞんしたよ',true);return;}
   try{
    if(!snapshot){if(this.id&&this.revision!==null)await this.store.remove(this.id,this.revision);this.id=null;this.revision=null;this.savedFingerprint=null;this.error=null;if(this.requestedFingerprint===fingerprint){this.requestedFingerprint=null;this.status('つくりかけを とりけしたよ',true);}return;}
    this.id??=crypto.randomUUID();const saved=await this.store.save(this.id,snapshot,this.revision);this.revision=saved.revision;this.savedFingerprint=checkpointFingerprint(saved.data);this.error=null;this.title=saved.title;
    if(!$('song-title').value)$('song-title').value=saved.title;
    if(this.requestedFingerprint===fingerprint){this.requestedFingerprint=this.savedFingerprint;this.status('ほぞんしたよ',true);}
   }catch(error){this.error=error;this.requestedFingerprint=null;this.status(messages[error.code]??'まだ ほぞんできていないよ',false);}
  });
 }
 status(text,saved){$('song-status').textContent=text;$('song-status').dataset.saved=String(saved);}
 async flush(){this.schedule();await this.queue;return !this.error;}
 async depart(action,ending=false){
  if(this.departing)return;this.departing=true;
  this.shell.onStop();
  this.onSaving?.(true);
  const leave=()=>{this.suspended=true;this.onSaving?.(false);this.onDiscard();
   if(ending){this.shell.sequence=emptySequence();this.shell.proposal=null;this.shell.renderSequence();}
   if(ending||!this.shell.sequence.patterns.length){this.id=null;this.revision=null;this.title=null;$('song-title').value='';this.savedFingerprint=this.requestedFingerprint=null;this.error=null;}
   this.practice=false;this.suspended=false;this.departing=false;action();};
  if(await this.flush()){leave();return;}
  this.onSaving?.(false);
  $('song-failure-copy').textContent=messages[this.error?.code]??'つくりかけは この画面に残っています。';
  $('song-retry').onclick=async()=>{if(await this.flush()){$('song-failure').close();leave();}};
  $('song-leave').onclick=()=>{$('song-failure').close();leave();};this.show('song-failure');
  $('song-failure').addEventListener('close',()=>{this.departing=false;},{once:true});
 }
 async allowNew(){
  if(this.id||this.shell.sequence.patterns.length)return true;
  try{if((await this.store.list()).length>=this.store.limit){await this.library();$('song-list-status').textContent=`${this.store.limit}きょく いっぱいです。きょくを けしてから、つくろう。`;return false;}}
  catch{/* Editing remains available; the save error is shown when data changes. */}
  return true;
 }
 async library(){
  if(!await this.flush()){this.status(messages[this.error?.code]??'まだ ほぞんできていないよ',false);}
  $('song-list').replaceChildren();$('song-list-status').textContent='よみこんでいます…';this.show('song-library');
  try{const songs=await this.store.list();$('song-list-status').textContent=`${songs.length} / ${this.store.limit}きょく`;
   for(const record of songs){const row=document.createElement('div');row.className='song-row';const open=document.createElement('button');open.dataset.songOpen=record.id;open.textContent=record.title;open.onclick=()=>this.open(record);
    const listen=document.createElement('button');listen.textContent='▶ 聴く';listen.onclick=()=>{try{if(record.data.sequence.placements.length){const data=sequencePlayback(record.data.sequence);if(data.code)throw new Error(data.code);this.onAudition(data,record.data.settings.tempo);}else{const session=restoreCheckpoint(record.data.checkpoint);if(!session)return;this.onAudition({pattern:record.data.checkpoint.confirmed?.pattern??entryPreview(session)},record.data.settings.tempo);}}catch{$('song-list-status').textContent='このきょくは 聴けませんでした。';}};
    const duplicate=document.createElement('button');duplicate.textContent='コピー';duplicate.onclick=async()=>{this.shell.onStop();try{await this.store.duplicate(record.id,record.revision);$('song-library').close();await this.library();}catch(error){$('song-list-status').textContent=messages[error.code]??'まだ コピーできていないよ';}};
    const time=document.createElement('small');time.textContent=new Intl.DateTimeFormat('ja-JP',{dateStyle:'short',timeStyle:'short',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}).format(new Date(record.updatedAt));
    const remove=document.createElement('button');remove.textContent='けす';remove.setAttribute('aria-label',`${record.title}をけす`);remove.onclick=()=>{
     $('song-delete-confirm').onclick=async()=>{try{await this.store.remove(record.id,record.revision);$('song-delete').close();if(this.id===record.id){this.suspended=true;this.onDiscard();this.shell.sequence=emptySequence();this.shell.proposal=null;this.id=null;this.revision=null;this.savedFingerprint=this.requestedFingerprint=null;this.suspended=false;}row.remove();$('song-list-status').textContent=`${$('song-list').children.length} / ${this.store.limit}きょく`;}catch(error){$('song-list-status').textContent=messages[error.code]??'まだ けせていないよ';$('song-delete').close();}};this.show('song-delete');};row.append(open,listen,duplicate,remove,time);$('song-list').append(row);}
  }catch{$('song-list-status').textContent='きょくを よみこめませんでした。ほぞんしたものは残しています。';}
 }
 async open(record){
  if(record.schemaVersion!==1){$('song-list-status').textContent='このきょくは 新しい版で開いてください。';return;}
  if(!await this.flush()){$('song-list-status').textContent='今のつくりかけを ほぞんしてから開いてください。';return;}
  const data=copy(record.data);
  if(validateComposition(data.sequence)){$('song-list-status').textContent='きょくを よみこめませんでした。';return;}
  try{restoreCheckpoint(data.checkpoint);if(data.sequenceDraft&&validateComposition(data.sequenceDraft))throw new Error('COMPOSITION_INVALID');}catch{$('song-list-status').textContent='つくりかけを よみこめませんでした。ほぞんしたものは残しています。';return;}
  const restore=()=>{
    try{this.suspended=true;this.onDiscard();this.practice=false;this.shell.sequence={...data.sequence,undoStack:[]};this.shell.proposal=null;
    if(data.sequenceDraft){const next=data.sequenceDraft;const {undoStack,...base}=this.shell.sequence;this.shell.proposal={baseRevision:this.shell.sequence.revision,base:copy(base),next};}
    this.id=record.id;this.revision=record.revision;this.title=record.title;this.error=null;this.savedFingerprint=this.requestedFingerprint=null;
    $('song-title').value=record.title;this.onRestore(data.checkpoint,data.settings);this.shell.setMode(this.editor.previewPattern?.source==='manual'?'input':'edit');this.shell.renderSequence();$('song-library').close();$('song-resume').close();this.shell.go(this.editor.isOpen?'create':'connect');this.savedFingerprint=this.requestedFingerprint=checkpointFingerprint(this.snapshot());this.status('ほぞんしたよ',true);
   }catch{$('song-list-status').textContent='つくりかけを よみこめませんでした。ほぞんしたものは残しています。';}
   finally{this.suspended=false;}
  };
  if(!data.checkpoint?.draft&&!data.sequenceDraft){restore();return;}
  const confirmed=!!data.checkpoint?.confirmed||!!data.sequence.patterns.length;
  $('song-resume-copy').textContent=confirmed?'きめたところは のこるよ。':'つくりかけを けすと、このきょくを けすよ。';
  $('song-continue').onclick=restore;
  $('song-discard-draft').onclick=async()=>{
   try{if(!confirmed){await this.store.remove(record.id,record.revision);if(this.id===record.id){this.suspended=true;this.onDiscard();this.shell.sequence=emptySequence();this.shell.proposal=null;this.id=null;this.revision=null;this.savedFingerprint=this.requestedFingerprint=null;this.error=null;this.suspended=false;}$('song-resume').close();$('song-library').close();return;}
    if(data.checkpoint)data.checkpoint={...data.checkpoint,draft:null};data.sequenceDraft=null;
    const saved=await this.store.save(record.id,data,record.revision);record.revision=saved.revision;restore();
   }catch(error){$('song-resume-copy').textContent=messages[error.code]??'まだ けせていないよ';}
  };this.show('song-resume');
 }
}
