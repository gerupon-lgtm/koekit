import {IMAGE_TYPES,IMAGE_SPEEDS,IMAGE_MOODS,DEFAULT_IMAGE,IMAGE_TEMPOS,generateImageAccompaniment} from '../../saezuri/music/image-arrangement.js?v=v0.1.0-20261010122649-d4089c8';
const $=id=>document.getElementById(id);
export class ImageModeControls {
 constructor({editor,onTempo,compact=false}){
  this.editor=editor;this.onTempo=onTempo;this.compact=compact;this.collapsed=false;
  this.panel=document.createElement('div');this.panel.id='image-words';this.panel.hidden=true;this.panel.setAttribute('aria-label','伴奏のイメージ');
  for(const [key,label,options] of [['type','音楽のタイプ',IMAGE_TYPES],['speed','はやさ',IMAGE_SPEEDS],['mood','ふんいき',IMAGE_MOODS]]){
   const field=document.createElement('label');field.textContent=label;
   const select=document.createElement('select');select.id=`image-word-${key}`;
   for(const [id,text] of options){const option=document.createElement('option');option.value=id;option.textContent=text;select.append(option);}
   select.onchange=()=>this.generate();field.append(select);this.panel.append(field);
  }
  $('composer-panel').before(this.panel);
  this.next=document.createElement('button');this.next.id='image-next';this.next.textContent='別のパターン';this.next.hidden=true;this.next.onclick=()=>this.generate();this.panel.after(this.next);
  this.reopen=document.createElement('button');this.reopen.id='image-choice-reopen';this.reopen.textContent='伴奏をえらび直す';this.reopen.hidden=true;this.reopen.setAttribute('aria-controls','image-words');this.reopen.setAttribute('aria-expanded','false');
  this.reopen.onclick=()=>{if(this.busy)return;this.collapsed=false;this.render(false);};this.next.after(this.reopen);
  this.reset=document.createElement('button');this.reset.id='image-reset-manual';this.reset.textContent='手直しを外して おまかせ';this.reset.hidden=true;this.reset.onclick=()=>this.generate({resetManual:true});
 }
 get active(){return !!this.editor.previewPattern?.accompaniment?.imageChoice;}
 confirmed(){const expanded=this.compact&&this.active&&!this.collapsed;if(this.compact&&this.active)this.collapsed=true;return expanded;}
 choice(){return Object.fromEntries(['type','speed','mood'].map(key=>[key,$(`image-word-${key}`).value]));}
 begin(){return this.editor.stageImageAccompaniment(generateImageAccompaniment(this.editor.previewPattern,DEFAULT_IMAGE));}
 selectVoice(field,value){
  const options={type:IMAGE_TYPES,speed:IMAGE_SPEEDS,mood:IMAGE_MOODS};
  if(!this.active||!this.editor.canGenerateAccompaniment||!options[field]?.some(([id])=>id===value))return false;
  $(`image-word-${field}`).value=value;return this.generate();
 }
 generate(options={}){
  if(!this.active||!this.editor.canGenerateAccompaniment)return false;
  return this.editor.stageImageAccompaniment(generateImageAccompaniment(this.editor.previewPattern,this.choice(),options));
 }
 render(busy){
  const value=this.editor.previewPattern?.accompaniment,active=this.active&&this.editor.isOpen;
  if(active&&!this.wasActive)this.collapsed=!this.editor.imageCandidate;
  if(active&&this.editor.imageCandidate&&!this.wasImageCandidate)this.collapsed=false;
  this.wasActive=active;this.wasImageCandidate=this.editor.imageCandidate;this.busy=busy;
  this.panel.hidden=!active||this.compact&&(this.collapsed||busy);this.next.hidden=this.panel.hidden;
  this.reopen.hidden=!active||!this.compact||!this.panel.hidden;this.reopen.disabled=busy;
  this.reopen.setAttribute('aria-expanded',String(!this.panel.hidden));
  document.body.classList.toggle('image-mode',active);
  document.body.classList.toggle('image-empty',active&&!this.editor.previewPattern?.notes.length);
  for(const [id,text] of [['composer-key',active?'調':'ふんいき'],['phrase-bars',active?'':'小節数']]){
   const control=$(id),label=control?.closest('label'),name=[...label?.childNodes??[]].find(n=>n.nodeType===3);
   if(name)name.textContent=text;if(id==='phrase-bars')control?.setAttribute('aria-label','小節数');
  }
  const keyboard=$('live-keyboard'),listen=document.querySelector('.listen-actions'),toolbar=document.querySelector('.edit-toolbar'),status=$('capture-edit-status');
  if(keyboard&&listen&&toolbar){
   if(!this.audition){this.audition=document.createElement('div');this.audition.id='image-audition';keyboard.before(this.audition);}
   this.audition.hidden=!active;
   if(active&&listen.parentNode!==this.audition)this.audition.append(listen,status);
   if(!active&&listen.parentNode===this.audition)toolbar.append(listen,status);
  }
  const undo=$('capture-edit-undo');if(undo)undo.textContent=this.editor.imageCandidate?'もとにもどす':'もどす';
  if(!active){this.reset.hidden=true;return;}
  for(const key of ['type','speed','mood']){const node=$(`image-word-${key}`);node.value=value.imageChoice[key];node.disabled=busy||!this.editor.canGenerateAccompaniment;}
  this.next.disabled=busy||!this.editor.canGenerateAccompaniment;
  this.next.title=this.next.disabled?'止めて、入力や編集の候補を決めてから使えます。':'メロディーを保って、伴奏だけを変えます。';
  const manual=Object.values(value.manualSettings??{}).some(Boolean)||!!value.chords?.length||!!Object.keys(value.sounds??{}).length;
  this.reset.hidden=!manual;this.reset.disabled=this.next.disabled;
  const tempo=$('image-tempo');if(tempo){tempo.textContent=`「${IMAGE_SPEEDS.find(([id])=>id===value.imageChoice.speed)[1]}」のBPM案 ${IMAGE_TEMPOS[value.imageChoice.speed]} にする`;tempo.onclick=()=>this.onTempo?.(IMAGE_TEMPOS[this.editor.previewPattern.accompaniment.imageChoice.speed]);}
 }
}
