import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261031130511-e7ac30d';
import {blankPattern} from './entry-session.js?v=v0.1.0-20261031130511-e7ac30d';
import {migrateProject,allocatePart,capturePart,syncProjectParts,emptyPartCheckpoint} from './project-session.js?v=v0.1.0-20261031130511-e7ac30d';
import {canKeepPhrase,emptySequence,sequencePlayback,proposeSequence} from './sequence-session.js?v=v0.1.0-20261031130511-e7ac30d';
import {ArrangementGestures} from './arrangement-gestures.js?v=v0.1.0-20261031130511-e7ac30d';
const $=id=>document.getElementById(id),copy=v=>structuredClone(v);
const button=(text,action)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=action;return b;};
export class ProjectWorkflow{
 constructor(shell){
  this.shell=shell;this.project=migrateProject({sequence:shell.sequence});this.switching=false;this.scroll=0;this.workspaces=new Map();
  $('home-create').querySelector('small').textContent='空の曲にパーツをつくる';$('home-create').onclick=()=>this.start();
  const sample=button('サンプルでためす',()=>this.start(true));sample.id='home-project-sample';$('home-tutorial').before(sample);
  $('melody-home').querySelector('.home-support').classList.add('project-home-support');
  $('home-tutorial').textContent='音の入れ方';$('new-tutorial').hidden=true;const lesson=button('このパーツで曲をつくる',()=>this.adoptLesson());lesson.id='learning-project';lesson.hidden=true;$('learning-guide').append(lesson);
  $('melody-connect').querySelector('h2').firstChild.textContent='曲全体';
  $('melody-create').querySelector('.song-work-tabs').hidden=true;$('melody-connect').querySelector('.song-work-tabs').hidden=true;
  const back=$('melody-create').querySelector('[data-screen-back]');shell.icon(back,'back','曲全体へ');back.onclick=()=>this.overview();
  for(const node of [$('phrase-tools'),$('after-keep'),document.querySelector('.phrase-register')])if(node)node.hidden=true;
  $('sequence-create').onclick=()=>this.create();$('sequence-create').textContent='＋ つくる';
  $('sequence-song').hidden=true;
  const source=$('melody-connect').querySelector('.phrase-source-actions');
  const shelf=$('phrase-shelf'),head=shelf.previousElementSibling;head.textContent='この曲のパーツ';head.className='project-parts-heading';head.append($('sequence-create'));
  const line=$('sequence-line'),orderHead=line.previousElementSibling;orderHead.firstChild.textContent='曲の並び ';shelf.before(orderHead,line,$('sequence-message'),document.querySelector('.sequence-actions'));
  shelf.before(head);
  source.hidden=true;const more=document.createElement('details');more.id='project-more';more.innerHTML='<summary>ほかの曲から・並びの操作</summary>';more.append($('sequence-import'),document.querySelector('.sequence-edit'));$('melody-connect').append(more);
  const save=button('自分の曲にする',()=>this.adoptSample());save.id='project-adopt';save.hidden=true;const songRow=document.createElement('div');songRow.className='project-song-row';$('sequence-song-name').before(songRow);songRow.append($('sequence-song-name'),save);
  const caption=document.createElement('p');caption.id='project-caption';caption.textContent='パーツをつくって、＋で並べよう。カードは長押しで動かせるよ。';document.querySelector('.project-song-row').after(caption);
  this.dialog=document.createElement('dialog');this.dialog.id='project-part';this.dialog.className='song-dialog';this.dialog.innerHTML='<div class="screen-heading"><h2 id="project-part-title"></h2><button id="project-part-close">とじる</button></div><div id="project-part-actions"></div><p id="project-part-message" role="status"></p>';
  document.querySelector('main').append(this.dialog);$('project-part-close').onclick=()=>this.dialog.close();setupPlaybackSheet(this.dialog,{closeId:'project-part-close',stopId:'project-part-stop',onStop:()=>shell.onStop(),stopOnClose:false});this.dialog.addEventListener('close',()=>{shell.onStop();shell.onNavigate();});
  const place=document.createElement('dialog');place.id='project-insert';place.className='song-dialog';place.innerHTML='<div class="screen-heading"><h2>入れるパーツ</h2><button id="project-insert-close">とじる</button></div><div id="project-insert-options"></div>';
  document.querySelector('main').append(place);$('project-insert-close').onclick=()=>place.close();place.addEventListener('close',()=>shell.onNavigate());this.insertDialog=place;
  const resume=button('この場所の修正をつづける',()=>this.resumePlacement());resume.id='project-resume-placement';resume.hidden=true;$('sequence-message').after(resume);
  const rechoose=button('パーツを選び直す',()=>{if(this.placingPart){this.placingPart=null;shell.renderSequence();}else this.chooseInsertion(this.insertion.index);});rechoose.id='project-rechoose';rechoose.hidden=true;$('sequence-message').after(rechoose);
  this.gestures=new ArrangementGestures(shell,{onSelect:id=>{shell.selected=id;shell.renderSequence();this.cardActions(id);}});
  const help=$('home-help'),old=help.onclick;help.onclick=()=>{old();const ps=document.querySelectorAll('.melody-help p');ps[1].textContent='曲全体で「＋つくる」からパーツをつくります。戻っても作業は残ります。並びの「＋」でパーツを選び、聴いてオッケー。パーツをコピーして直すこともできます。';};
  $('phrase-name').onchange=()=>{const part=this.active;if(part){part.name=$('phrase-name').value.trim().slice(0,24)||part.name;this.capture();shell.renderSequence();}};
 }
 prepareSource(pattern){if(!this.active)allocatePart(this.project,pattern);}
 get active(){return this.project.parts.find(p=>p.id===this.project.activeId);}
 capture(){
  if(this.switching||this.shell.songWorkflow?.practice===true||this.shell.placementWorkflow?.active)return;
  const s=this.shell;if(!s.editor.isOpen){syncProjectParts(this.project,s.sequence);return;}capturePart(this.project,s.sequence,s.editor.checkpoint(true,{includeEmpty:true}),s.mode);syncProjectParts(this.project,s.sequence);
 }
 parkCurrent(){if(this.active&&this.shell.editor.isOpen)this.workspaces.set(this.active.id,this.shell.editor.parkWorkspace(true));}
 reset(){this.workspaces.clear();this.project=migrateProject({sequence:this.shell.sequence});this.selectedPart=null;this.placingPart=null;this.parkedPlacement=null;this.placementWorkspace=null;this.gestures?.cancel();}
 restore(data){this.workspaces.clear();this.project=migrateProject(data);this.parkedPlacement=copy(data.placementDraft??null);this.placementWorkspace=null;this.placingPart=null;this.selectedPart=null;this.gestures.cancel();}
 async start(sample=false){
  const s=this.shell,w=s.songWorkflow;if(s.busy)return;
  if(!sample&&!await w.allowNew())return;
  this.switching=true;w.suspended=true;
  try{s.onDiscard();s.sequence=emptySequence();s.proposal=null;w.id=null;w.revision=null;w.title=null;w.savedFingerprint=w.requestedFingerprint=null;w.failedFingerprint=null;w.error=null;$('song-title').value='';this.reset();w.practice=sample?'project':false;
   if(sample){s.sequence=this.sample();this.project=migrateProject({sequence:s.sequence});$('song-title').value='サンプルの曲';}
  }finally{this.switching=false;w.suspended=false;}
  s.go('connect');s.renderSequence();
 }
 sample(){
  const patterns=[[60,64,67,64],[62,65,69,65],[67,65,64,60]].map((p,i)=>({...blankPattern(),id:'sample-'+i,familyId:'sample-'+i,name:['A','B','C'][i],notes:p.map((midi,n)=>({id:'n'+n,midi,startTick:n*16,durationTick:16,origin:'input',completedRanges:[]})),accompaniment:{enabled:false,genre:"nursery",rhythm:"quarters",progression:"home"}}));
  return {...emptySequence(),patterns,placements:[0,1,0,2].map((i,n)=>({id:'sample-place-'+n,patternId:patterns[i].id}))};
 }
 async adoptLesson(){const s=this.shell,w=s.songWorkflow;if(s.busy||!s.editor.isOpen||!await w.allowNew())return;s.learning.end();w.practice=false;const checkpoint=s.editor.checkpoint(true,{includeEmpty:true});allocatePart(this.project,s.editor.pattern);this.active.checkpoint=checkpoint;this.capture();s.go('connect');}
 async adoptSample(){const w=this.shell.songWorkflow;if(w.practice!=='project'||!await w.allowNew())return;w.practice=false;w.schedule();await w.flush();this.shell.renderSequence();}
 create(){
  const s=this.shell;if(s.busy||s.proposal||s.placementWorkflow.active)return;
  this.capture();this.parkCurrent();this.switching=true;
  try{s.onDiscard();if(s.songWorkflow.practice===true)s.songWorkflow.practice=false;allocatePart(this.project,blankPattern());}finally{this.switching=false;}
  s.chooseReturn='connect';s.go('choose');s.songWorkflow.schedule();
 }
 overview(){
  const s=this.shell;if(s.busy)return;if(s.placementWorkflow.active){this.parkedPlacement=s.placementWorkflow.snapshot();this.placementWorkspace=this.parkedPlacement?s.editor.parkWorkspace(true):null;s.placementWorkflow.finish();return;}
  this.capture();this.scroll=0;s.go('connect');
 }
 openPart(part,{duplicate=false,includeDraft=false}={}){
  const s=this.shell;if(s.busy||s.proposal||s.placementWorkflow.active)return;
  this.capture();const source=s.sequence.patterns.find(p=>p.id===part.patternId),draft=includeDraft?copy(part.checkpoint):null;this.parkCurrent();this.dialog.close();this.switching=true;
  try{if(duplicate){part=allocatePart(this.project,source,{copyFrom:source});if(draft)part.checkpoint=draft;}
   this.project.activeId=part.id;const checkpoint=part.checkpoint??emptyPartCheckpoint(source,{accepted:true});const workspace=this.workspaces.get(part.id);s.songWorkflow.onRestore(checkpoint,{tempo:Number($('tempo').value),instrument:$('instrument').value});if(workspace){workspace.restore();this.workspaces.delete(part.id);}s.setMode(part.mode??'input');$('phrase-name').value=part.name;
  }finally{this.switching=false;}
  s.go('create');s.renderSequence();
 }
 partActions(part){
  const s=this.shell;if(s.busy||s.proposal)return;this.selectedPart=part.id;$('project-part-title').textContent=part.name;$('project-part-message').textContent=part.checkpoint?.draft?'つくりかけも、このパーツに残っています。':'';
  const list=$('project-part-actions');list.replaceChildren();const source=s.sequence.patterns.find(p=>p.id===part.patternId),used=s.sequence.placements.some(p=>p.patternId===part.patternId);
  if(source){list.append(button('▶ このパーツを聴く',()=>s.onAudition({pattern:source})),button('コピーして直す',()=>this.openPart(part,{duplicate:true})),button('並びに入れる',()=>{this.dialog.close();this.placingPart=source.id;s.renderSequence();}));}
  if(part.checkpoint&&(!used||!source||part.checkpoint.draft))list.prepend(button('つづきをつくる',()=>this.openPart(part,{duplicate:used,includeDraft:used})));
  if(used&&part.checkpoint?.draft)$('project-part-message').textContent='並べた音を残して、つくりかけから別のパーツをつくります。';
  this.dialog.showModal();s.onNavigate();
 }
 resumePlacement(){const s=this.shell,draft=this.parkedPlacement;if(!draft||s.phase==='saving')return;s.onStop();if(s.busy||s.proposal||s.placementWorkflow.active)return;s.placementWorkflow.begin(draft.placementId,draft.checkpoint);if(!s.placementWorkflow.active)return;this.parkedPlacement=null;this.placementWorkspace?.restore();this.placementWorkspace=null;}
 cardActions(id){
  const s=this.shell,p=s.sequence.placements.find(p=>p.id===id),source=s.sequence.patterns.find(x=>x.id===p?.patternId);if(!source||s.proposal)return;
  $('project-part-title').textContent=source.name+'・この場所';$('project-part-message').textContent='直すと、この場所だけ別のパーツになります。';const list=$('project-part-actions');list.replaceChildren(button('▶ このパーツを聴く',()=>s.onAudition({pattern:source})),button(this.parkedPlacement?'修正中の場所にもどる':'ここだけ直す',()=>{this.capture();this.dialog.close();if(this.parkedPlacement){this.resumePlacement();return;}s.placementWorkflow.begin(id);}),button('さしかえる',()=>{this.dialog.close();s.placementWorkflow.chooseReplacement();}));this.dialog.showModal();s.onNavigate();
 }
 chooseInsertion(index){
  const s=this.shell;if(s.busy||s.proposal&&!this.insertion||s.sequence.placements.length>=16)return;
  if(this.placingPart){this.insert(this.placingPart,index);return;}
  const list=$('project-insert-options');list.replaceChildren();for(const p of s.sequence.patterns){if(!canKeepPhrase(p))continue;const b=button(p.name+' ・ '+p.bars+'小節',()=>{this.insertDialog.close();this.insert(p.id,index);});b.dataset.insertPart=p.id;list.append(b);}
  if(!list.children.length){const p=document.createElement('p');p.textContent='まず「＋つくる」でパーツをつくろう。';list.append(p);}
  this.insertDialog.showModal();s.onNavigate();
 }
 insert(patternId,index){const s=this.shell;const command={type:'insert',index,placement:{id:this.insertion?.id??crypto.randomUUID(),patternId}};if(s.proposal&&this.insertion){const candidate=proposeSequence(s.sequence,command);if(!candidate.code)s.proposal=candidate;}else s.stage(command);this.insertion={index,id:command.placement.id};this.placingPart=null;s.renderSequence();}
 render(){
  const s=this.shell,draft=s.proposal?.next??s.sequence,locked=s.busy||!!s.proposal||s.placementWorkflow.active;
  $('project-resume-placement').hidden=!this.parkedPlacement;$('project-resume-placement').disabled=locked;
  if(!s.proposal)this.insertion=null;$('project-rechoose').hidden=!this.placingPart&&(!s.proposal||!this.insertion);$('project-rechoose').textContent=this.placingPart?'場所選びを取消':'パーツを選び直す';
  $('learning-project').hidden=!(s.learning?.active&&s.learning.stage===7&&s.learning.currentGuide().done);$('learning-project').disabled=s.busy;
  document.body.classList.add('project-workflow');$('sequence-create').textContent='＋ つくる';$('sequence-create').disabled=locked;
  if(s.songWorkflow?.practice==='project')$('sequence-song-name').textContent='サンプルの曲（保存枠なし）';
  $('project-adopt').hidden=s.songWorkflow?.practice!=='project';$('project-adopt').disabled=s.busy;
  $('project-caption').textContent=s.songWorkflow?.practice==='project'?'A・B・Cを A–B–A–C と並べた曲。自由にためせます。':'パーツをつくって、＋で並べよう。カードは長押しで動かせるよ。';
  $('sequence-empty').hidden=true;document.querySelector('.phrase-register').hidden=true;if($('phrase-tools'))$('phrase-tools').hidden=true;$('after-keep').hidden=true;
  if(this.active&&!s.placementWorkflow.active)$('melody-create').querySelector('h2').firstChild.textContent=this.active.name;
  const shelf=$('phrase-shelf'),oldShelf=shelf.scrollTop;shelf.replaceChildren();
  for(const part of this.project.parts){const pattern=s.sequence.patterns.find(p=>p.id===part.patternId);const b=button(part.name,()=>this.partActions(part));b.dataset.phrase=part.id;b.disabled=locked;const small=document.createElement('small');small.textContent=(pattern?.bars??part.checkpoint?.draft?.working.pattern.bars??4)+'小節'+(part.checkpoint?.draft?'・つくりかけ':'');b.append(small);shelf.append(b);}shelf.scrollTop=oldShelf;
  const line=$('sequence-line'),scroll=line.scrollTop;line.replaceChildren();
  const gap=index=>{const b=button('＋',()=>this.chooseInsertion(index));b.className='sequence-gap';b.dataset.gap=index;b.setAttribute('aria-label',index===0?'先頭にパーツを入れる':index+'個目の後にパーツを入れる');b.disabled=locked||draft.placements.length>=16;return b;};
  line.append(gap(0));for(const [i,p] of draft.placements.entries()){
   const phrase=draft.patterns.find(x=>x.id===p.patternId),b=button((i+1)+'. '+phrase.name,()=>this.gestures.tap(p.id));b.dataset.placement=p.id;b.disabled=s.busy||!!s.proposal;b.classList.toggle('sequence-draft',!!s.proposal);b.setAttribute('aria-pressed',String(s.selected===p.id));const small=document.createElement('small');small.textContent=phrase.bars+'小節';b.append(small);line.append(b,gap(i+1));
  }line.scrollTop=scroll;this.gestures.render();
  $('sequence-message').textContent=s.proposal?'候補の並びです。聴いて、オッケーで決めよう。':this.placingPart?'＋で入れる場所を選んでね。':'カードを長押し：外す・移動';
  $('sequence-undo').textContent=s.proposal?'取消':'もどす';if(this.parkedPlacement)$('sequence-undo').disabled=true;
 }
}
