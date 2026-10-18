import {derivePlacement,commitSequence} from './sequence-session.js?v=v0.1.0-20261018011234-fcb9386';
import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261018011234-fcb9386';
import {restoreCheckpoint} from './song-session.js?v=v0.1.0-20261018011234-fcb9386';
const $=id=>document.getElementById(id);
const button=(text,action)=>{const node=document.createElement('button');node.type='button';node.textContent=text;node.onclick=action;return node;};

// Reuse the ordinary editor while keeping its previous workspace and Undo alive.
export class PlacementWorkflow {
 constructor(shell,onEditWorkspace){
  this.shell=shell;this.onEditWorkspace=onEditWorkspace;this.context=null;
  const actions=$('melody-connect').querySelector('.sequence-edit');
  const edit=button('ここを直す',()=>this.begin(shell.selected));edit.id='sequence-edit';
  const replace=button('さしかえる',()=>this.chooseReplacement());replace.id='sequence-replace';actions.append(edit,replace);
  const hint=document.createElement('p');hint.id='placement-edit-hint';hint.hidden=true;hint.className='placement-edit-hint';
  $('melody-create').querySelector('.screen-heading').after(hint);
  const back=$('melody-create').querySelector('[data-screen-back]'),original=back.onclick;
  back.onclick=()=>this.active?this.cancel():original();
  const dialog=this.dialog=document.createElement('dialog');dialog.id='placement-replace';dialog.className='backing-sheet';
  dialog.innerHTML='<h2>フレーズを さしかえる</h2><p>選んだ一か所だけ変えるよ。</p><div id="placement-replacements"></div><button data-close>とじる</button>';
  document.querySelector('main').append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  setupPlaybackSheet(dialog,{closeId:'placement-replace-close',stopId:'placement-replace-stop',onStop:()=>shell.onStop()});
  dialog.addEventListener('close',()=>shell.onNavigate());
 }
 get active(){return !!this.context;}
 begin(placementId,checkpoint=null){
  const shell=this.shell,placement=shell.sequence.placements.find(p=>p.id===placementId),pattern=shell.sequence.patterns.find(p=>p.id===placement?.patternId);
  if(this.active||shell.busy||shell.proposal||!pattern)return;
  const workflow=shell.songWorkflow,suspended=workflow?.suspended;if(workflow)workflow.suspended=true;
  try{
   this.context={placementId,patternId:pattern.id,baseRevision:shell.sequence.revision,mode:shell.mode,workspace:null};
   this.context.workspace=this.onEditWorkspace(pattern,checkpoint);
   shell.editor.setConfirmationExit(true);
   shell.setMode('edit');shell.go('create');this.render(true);
  }catch(error){this.abandon();throw error;}
  finally{if(workflow){workflow.suspended=suspended;workflow.schedule();}}
 }
 snapshot(){
  if(!this.context?.workspace)return null;
  const source=this.shell.sequence.patterns.find(p=>p.id===this.context.patternId),editor=this.shell.editor;
  if(!editor.entry&&JSON.stringify(source)===JSON.stringify(editor.previewPattern))return null;
  return {placementId:this.context.placementId,patternId:this.context.patternId,checkpoint:editor.checkpoint(true)};
 }
 validate(draft,sequence){
  if(!draft)return;
  const placement=sequence.placements.find(p=>p.id===draft.placementId);
  if(placement?.patternId!==draft.patternId||!draft.checkpoint||!restoreCheckpoint(draft.checkpoint))throw new Error('PLACEMENT_DRAFT_INVALID');
 }
 confirmed(change){
  const context=this.context;
  if(!context||context.committing||!change.confirmed||change.entryConfirmed)return;
  context.committing=true;
  queueMicrotask(()=>{
   if(this.context!==context)return;
   const shell=this.shell,source=shell.sequence.patterns.find(p=>p.id===context.patternId),pattern=shell.editor.pattern;
   const unchanged=JSON.stringify(pattern)===JSON.stringify(source);
   const candidate=unchanged?null:derivePlacement(shell.sequence,context.placementId,pattern);
   const next=candidate&&!candidate.code?commitSequence(shell.sequence,candidate):candidate;
   if(shell.sequence.revision!==context.baseRevision||next?.code){context.committing=false;$('capture-edit-status').textContent='曲の配置が変わりました。いったん戻って開き直してください。';return;}
   if(next)shell.sequence=next;
   const name=next?.patterns.find(p=>p.id===next.placements.find(p=>p.id===context.placementId).patternId)?.name;
   this.finish();$('sequence-message').textContent=name?`この場所だけ「${name}」にしました。ほかの場所は「さしかえる」で選べます。`:'フレーズは変えずに戻りました。';
  });
 }
 finish(){
  const context=this.context;if(!context)return;
  this.context=null;this.shell.editor.setConfirmationExit(false);context.workspace?.restore();this.shell.setMode(context.mode);this.shell.go('connect');this.shell.renderSequence();
 }
 cancel(){if(this.shell.phase==='saving')return;this.shell.onStop();this.finish();$('sequence-message').textContent='この場所の編集をとりけしました。元のフレーズは残っています。';}
 abandon(){this.context=null;this.shell.editor.setConfirmationExit(false);this.dialog?.close();this.render(true);}
 chooseReplacement(){
  const shell=this.shell;if(shell.busy||shell.proposal||this.active)return;
  const placement=shell.sequence.placements.find(p=>p.id===shell.selected);if(!placement)return;
  shell.onStop();const list=$('placement-replacements');list.replaceChildren();
  for(const pattern of shell.sequence.patterns){
   const row=document.createElement('div');row.className='phrase-choose-row';
   const label=document.createElement('p');label.textContent=`${pattern.name} ・ ${pattern.bars}小節`;
   const listen=button('▶ 聴く',()=>shell.onAudition({pattern}));listen.dataset.replacementListen=pattern.id;
   const choose=button('これにかえる',()=>{shell.onStop();this.dialog.close();shell.stage({type:'replace',placementId:placement.id,patternId:pattern.id});});
   choose.dataset.replacement=pattern.id;choose.disabled=placement.patternId===pattern.id;row.append(label,listen,choose);list.append(row);
  }
  this.dialog.showModal();shell.onNavigate();
 }
 render(locked){
  const shell=this.shell,selected=shell.sequence.placements.find(p=>p.id===shell.selected);
  $('sequence-edit').disabled=locked||!selected;$('sequence-replace').disabled=locked||!selected;
  const hint=$('placement-edit-hint');hint.hidden=!this.active;
  if(this.active){const source=shell.sequence.patterns.find(p=>p.id===this.context.patternId);hint.textContent=`「${source?.name??'フレーズ'}」のこの場所だけ直すよ。オッケーで別のフレーズにします。戻るととりけします。`;}
  $('melody-create').querySelector('.screen-heading h2').firstChild.textContent=this.active?'直す':'つくる';
  $('melody-create').querySelector('.phrase-register').hidden=this.active;
  if(this.active)$('after-keep').hidden=true;
  for(const add of [...$('phrase-shelf').querySelectorAll('[data-phrase]')]){
   if(add.parentElement.classList.contains('phrase-shelf-row'))continue;
   const id=add.dataset.phrase,used=shell.sequence.placements.some(p=>p.patternId===id),row=document.createElement('div');row.className='phrase-shelf-row';
   const remove=button('けす',()=>shell.stage({type:'delete-pattern',patternId:id}));remove.dataset.phraseRemove=id;
   remove.disabled=locked||used;remove.setAttribute('aria-label',`${add.textContent}を棚からけす`);if(used)remove.title='曲の中で使っています。先に配置を外すか、さしかえてください。';
   add.before(row);row.append(add,remove);
  }
  if(this.dialog.open)for(const choose of this.dialog.querySelectorAll('[data-replacement]'))choose.disabled=shell.busy||selected?.patternId===choose.dataset.replacement;
 }
}
