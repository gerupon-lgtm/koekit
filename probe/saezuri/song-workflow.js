import {SongStore,SONG_LIMIT} from '../../saezuri/song-store.js?v=v0.1.0-20261031144007-3fbf8da';
import {checkpointFingerprint,restoreCheckpoint} from './song-session.js?v=v0.1.0-20261031144007-3fbf8da';
import {emptySequence} from './sequence-session.js?v=v0.1.0-20261031144007-3fbf8da';
import {validateComposition} from '../../saezuri/sequence.js?v=v0.1.0-20261031144007-3fbf8da';
import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261031144007-3fbf8da';
import {PhraseTransferWorkflow} from './phrase-transfer-workflow.js?v=v0.1.0-20261031144007-3fbf8da';
import {LibraryPlayback} from './library-playback.js?v=v0.1.0-20261031144007-3fbf8da';
import {validateProject} from './project-session.js?v=v0.1.0-20261031144007-3fbf8da';
import {songNavigation} from './workflow-state.js?v=v0.1.0-20261031144007-3fbf8da';
const $=id=>document.getElementById(id);
const copy=value=>structuredClone(value);
const messages={SONG_LIMIT:`${SONG_LIMIT}きょく いっぱいです。きょくを けすと、新しく ほぞんできます。`,SONG_CONFLICT:'ほかの画面で きょくが変わりました。この画面のつくりかけは残っています。',SONG_DELETED:'ほかの画面で このきょくが消されました。この画面のつくりかけは残っています。'};
export class SongWorkflow {
 constructor({editor,shell,onDiscard,onRestore,onSaving,onAudition}){
  Object.assign(this,{editor,shell,onDiscard,onRestore,onSaving,onAudition});this.store=new SongStore();this.queue=Promise.resolve();this.id=null;this.revision=null;this.savedFingerprint=null;this.suspended=false;
  const status=document.createElement('small');status.id='song-status';status.className='song-status';status.setAttribute('role','status');$('melody-create').querySelector('.screen-heading h2').append(status);
  const sequenceStatus=status.cloneNode();sequenceStatus.id='sequence-song-status';$('melody-connect').querySelector('.screen-heading h2').append(sequenceStatus);
  const currentName=document.createElement('p');currentName.id='create-song-name';$('melody-create').querySelector('.song-work-tabs').before(currentName);
  this.libraryPlayer=new LibraryPlayback({onPlay:onAudition,onStop:()=>shell.onStop(),onChoose:(record,choices)=>this.choosePlayback(record,choices),onCancelChoice:()=>this.cancelPlaybackChoice()});
  $('melody-home').querySelector('.session-note').textContent='きょくは この端末に ほぞんします。';
  const button=document.createElement('button');button.id='home-songs';button.innerHTML='保存した曲をひらく<small>前回のつづきから</small>';button.onclick=()=>this.library();$('melody-home').querySelector('.home-menu').append(button);
  this.makeDialog('song-library','ほぞんした きょく','<p id="song-list-status" role="status"></p><div id="song-list"></div><button id="song-list-stop">■ とめる</button><button data-close>とじる</button>');
  setupPlaybackSheet($('song-library'),{closeId:'song-library-close',stopId:'song-list-stop',onStop:()=>this.libraryPlayer.stop()});
  const hint=document.createElement('p');hint.id='song-list-hint';hint.textContent='「ひらく」は曲のつづきへ。「聴く」はここで再生します。';$('song-list-status').before(hint);
  $('song-list-stop').onclick=()=>this.libraryPlayer.stop();
  $('song-library').addEventListener('close',()=>this.libraryPlayer.stop());
  this.listenDialog=this.makeDialog('song-listen-choices','聴くフレーズ','<p id="song-listen-title"></p><div id="song-listen-options"></div><p>聴いても、登録やオッケー確定はしません。</p><button data-close>とじる</button>');
  setupPlaybackSheet(this.listenDialog,{closeId:'song-listen-close',stopId:'song-listen-stop',onStop:()=>shell.onStop(),stopOnClose:false});
  $('song-listen-stop').hidden=true;this.listenDialog.querySelector('.sheet-stop').hidden=true;
  this.listenDialog.addEventListener('close',()=>{if(!this.listenDialog.open)this.cancelPlaybackChoice();});
  this.makeDialog('song-resume','つくりかけがあるよ。どうする？','<p id="song-resume-copy"></p><div class="song-actions"><button id="song-continue">つづきから つくる</button><button id="song-discard-draft">つくりかけを けす</button><button data-close>やめておく</button></div>');
  this.makeDialog('song-failure','まだ ほぞんできていないよ','<p id="song-failure-copy"></p><div class="song-actions"><button id="song-retry">もういちど ほぞん</button><button data-close>つくるのを つづける</button><button id="song-leave">ほぞんせず やめる</button></div>');
  $('song-leave').textContent='未保存分を捨ててトップへ';
  this.makeDialog('song-unsaved-confirm','未保存分を捨てますか？','<p id="song-unsaved-message"></p><p>以前に保存できた内容は残します。今回、保存できなかった変更だけを捨てます。</p><div class="song-actions"><button id="song-unsaved-cancel" data-close>作業を残す</button><button id="song-unsaved-discard">未保存分を捨ててトップへ</button></div>');
  for(const id of ['song-failure','song-unsaved-confirm']){const d=$(id),heading=document.createElement('div'),close=document.createElement('button');heading.className='screen-heading';close.textContent='とじる';close.onclick=()=>d.close();heading.append(d.querySelector('h2'),close);d.prepend(heading);}
  $('song-failure').addEventListener('cancel',event=>{if(this.retrying)event.preventDefault();});
  this.makeDialog('song-delete','このきょくを けす？','<p>きめたところと つくりかけを けすよ。</p><div class="song-actions"><button id="song-delete-confirm">このきょくを けす</button><button data-close>やめておく</button></div>');
  const rename=this.makeDialog('song-rename','名前を かえる','<label for="song-rename-title">きょくの名前</label><input id="song-rename-title" maxlength="24"><p id="song-rename-status" role="status"></p><div class="song-actions"><button id="song-rename-confirm">この名前にする</button><button id="song-rename-cancel" data-close>やめておく</button></div>');
  const heading=document.createElement('div');heading.className='screen-heading';const close=document.createElement('button');close.id='song-rename-close';close.textContent='とじる';close.onclick=()=>rename.close();heading.append(rename.querySelector('h2'),close);rename.prepend(heading);
  $('song-rename-confirm').onclick=()=>this.commitName();
  rename.addEventListener('cancel',event=>{if(this.renaming)event.preventDefault();});
  $('song-rename-title').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();this.commitName();}});
  for(const id of ['tempo','instrument'])$(id).addEventListener('change',()=>this.schedule());
  const name=document.createElement('label');name.textContent='きょくの名前';const input=document.createElement('input');input.id='song-title';input.maxLength=24;input.placeholder='わたしのきょく';input.onchange=()=>this.schedule();name.append(input);$('creation-settings').prepend(name);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.schedule();});
  this.phraseTransfer=new PhraseTransferWorkflow(this);
 }
 makeDialog(id,title,body){const d=document.createElement('dialog');d.id=id;d.className='song-dialog';d.setAttribute('aria-label',title);const h=document.createElement('h2');h.textContent=title;d.append(h);const content=document.createElement('div');content.innerHTML=body;d.append(content);document.querySelector('main').append(d);for(const b of d.querySelectorAll('[data-close]'))b.onclick=()=>d.close();d.addEventListener('close',()=>this.shell.onNavigate());return d;}
 show(id){this.libraryPlayer.stop();$(id).showModal();this.shell.onNavigate();}
 cancelPlaybackChoice(){const resolve=this.resolveListen;this.resolveListen=null;resolve?.(null);this.listenDialog?.close();}
 choosePlayback(record,choices){
  $('song-listen-title').textContent=`曲：${record.title}`;$('song-listen-options').replaceChildren();
  return new Promise(resolve=>{
   this.resolveListen=resolve;
   for(const choice of choices){const b=document.createElement('button');b.dataset.listenChoice=choice.id;
    const name=document.createElement('span');name.textContent=choice.label;const state=document.createElement('small');state.textContent=`${choice.state}・${choice.data.pattern.bars}小節`;
    name.append(state);const play=document.createElement('span');play.textContent='聴く';b.append(name,play);
    b.onclick=()=>{this.resolveListen=null;this.listenDialog.close();resolve(choice);};$('song-listen-options').append(b);
   }
   this.listenDialog.showModal();this.shell.onNavigate();
  });
 }
 rename(record){
  if(this.renaming)return;this.renameTarget=record;$('song-rename-title').value=record.title;$('song-rename-status').textContent='';this.show('song-rename');$('song-rename-title').focus();$('song-rename-title').select();
 }
 async commitName(){
  const record=this.renameTarget;if(this.renaming||!record||!$('song-rename').open)return;
  const name=$('song-rename-title').value.trim();if(!name){$('song-rename-status').textContent='名前を 入れてね。';$('song-rename-title').focus();return;}
  this.renaming=true;const suspended=this.suspended,controls=['song-rename-title','song-rename-confirm','song-rename-cancel','song-rename-close'];for(const id of controls)$(id).disabled=true;
  let changed=false;
  try{
   if(this.id===record.id&&!await this.flush()){$('song-rename-status').textContent=messages[this.error?.code]??'今のつくりかけを ほぞんしてから、名前をかえてね。';return;}
   this.suspended=true;
   const saved=await this.store.rename(record.id,name,this.id===record.id?this.revision:record.revision);
   Object.assign(record,saved);
   if(this.id===saved.id){this.revision=saved.revision;this.title=saved.title;$('song-title').value=saved.title;this.savedFingerprint=this.requestedFingerprint=checkpointFingerprint(saved.data);this.error=null;this.status('ほぞんしたよ',true);}
   changed=true;
  }catch(error){$('song-rename-status').textContent=messages[error.code]??'まだ 名前をかえられませんでした。もういちど試してね。';}
  finally{this.suspended=suspended;this.renaming=false;for(const id of controls)$(id).disabled=false;if(changed)this.schedule();}
  if(changed&&$('song-rename').open){$('song-rename').close();await this.library({destination:this.libraryDestination});document.querySelector(`[data-song-rename="${CSS.escape(record.id)}"]`)?.focus({preventScroll:true});}
 }
 snapshot(){
  if(this.practice)return null;
  this.shell.projectWorkflow?.capture();
  const placement=this.shell.placementWorkflow;
  const checkpoint=placement?.active?placement.context.workspace?.checkpoint:this.editor.checkpoint(!!this.id||!!this.requestedFingerprint);
  if(!checkpoint&&!this.shell.sequence.patterns.length&&!this.shell.sequence.keepEmpty&&!this.shell.projectWorkflow?.project.parts.length)return null;
  const sequence=copy(this.shell.sequence);sequence.undoStack=[];
  return {title:$('song-title')?.value||this.title||'',checkpoint,sequence,project:this.shell.projectWorkflow?copy(this.shell.projectWorkflow.project):undefined,placementDraft:placement?.snapshot()??copy(this.shell.projectWorkflow?.parkedPlacement??null),
   sequenceDraft:this.shell.proposal?copy({...this.shell.proposal.next,undoStack:[]}):null,
   settings:{tempo:Number($('tempo').value),instrument:$('instrument').value},
   navigation:{screen:this.shell.lastWorkScreen??'create',mode:this.shell.mode}};
 }
 schedule({retry=false}={}){if(this.suspended)return;const snapshot=this.snapshot();if(!snapshot&&!this.id&&!this.requestedFingerprint)return;
  const fingerprint=checkpointFingerprint(snapshot);
  if(fingerprint===this.requestedFingerprint||!retry&&fingerprint===this.failedFingerprint)return;
  this.requestedFingerprint=fingerprint;this.status('ほぞんしています…',false);
  this.queue=this.queue.catch(()=>{}).then(async()=>{
   if(fingerprint===this.savedFingerprint&&!['SONG_CONFLICT','SONG_DELETED'].includes(this.error?.code)){this.error=null;this.failedFingerprint=null;if(this.requestedFingerprint===fingerprint)this.status('ほぞんしたよ',true);return;}
   try{
    if(!snapshot){if(this.id&&this.revision!==null)await this.store.remove(this.id,this.revision);this.id=null;this.revision=null;this.savedFingerprint=null;this.error=null;this.failedFingerprint=null;if(this.requestedFingerprint===fingerprint){this.requestedFingerprint=null;this.status('つくりかけを とりけしたよ',true);}return;}
    this.id??=crypto.randomUUID();const saved=await this.store.save(this.id,snapshot,this.revision);this.revision=saved.revision;this.savedFingerprint=checkpointFingerprint(saved.data);this.error=null;this.failedFingerprint=null;this.title=saved.title;
    if(!$('song-title').value)$('song-title').value=saved.title;
    if(this.requestedFingerprint===fingerprint){this.requestedFingerprint=this.savedFingerprint;this.status('ほぞんしたよ',true);}
   }catch(error){this.error=error;this.failedFingerprint=fingerprint;if(this.requestedFingerprint===fingerprint)this.requestedFingerprint=null;this.status(messages[error.code]??'まだ ほぞんできていないよ',false);}
  });
 }
 status(text,saved){for(const id of ['song-status','sequence-song-status']){$(id).textContent=text;$(id).dataset.saved=String(saved);}for(const id of ['sequence-song-name','create-song-name']){const name=$(id);name.textContent=this.id?`いまの曲：${$('song-title').value||this.title||'わたしのきょく'}`:'新しい曲';name.title=name.textContent;}}
 async flush(options){this.schedule(options);for(;;){const pending=this.queue;await pending;if(pending===this.queue)return !this.error;}}
 async depart(action,ending=false){
  if(this.departing)return;this.departing=true;const operation=this.departSerial=(this.departSerial??0)+1;
  this.shell.onStop();
  this.onSaving?.(true);
  const leave=()=>{if(operation!==this.departSerial)return;this.departSerial++;this.suspended=true;this.onSaving?.(false);this.onDiscard();
   if(ending){this.shell.sequence=emptySequence();this.shell.proposal=null;this.shell.renderSequence();}
   if(ending){this.id=null;this.revision=null;this.title=null;$('song-title').value='';this.savedFingerprint=this.requestedFingerprint=null;this.error=null;this.failedFingerprint=null;this.shell.keptPhrase=null;this.shell.lastWorkScreen=null;}
   this.practice=false;if(ending)this.shell.projectWorkflow?.reset();this.suspended=false;this.departing=false;action();};
  if(await this.flush()){leave();return;}
  this.onSaving?.(false);
  $('song-failure-copy').textContent=messages[this.error?.code]??'つくりかけは この画面に残っています。';
  $('song-retry').onclick=async()=>{
   if(this.retrying||operation!==this.departSerial)return;this.retrying=true;
   const controls=[...$('song-failure').querySelectorAll('button')];for(const b of controls)b.disabled=true;this.onSaving?.(true);
   try{if(await this.flush({retry:true})){$('song-failure').close();leave();}else this.onSaving?.(false);}
   finally{this.retrying=false;for(const b of controls)b.disabled=false;}
  };
  $('song-leave').onclick=()=>{
   if(this.retrying||operation!==this.departSerial)return;
   $('song-unsaved-message').textContent=`曲：${$('song-title').value||this.title||'新しい曲'}`;
   $('song-unsaved-discard').onclick=()=>{if(this.retrying)return;$('song-unsaved-confirm').close();$('song-failure').close();leave();};this.show('song-unsaved-confirm');
  };this.show('song-failure');
  $('song-failure').addEventListener('close',()=>{if(operation===this.departSerial)this.departing=false;},{once:true});
 }
 async allowNew(){
  if(this.id)return true;
  try{if((await this.store.list()).length>=this.store.limit){await this.library();$('song-list-status').textContent=`${this.store.limit}きょく いっぱいです。きょくを けしてから、つくろう。`;return false;}}
  catch{/* Editing remains available; the save error is shown when data changes. */}
  return true;
 }
 async library({destination=null}={}){
  this.libraryDestination=destination;
  this.libraryPlayer.reset();
  if(!await this.flush()){this.status(messages[this.error?.code]??'まだ ほぞんできていないよ',false);}
  $('song-list').replaceChildren();$('song-list-status').textContent='よみこんでいます…';this.show('song-library');
  try{const songs=await this.store.list();$('song-list-status').textContent=`${songs.length} / ${this.store.limit}きょく`;
    for(const record of songs){const row=document.createElement('div');row.className='song-row';const open=document.createElement('button');open.dataset.songOpen=record.id;open.textContent='ひらく →';open.setAttribute('aria-label',`${record.title}をひらく`);open.onclick=()=>this.open(record);
    const rename=document.createElement('button');rename.textContent='名前';rename.dataset.songRename=record.id;rename.setAttribute('aria-label',`${record.title}の名前をかえる`);rename.onclick=()=>this.rename(record);
    const listen=document.createElement('button');listen.textContent='▶ 聴く';
    const duplicate=document.createElement('button');duplicate.textContent='コピー';duplicate.onclick=async()=>{this.libraryPlayer.stop();try{await this.store.duplicate(record.id,record.revision);$('song-library').close();await this.library({destination:this.libraryDestination});}catch(error){$('song-list-status').textContent=messages[error.code]??'まだ コピーできていないよ';}};
    const time=document.createElement('small');time.textContent=new Intl.DateTimeFormat('ja-JP',{dateStyle:'short',timeStyle:'short',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}).format(new Date(record.updatedAt));
    const remove=document.createElement('button');remove.textContent='けす';remove.setAttribute('aria-label',`${record.title}をけす`);remove.onclick=()=>{
     $('song-delete-confirm').onclick=async()=>{try{await this.store.remove(record.id,record.revision);$('song-delete').close();if(this.id===record.id){this.suspended=true;this.onDiscard();this.shell.sequence=emptySequence();this.shell.proposal=null;this.id=null;this.revision=null;this.savedFingerprint=this.requestedFingerprint=null;this.suspended=false;}row.remove();$('song-list-status').textContent=`${$('song-list').children.length} / ${this.store.limit}きょく`;}catch(error){$('song-list-status').textContent=messages[error.code]??'まだ けせていないよ';$('song-delete').close();}};this.show('song-delete');};
    const title=document.createElement('p');title.className='song-row-title';title.textContent=record.title;
    const nav=document.createElement('small');nav.className='song-row-navigation';nav.textContent=`再開：${songNavigation(record.data).screen==='connect'?'つなげる':'フレーズをつくる'}`;
    const actions=document.createElement('div');actions.className='song-row-actions';const more=document.createElement('button');more.textContent='…';more.dataset.songMore=record.id;more.setAttribute('aria-label',`${record.title}の名前変更・コピー・削除`);more.setAttribute('aria-expanded','false');
    const menu=document.createElement('div');menu.className='song-more-actions';menu.hidden=true;menu.append(rename,duplicate,remove);more.onclick=()=>{menu.hidden=!menu.hidden;more.setAttribute('aria-expanded',String(!menu.hidden));};
    actions.append(open,listen,more);row.append(title,nav,actions,menu,time);this.libraryPlayer.bind(record,row,listen);$('song-list').append(row);}
  }catch{$('song-list-status').textContent='きょくを よみこめませんでした。ほぞんしたものは残しています。';}
 }
 async open(record){
  const destination=this.libraryDestination;
  if(record.schemaVersion!==1){$('song-list-status').textContent='このきょくは 新しい版で開いてください。';return;}
  if(!await this.flush()){$('song-list-status').textContent='今のつくりかけを ほぞんしてから開いてください。';return;}
  const data=copy(record.data);
  if(validateComposition(data.sequence)){$('song-list-status').textContent='きょくを よみこめませんでした。';return;}
  try{if(data.project&&validateProject(data.project,data.sequence))throw new Error('PROJECT_INVALID');restoreCheckpoint(data.checkpoint);this.shell.placementWorkflow.validate(data.placementDraft,data.sequence);if(data.placementDraft&&data.sequenceDraft||data.sequenceDraft&&validateComposition(data.sequenceDraft))throw new Error('COMPOSITION_INVALID');}catch{$('song-list-status').textContent='つくりかけを よみこめませんでした。ほぞんしたものは残しています。';return;}
  const restore=()=>{
    try{this.suspended=true;this.onDiscard();this.practice=false;this.shell.sequence={...data.sequence,undoStack:[]};this.shell.proposal=null;
    this.shell.projectWorkflow?.restore(data);
    if(data.sequenceDraft){const next=data.sequenceDraft;const {undoStack,...base}=this.shell.sequence;this.shell.proposal={baseRevision:this.shell.sequence.revision,base:copy(base),next};}
    this.id=record.id;this.revision=record.revision;this.title=record.title;this.error=null;this.failedFingerprint=null;this.savedFingerprint=this.requestedFingerprint=null;
    const navigation=this.shell.projectWorkflow?{...songNavigation(data),screen:'connect'}:songNavigation(data);
    $('song-title').value=record.title;const activePart=this.shell.projectWorkflow?.active;this.onRestore(activePart?.checkpoint??data.checkpoint,data.settings);this.shell.setMode(navigation.mode);this.shell.renderSequence();$('song-library').close();$('song-resume').close();this.shell.go(navigation.screen);
    if(data.placementDraft&&!this.shell.projectWorkflow)this.shell.placementWorkflow.begin(data.placementDraft.placementId,data.placementDraft.checkpoint);
    this.savedFingerprint=this.requestedFingerprint=checkpointFingerprint(data);this.status('ほぞんしたよ',true);
   }catch{$('song-list-status').textContent='つくりかけを よみこめませんでした。ほぞんしたものは残しています。';}
   finally{this.suspended=false;}
  };
  if(this.shell.projectWorkflow||!data.checkpoint?.draft&&!data.sequenceDraft&&!data.placementDraft){restore();return;}
  const confirmed=!!data.checkpoint?.confirmed||!!data.sequence.patterns.length;
  $('song-resume-copy').textContent=confirmed?'きめたところは のこるよ。':'つくりかけを けすと、このきょくを けすよ。';
  $('song-continue').onclick=restore;
  $('song-discard-draft').onclick=async()=>{
   try{if(!confirmed){await this.store.remove(record.id,record.revision);if(this.id===record.id){this.suspended=true;this.onDiscard();this.shell.sequence=emptySequence();this.shell.proposal=null;this.id=null;this.revision=null;this.savedFingerprint=this.requestedFingerprint=null;this.error=null;this.suspended=false;}$('song-resume').close();$('song-library').close();return;}
    if(data.checkpoint)data.checkpoint={...data.checkpoint,draft:null};data.sequenceDraft=null;data.placementDraft=null;
    const saved=await this.store.save(record.id,data,record.revision);record.revision=saved.revision;restore();
   }catch(error){$('song-resume-copy').textContent=messages[error.code]??'まだ けせていないよ';}
  };this.show('song-resume');
 }
}
