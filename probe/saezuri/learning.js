import {inputSteps} from './input-help.js?v=v0.1.0-20261018120410-8ca67c2';
import {blankPattern} from './entry-session.js?v=v0.1.0-20261018120410-8ca67c2';
import {practicePhrases,practicePhrase} from './learning-data.js?v=v0.1.0-20261018120410-8ca67c2';
import {lessonGuide,lessonFingerprint,LESSON_TITLES,LESSON_RANGES} from './tutorial-guide.js?v=v0.1.0-20261018120410-8ca67c2';
import {tutorialPattern,tutorialExcerpt,TUTORIAL_TEMPO} from './tutorial-data.js?v=v0.1.0-20261018120410-8ca67c2';
import {TutorialPreview} from './tutorial-preview.js?v=v0.1.0-20261018120410-8ca67c2';
import {renderTutorialView} from './tutorial-view.js?v=v0.1.0-20261018120410-8ca67c2';
const $=id=>document.getElementById(id);
const modelTitles=['完成形','2つの音','1小節','2小節','3小節目','つなぐ音','4小節','伴奏つき'];
export class MelodyLearning {
 constructor(shell){
  this.shell=shell;this.active=false;this.guideHidden=false;this.heard=false;this.lastStep=null;
  const actions=document.querySelector('.source-actions');
  const tutorial=document.createElement('button');tutorial.id='new-tutorial';tutorial.innerHTML='おてほんから つくる<small>① 案内にそって、操作をおぼえる</small>';
  tutorial.onclick=()=>shell.requestDiscard(()=>this.start(),true);
  $('choose-example').innerHTML='おためしを アレンジ<small>② フレーズを選んで、じぶんの音に</small>';
  $('choose-example').onclick=()=>shell.go('samples');
  $('new-manual').innerHTML='じゆうに つくる<small>③ 空から、すきな音をならべる</small>';
  actions.prepend(tutorial,$('choose-example'),$('new-manual'));
  const screen=document.createElement('section');screen.id='melody-samples';screen.className='melody-screen';
  screen.innerHTML='<div class="screen-heading"><button id="samples-back"></button><h2 tabindex="-1">おためしを アレンジ</h2></div><p class="samples-intro">聴いてえらぼう。元のフレーズは残して、コピーを自由に直せます。</p><div id="practice-list"></div>';
  document.querySelector('main').append(screen);shell.screens.samples=screen;
  shell.icon($('samples-back'),'back','もどる','つくり方を選ぶ画面へ');$('samples-back').onclick=()=>shell.go('choose');
  for(const p of practicePhrases()){
   const card=document.createElement('article');card.className='practice-card';
   const title=document.createElement('h3');title.textContent=p.name;
   const desc=document.createElement('p');desc.textContent=p.description;
   const row=document.createElement('div');row.className='practice-actions';
   const listen=document.createElement('button');listen.textContent='▶ 聴く';listen.dataset.practiceListen=p.id;
   listen.onclick=()=>shell.onAudition(practicePhrase(p.id));
   const edit=document.createElement('button');edit.textContent='これをアレンジ';edit.dataset.practiceEdit=p.id;
   edit.onclick=()=>this.openNew(()=>{this.end();const item=practicePhrase(p.id);shell.onOpenPattern(item.pattern,'preset',item.tempo);shell.go('create');shell.setMode('edit');$('phrase-name').value=item.name+' アレンジ';});
   row.append(listen,edit);card.append(title,desc,row);$('practice-list').append(card);
  }
  const guide=document.createElement('aside');guide.id='learning-guide';guide.hidden=true;guide.setAttribute('aria-label','おてほんの案内');
  guide.innerHTML='<div class="learning-heading"><strong id="learning-step"></strong><button id="learning-close">案内をとじる</button></div><div role="status" aria-live="polite" aria-atomic="true"><strong id="learning-action"></strong><p id="learning-message"></p></div><div id="learning-input-rule"><strong>音は、この順番で置くよ</strong>' + inputSteps + '<p>声なら「ド いっぱく」→「オッケー」。声 ON にして、受付の表示を待とう。</p></div><div id="learning-transition" hidden><small id="learning-next-label"></small><div class="learning-guide-actions"><button id="learning-model">おてほんを聴く</button><button id="learning-next" hidden>つぎへ</button></div></div><button id="learning-cancel" hidden>とりけす</button><button id="learning-position" hidden>つぎの場所へ</button>';
  $('creation-tabs').before(guide);guide.querySelector('.learning-heading').insertBefore(guide.querySelector('#learning-model'),guide.querySelector('#learning-close'));
  const reopen=document.createElement('button');reopen.id='learning-reopen';reopen.textContent='案内をひらく';reopen.hidden=true;guide.after(reopen);
  const workspace=document.createElement('section');workspace.id='learning-workspace';workspace.hidden=true;
  workspace.innerHTML='<div class="learning-view-heading"><div class="tutorial-display-switch" role="group" aria-label="メロディーの表示"><button data-learning-view="cards">カード</button><button data-learning-view="score">五線譜</button></div><button id="learning-how" aria-label="音の置き方と声の使い方">？</button><button id="learning-voice" aria-pressed="false">声 OFF</button></div><div id="learning-melody"></div><div id="learning-length-edit"><span>選んだ音の長さ</span><button data-lesson-length="4">1ぱく</button><button data-lesson-length="8">2はく</button></div>';
  $('capture-score').before(workspace);
  this.preview=new TutorialPreview({onPlay:data=>shell.onTutorialPlay(data),onStop:()=>shell.onStop(),onNavigate:()=>shell.onNavigate(),onDisplay:display=>{this.display=display;this.sync(shell.phase);}});this.display='cards';
  for(const b of workspace.querySelectorAll('[data-learning-view]'))b.onclick=()=>{this.display=b.dataset.learningView;this.preview.setDisplay(this.display);this.sync(shell.phase);};
  for(const b of workspace.querySelectorAll('[data-lesson-length]'))b.onclick=()=>shell.editor.changeNoteLength(Number(b.dataset.lessonLength));
  $('learning-how').onclick=()=>$('composer-help').click();
  $('learning-voice').onclick=()=>{const enabled=!$('edit-voice').checked;if(enabled&&$('mic').getAttribute('aria-pressed')!=='true')$('mic').click();$('edit-voice').checked=enabled;$('edit-voice').dispatchEvent(new Event('change'));this.sync(shell.phase);};
  $('learning-close').onclick=()=>{this.guideHidden=true;this.sync(shell.phase);};
  reopen.onclick=()=>{this.guideHidden=false;this.sync(shell.phase);};
  $('learning-cancel').onclick=()=>shell.editor.command('cancel');
  $('learning-next').onclick=()=>this.next();$('learning-model').onclick=()=>this.audition(true);
  $('learning-position').onclick=()=>{const guide=this.currentGuide();if(guide.kind==='position')shell.editor.moveCursor(guide.tick);};
  $('composer-duration').addEventListener('change',()=>this.sync(shell.phase));
 }

