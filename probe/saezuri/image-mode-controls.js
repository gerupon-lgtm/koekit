import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261101044249-ec316a9';
import {IMAGE_TYPES,IMAGE_SPEEDS,IMAGE_MOODS,DEFAULT_IMAGE,IMAGE_TEMPOS,generateImageAccompaniment} from '../../saezuri/music/image-arrangement.js?v=v0.1.0-20261101044249-ec316a9';
const $=id=>document.getElementById(id);
export class ImageModeControls {
 constructor({editor,onTempo,onRecord,onPreview,onStop,onNavigate,readAccompaniment,compact=false}){
  Object.assign(this,{editor,onTempo,onRecord,onPreview,onStop,onNavigate,readAccompaniment,compact});this.collapsed=false;
  this.panel=document.createElement('div');this.panel.id='image-words';this.panel.hidden=true;this.panel.setAttribute('aria-label','伴奏のイメージ');
  for(const [key,label,options] of [['type','音楽のタイプ',IMAGE_TYPES],['speed','はやさ',IMAGE_SPEEDS],['mood','ふんいき',IMAGE_MOODS]]){
   const field=document.createElement('label');field.textContent=label;
   const select=document.createElement('select');select.id=`image-word-${key}`;
   for(const [id,text] of options){const option=document.createElement('option');option.value=id;option.textContent=text;select.append(option);}
   select.onchange=()=>this.generate();field.append(select);this.panel.append(field);
  }
  $('composer-panel').before(this.panel);
  this.next=document.createElement('button');this.next.id='image-next';this.next.textContent='別のパターン';this.next.hidden=true;this.next.onclick=()=>this.generate();this.panel.after(this.next);
  this.reopen=document.createElement('button');this.reopen.id='image-choice-reopen';this.reopen.textContent='イメージで作り直す';this.reopen.hidden=true;this.reopen.setAttribute('aria-controls','image-words');this.reopen.setAttribute('aria-expanded','false');
  this.reopen.onclick=()=>this.openRebuild();this.next.after(this.reopen);
  this.reset=document.createElement('button');this.reset.id='image-reset-manual';this.reset.textContent='手直しを外して おまかせ';this.reset.hidden=true;this.reset.onclick=()=>this.openReset();
  if(compact)this.createRebuildSheets();
 }
 get active(){return !!this.editor.previewPattern?.accompaniment?.imageChoice;}
 confirmed(){const expanded=this.compact&&this.active&&!this.collapsed;if(this.compact&&this.active){this.collapsed=true;if(this.tools)this.tools.open=false;if(this.advanced)this.advanced.open=false;}return expanded;}
 workspace(active){
  // Shared editing/input controls are owned by CreationLayout for every source.
  if(!this.compact||!document.body.classList.contains('melody-app'))return;
  if(!this.heading){
   this.heading=document.createElement('div');this.heading.id='image-flow-heading';this.panel.before(this.heading);
   this.prompt=document.createElement('span');this.recordBack=document.createElement('button');this.recordBack.id='image-record-return';this.recordBack.textContent='録音にもどる';
   this.recordBack.onclick=()=>{if(this.busy||this.editor.pending)return;this.confirmed();this.onRecord?.();};this.heading.append(this.prompt,this.recordBack);
   this.summary=document.createElement('span');this.summary.id='image-adopted-summary';$('phrase-shape').prepend(this.summary);
  }
  const choosing=active&&!this.collapsed;
  document.body.classList.toggle('image-choosing',choosing);document.body.classList.toggle('image-performing',active&&!choosing);
  this.advanced=this.rebuildGroup;this.heading.hidden=!choosing;this.summary.hidden=true;
  this.recordBack.hidden=!choosing||!this.editor.accepted||this.editor.pending;this.recordBack.disabled=this.busy;
  if(active)this.prompt.textContent='伴奏を えらぼう';
 }
 choice(){return Object.fromEntries(['type','speed','mood'].map(key=>[key,$(`image-word-${key}`).value]));}
 begin(){return this.editor.stageImageAccompaniment(generateImageAccompaniment(this.editor.previewPattern,DEFAULT_IMAGE));}
 selectVoice(field,value){
  const options={type:IMAGE_TYPES,speed:IMAGE_SPEEDS,mood:IMAGE_MOODS};
  if((!this.active&&!this.rebuildSheet?.open)||!this.editor.canGenerateAccompaniment||!options[field]?.some(([id])=>id===value))return false;
  $(`image-word-${field}`).value=value;return this.generate();
 }
 generate(options={}){
  if(this.rebuildSheet?.open){this.onStop?.();this.rebuildCandidate=generateImageAccompaniment({...this.rebuildBase,accompaniment:this.rebuildCandidate??this.rebuildBase.accompaniment},this.choice(),options);this.onNavigate?.();return true;}
  if(!this.active||!this.editor.canGenerateAccompaniment)return false;
  return this.editor.stageImageAccompaniment(generateImageAccompaniment(this.editor.previewPattern,this.choice(),options));
 }
 render(busy){
  const value=this.editor.previewPattern?.accompaniment,active=this.active&&this.editor.isOpen;
  if(active&&!this.wasActive)this.collapsed=!this.editor.imageCandidate;
  if(active&&this.editor.imageCandidate&&!this.wasImageCandidate&&!this.rebuildApplying)this.collapsed=false;
  this.wasActive=active;this.wasImageCandidate=this.editor.imageCandidate;this.busy=busy;
  this.panel.hidden=!active||this.compact&&(this.collapsed||busy);this.next.hidden=this.panel.hidden;
  this.reopen.hidden=!this.editor.isOpen||!this.compact;this.reopen.disabled=busy||!this.editor.canGenerateAccompaniment;
  this.reopen.setAttribute('aria-expanded',String(!this.panel.hidden));
  document.body.classList.toggle('image-mode',active);
  document.body.classList.toggle('image-empty',active&&!this.editor.previewPattern?.notes.length);
  for(const [id,text] of [['composer-key',active?'調':'ふんいき'],['phrase-bars',active?'':'小節数']]){
   const control=$(id),label=control?.closest('label'),name=[...label?.childNodes??[]].find(n=>n.nodeType===3);
   if(name)name.textContent=text;if(id==='phrase-bars')control?.setAttribute('aria-label','小節数');
  }
  this.workspace(active);
  const undo=$('capture-edit-undo');if(undo)undo.textContent=this.editor.imageCandidate?'もとにもどす':'もどす';
  if(!active){this.reset.hidden=true;this.renderRebuild(busy);return;}
  for(const key of ['type','speed','mood']){const node=$(`image-word-${key}`);if(!this.rebuildSheet?.open)node.value=value.imageChoice[key];node.disabled=busy||!this.editor.canGenerateAccompaniment;}
  this.next.disabled=busy||!this.editor.canGenerateAccompaniment;
  this.next.title=this.next.disabled?'止めて、入力や編集の候補を決めてから使えます。':'メロディーを保って、伴奏だけを変えます。';
  const manual=!!value.drumPattern&&value.drumPattern!=='auto'||Object.values(value.manualSettings??{}).some(Boolean)||!!value.chords?.length||!!Object.keys(value.sounds??{}).length;
  this.reset.hidden=!manual;this.reset.disabled=this.next.disabled;
  this.renderRebuild(busy);
  const tempo=$('image-tempo');if(tempo){tempo.textContent=`「${IMAGE_SPEEDS.find(([id])=>id===value.imageChoice.speed)[1]}」のBPM案 ${IMAGE_TEMPOS[value.imageChoice.speed]} にする`;tempo.onclick=()=>this.onTempo?.(IMAGE_TEMPOS[this.editor.previewPattern.accompaniment.imageChoice.speed]);}
 }
 createRebuildSheets(){
  const dialog=document.createElement('dialog');dialog.id='backing-rebuild-sheet';dialog.className='backing-sheet';dialog.setAttribute('aria-label','イメージで作り直す');
  dialog.innerHTML='<div class="screen-heading"><h2>イメージで作り直す</h2><button id="backing-rebuild-close">とじる</button></div><div id="backing-rebuild-fields"></div><p class="image-hint">手で指定したコード・空白・鳴らし方は残します。テンポは右上の設定で変えられます。</p><button id="backing-rebuild-preview">▶ この伴奏を聴く</button><button id="backing-rebuild-stop">■ とめる</button>';
  document.querySelector('main').append(dialog);this.rebuildSheet=dialog;
  setupPlaybackSheet(dialog,{closeId:'backing-rebuild-close',footerCloseId:'backing-rebuild-close-bottom',onStop:()=>this.onStop?.()});
  const use=document.createElement('button');use.id='backing-rebuild-use';use.textContent='この伴奏をつかう';dialog.querySelector('.sheet-stop').append($('backing-rebuild-stop'),use);
  $('backing-rebuild-close').onclick=()=>dialog.close();$('backing-rebuild-stop').onclick=()=>this.onStop?.();
  $('backing-rebuild-preview').onclick=()=>{if(this.rebuildCandidate)this.onPreview?.({...structuredClone(this.rebuildBase),accompaniment:structuredClone(this.rebuildCandidate)},true);};
  use.onclick=()=>{if(!this.busy&&JSON.stringify(this.editor.previewPattern)===this.rebuildBaseKey&&this.applyRebuild(this.rebuildCandidate))dialog.close();};
  dialog.addEventListener('close',()=>{this.rebuildBase=null;this.rebuildCandidate=null;for(const [node,anchor] of this.rebuildHomes??[]){anchor.after(node);anchor.remove();}this.rebuildHomes=[];this.onNavigate?.();});
  const reset=document.createElement('dialog');reset.id='backing-reset';reset.className='backing-sheet';reset.innerHTML='<div class="screen-heading"><h2>手直しを外す</h2><button id="backing-reset-close">とじる</button></div><p>このパーツで手直ししたコード・空白・鳴らし方を外し、おまかせの候補を作ります。メロディーは残ります。</p><button id="backing-reset-use">外して候補をつくる</button>';
  document.querySelector('main').append(reset);this.resetSheet=reset;
  setupPlaybackSheet(reset,{closeId:'backing-reset-close',footerCloseId:'backing-reset-close-bottom',onStop:()=>this.onStop?.()});
  $('backing-reset-close').onclick=()=>reset.close();$('backing-reset-use').onclick=()=>{if(!this.busy&&this.editor.canGenerateAccompaniment){const value=generateImageAccompaniment(this.editor.previewPattern,this.editor.previewPattern.accompaniment.imageChoice??DEFAULT_IMAGE,{resetManual:true});if(this.applyRebuild(value))reset.close();}};
  reset.addEventListener('close',()=>this.onNavigate?.());
 }
 openRebuild(){
  if(!this.compact||this.busy||!this.editor.canGenerateAccompaniment)return;
  this.onStop?.();this.rebuildCandidate=null;this.rebuildBase=structuredClone(this.editor.previewPattern);this.rebuildBaseKey=JSON.stringify(this.rebuildBase);this.rebuildBase.accompaniment=structuredClone(this.readAccompaniment());
  const choice=this.rebuildBase.accompaniment.imageChoice??{...DEFAULT_IMAGE,type:this.rebuildBase.accompaniment.genre};
  for(const key of ['type','speed','mood'])$(`image-word-${key}`).value=choice[key];
  this.rebuildHomes=[this.panel,this.next].map(node=>{const anchor=document.createComment('backing builder');node.before(anchor);return [node,anchor];});
  $('backing-rebuild-fields').append(this.panel,this.next);this.rebuildSheet.showModal();this.generate();
 }
 applyRebuild(value){
  this.rebuildApplying=true;let applied;
  try{applied=this.editor.stageImageAccompaniment(value);if(applied)this.collapsed=true;}finally{this.rebuildApplying=false;}
  return applied;
 }
 openReset(){if(this.compact){if(!this.busy&&this.editor.canGenerateAccompaniment){this.onStop?.();this.resetSheet.showModal();this.onNavigate?.();}}else this.generate({resetManual:true});}
 renderRebuild(busy){
  if(this.rebuildSheet?.open){this.panel.hidden=false;this.next.hidden=false;for(const field of this.panel.querySelectorAll('select'))field.disabled=busy;this.next.disabled=busy;$('backing-rebuild-preview').disabled=busy||!this.rebuildCandidate;$('backing-rebuild-use').disabled=busy||!this.rebuildCandidate||!this.editor.canGenerateAccompaniment;}
  if(this.resetSheet?.open)$('backing-reset-use').disabled=busy||!this.editor.canGenerateAccompaniment;
 }

 handleRebuildVoice(command){
  if(!this.rebuildSheet?.open)return false;
  if(command?.type==='image-choice')return this.selectVoice(command.field,command.value);
  if(command?.type==='image-next')return !this.busy&&this.generate();
  if(command?.type!=='backing-rebuild')return false;
  const id={close:'backing-rebuild-close',stop:'backing-rebuild-stop',listen:'backing-rebuild-preview',use:'backing-rebuild-use'}[command.action];
  if(!id||$(id).disabled)return false;$(id).click();return true;
 }

}