 openNew(action){this.shell.requestDiscard(async()=>{if(this.shell.songWorkflow&&!await this.shell.songWorkflow.allowNew())return;action();});}
 start(){
  this.end();$('composer-length-buttons').append($('composer-rest'));if($('step-entry'))$('step-entry').open=true;
  this.active=true;this.guideHidden=false;this.stage=0;this.modelHeard=false;this.heardOriginal=false;this.heardKey=null;this.display='cards';this.preview.setDisplay('cards');
  $('composer-duration').value='1';$('composer-octave').value='0';$('composer-replace').checked=false;$('instrument').value='fm-piano';
  const accompaniment=tutorialPattern().accompaniment;delete accompaniment.sounds;
  this.shell.onOpenPattern({...blankPattern(),accompaniment},'tutorial',TUTORIAL_TEMPO);this.shell.go('create');this.shell.setMode('input');this.sync(this.shell.phase);
 }
 end(){document.querySelector('#composer-panel .composer-values').append($('composer-rest'));this.active=false;this.preview?.close();document.body.classList.remove('learning-active','learning-complete','learning-guide-hidden');this.guideHidden=false;this.heardKey=null;this.lastStep=null;$('learning-guide').hidden=true;$('learning-reopen').hidden=true;$('learning-workspace').hidden=true;this.clearHighlight();}
 clearHighlight(){for(const node of document.querySelectorAll('[data-learning-target]'))node.removeAttribute('data-learning-target');}
 currentGuide(){const editor=this.shell.editor;return lessonGuide({pattern:editor.pattern,previewPattern:editor.previewPattern,pending:editor.pending,entry:editor.entry,cursor:editor.cursor,selectedNoteId:editor.selectedNoteId,hasRest:editor.hasRest,inputDuration:Number($('composer-duration').value)*4},{stage:this.stage,backingMode:this.shell.mode==='backing',suggestionsOpen:!!$('progression-suggestions')?.open,modelHeard:this.modelHeard,heardOriginal:this.heardOriginal,heard:this.heardKey===lessonFingerprint(editor.previewPattern)});}
 next(){
  if(!this.active||this.shell.busy||!this.currentGuide().done)return;
  if(this.stage===7){this.end();this.shell.go('samples');return;}
  this.preview.close();this.stage++;this.modelHeard=false;this.heardKey=null;
  const starts={1:0,2:8,3:16,4:32,5:48,6:50,7:64};this.shell.editor.moveCursor(starts[this.stage]);
  $('composer-duration').value='1';this.shell.setMode('input');this.sync(this.shell.phase);window.scrollTo(0,0);
  this.audition(true);
 }
 audition(model=false){
  if(!this.active||this.shell.busy||this.shell.editor.entry?.proposal.code)return;
  const range=LESSON_RANGES[this.stage],pattern=model?tutorialPattern({backing:this.stage===0||this.stage===7}):this.shell.editor.previewPattern;
  let [start,end]=range;if(!model){end=Math.max(start+2,...pattern.notes.filter(n=>n.startTick>=start||n.startTick+n.durationTick>start).map(n=>n.startTick+n.durationTick));end=Math.min(range[1],end);}
  const key=lessonFingerprint(pattern),stage=this.stage;
  this.preview.setDisplay(this.display);this.preview.open(tutorialExcerpt(pattern,start,end),{title:model?`${modelTitles[this.stage]}の おてほん`:'いまの曲を 聴く',onHeard:()=>{if(!this.active||stage!==this.stage)return;if(model)this.modelHeard=true;else {this.heardKey=key;if(stage===1&&pattern.notes[0]?.midi===60)this.heardOriginal=true;}this.sync(this.shell.phase);}});this.preview.play();
 }
 handleVoice(command){
  if(!this.active||this.shell.screen!=='create')return false;
  if(command?.type==='tutorial'&&command.action==='replay'||command==='preview'&&this.preview.openNow){
   if(this.preview.openNow)this.preview.replay();else if(!this.shell.busy)this.audition(this.stage===0);
   return true;
  }
  if(command?.type==='tutorial'){
   if(command.action==='close'){this.preview.close();return true;}
   if(this.shell.busy)return true;
   if(command.action==='next'){this.preview.close();this.next();}
   if(command.action==='model'){this.preview.close();this.audition(true);}
   return true;
  }
  if(command?.type==='loop-stop'){if(this.preview.openNow)this.preview.stop();else this.shell.onStop();return true;}
  if(this.shell.busy)return true;
  if(command==='preview'){this.preview.close();this.audition(this.stage===0);return true;}
  if(command==='next'&&this.currentGuide().done){this.preview.close();this.next();return true;}
  if(this.preview.openNow){if(command==='confirm'){this.preview.close();this.shell.editor.command('confirm');}return true;}
  return false;
 }
 sync(phase){
  $('new-tutorial').disabled=this.shell.busy;for(const b of $('practice-list').querySelectorAll('button'))b.disabled=this.shell.busy;
  const editor=this.shell.editor;if(this.active&&!editor.isOpen)this.end();const show=this.active&&editor.isOpen;
  $('learning-guide').hidden=!show||this.guideHidden;$('learning-reopen').hidden=!show||!this.guideHidden;$('learning-workspace').hidden=!show;
  document.body.classList.toggle('learning-active',show);document.body.classList.toggle('learning-guide-hidden',show&&this.guideHidden);this.clearHighlight();if(!show)return;
  const guide=this.currentGuide();this.guide=guide;$('learning-guide').dataset.stage=this.stage;$('learning-guide').dataset.kind=guide.kind;document.body.dataset.learningKind=guide.kind;
  $('learning-step').textContent=`${this.stage+1} / 8・${LESSON_TITLES[this.stage]}`;$('learning-action').textContent=guide.action;$('learning-message').textContent=guide.text;
  $('learning-next').hidden=!guide.done;$('learning-next').textContent=this.stage===0?'つくってみよう →':this.stage===7?'おためしを アレンジ →':`つぎへ：${LESSON_TITLES[this.stage+1]} →`;
  $('learning-transition').hidden=!guide.done;$('learning-next-label').textContent=this.stage===7?'8つのれんしゅうが できました！':'このれんしゅうは おわり。つぎは…';
  $('learning-input-rule').hidden=this.stage!==0;
  $('learning-how').disabled=this.shell.busy;
  $('learning-model').textContent='♪ おてほん';$('learning-model').setAttribute('aria-label','おてほんを聴く');
  $('learning-cancel').hidden=guide.kind!=='recover'||!editor.pending;
  $('learning-position').hidden=guide.kind!=='position';
  const backingHint=$('progression-guide');if(backingHint){backingHint.hidden=this.stage!==7||!$('progression-suggestions')?.open;backingHint.textContent='C → F → G → C の候補をためそう。ほかの候補も聴き比べられます。';}
  for(const id of ['learning-next','learning-model','learning-position','learning-cancel'])$(id).disabled=this.shell.busy;
  document.body.classList.toggle('learning-complete',this.stage===7&&!!guide.done);document.body.dataset.learningStage=String(this.stage);
  if(guide.mode&&!this.shell.busy)this.shell.setMode(guide.mode);
  $('learning-length-edit').hidden=![3,5].includes(this.stage)||this.shell.mode!=='edit';
  for(const b of $('learning-length-edit').querySelectorAll('button'))b.disabled=this.shell.busy||!!editor.entry;
  (this.stage===0?$('learning-guide'):document.querySelector('.learning-view-heading')).append($('learning-voice'));
  $('learning-voice').textContent=$('edit-voice').checked&&$('mic').getAttribute('aria-pressed')==='true'?'声 ON':'声 OFF';$('learning-voice').setAttribute('aria-pressed',String($('edit-voice').checked));
  for(const b of $('learning-workspace').querySelectorAll('[data-learning-view]'))b.setAttribute('aria-pressed',String(b.dataset.learningView===this.display));
  const pattern=editor.previewPattern,selected=pattern.notes.find(n=>n.id===editor.selectedNoteId),focus=guide.noteId?pattern.notes.find(n=>n.id===guide.noteId)?.startTick:guide.mode==='edit'?selected?.startTick:editor.cursor;
  renderTutorialView($('learning-melody'),pattern,{display:this.display,barStart:Math.min(3,Math.floor((focus??0)/16)),barCount:1,selectedId:editor.selectedNoteId,onSelect:id=>{if(!this.shell.busy&&!editor.entry){const index=pattern.notes.findIndex(n=>n.id===id);editor.command(`select:${index+1}`);}}});
  if(guide.target&&!this.shell.busy&&this.shell.screen==='create'){
   for(const node of document.querySelectorAll(guide.target)){
    if(guide.noteId&&node.dataset.noteId!==guide.noteId)continue;
    if(node.getClientRects().length)node.setAttribute('data-learning-target','');
   }
   if(this.stage===7&&!document.querySelector('dialog[open]')){
    const target=document.querySelector(guide.target),limit=document.querySelector('body>footer').getBoundingClientRect().top-8;
    if(target?.getClientRects().length){const bottom=target.getBoundingClientRect().bottom;if(bottom>limit)window.scrollBy(0,bottom-limit);}
   }
  }
 }
}
