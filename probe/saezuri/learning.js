import {blankPattern} from './entry-session.js?v=v0.1.0-20261002214255-70753ad';
import {practicePhrases,practicePhrase,tutorialGuide} from './learning-data.js?v=v0.1.0-20261002214255-70753ad';
const $=id=>document.getElementById(id);
export class MelodyLearning {
 constructor(shell){
  this.shell=shell;this.active=false;this.heard=false;this.lastStep=null;
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
  guide.innerHTML='<div class="learning-heading"><strong id="learning-step"></strong><button id="learning-close">案内をとじる</button></div><div role="status" aria-live="polite" aria-atomic="true"><strong id="learning-action"></strong><p id="learning-message"></p></div><button id="learning-next" hidden>つぎは おためしをアレンジ</button>';
  $('creation-tabs').before(guide);
  $('learning-close').onclick=()=>{this.end();this.sync(shell.phase);};
  $('learning-next').onclick=()=>shell.go('samples');
 }
 openNew(action){this.shell.requestDiscard(async()=>{if(this.shell.songWorkflow&&!await this.shell.songWorkflow.allowNew())return;action();});}
 start(){
    if($('step-entry'))$('step-entry').open=true;
  this.active=true;this.heard=false;this.lastStep=null;
  $('composer-duration').value='1';$('composer-octave').value='0';$('composer-replace').checked=false;
  this.shell.onOpenPattern(blankPattern(),'tutorial',120);this.shell.go('create');this.shell.setMode('input');
 }
 end(){document.body.classList.remove('learning-active','learning-complete');this.active=false;this.heard=false;this.lastStep=null;$('learning-guide').hidden=true;this.clearHighlight();}
 clearHighlight(){for(const node of document.querySelectorAll('[data-learning-target]'))node.removeAttribute('data-learning-target');}
 sync(phase){
  $('new-tutorial').disabled=this.shell.busy;
  for(const b of $('practice-list').querySelectorAll('button'))b.disabled=this.shell.busy;
  const editor=this.shell.editor;if(this.active&&!editor.isOpen)this.end();const show=this.active&&editor.isOpen;
  $('learning-guide').hidden=!show;document.body.classList.toggle('learning-active',show);this.clearHighlight();if(!show)return;
  const notes=editor.previewPattern?.notes??[];
  if(notes[0]?.midi!==62)this.heard=false;
  if(phase==='playing'&&this.shell.screen==='create'&&notes.length===2&&notes[0].midi===62)this.heard=true;
  const guide=tutorialGuide(editor,this.heard);
  $('learning-step').textContent=guide.done?'おてほん 完了':`おてほん ${guide.step||'やりなおし'} / 6`;
  const actions={0:'「もどす」で やりなおそう',1:'「ド」を 押そう',2:'「ミ」を 押そう',3:'1ばんの カードを 選ぼう',4:notes[0]?.midi===61?'もう1回 「たかく」':'「たかく」を 2回',5:'「聴く」で たしかめよう',6:'「オッケー」で 決めよう',7:'できた！ つぎはアレンジ'};
  $('learning-action').textContent=guide.target==='#capture-edit-confirm'?'「オッケー」で 決めよう':actions[guide.step];
  document.body.classList.toggle('learning-complete',!!guide.done);
  const detail={1:editor.entry?'点線の音が候補です。決めると音符になります。':'高さは「ふつう」、長さは1拍です。',2:editor.entry?'つぎの音も、オッケーで置きます。':'つぎの場所に、1拍のミを置きます。',3:'譜面の音を押しても選べます。',4:notes[0]?.midi===61?'もう一度押すと、ドがレになります。':'ドをレに変えます。まだ仮の変更です。',5:'変えた音の流れを聴いてみよう。',6:'よければ、変えた高さを確定します。',7:'音を置く・直す・聴く・決めるを体験しました。'};
  $('learning-message').textContent=detail[guide.step]??guide.text;$('learning-next').hidden=!guide.done;
  if(guide.mode&&guide.step!==this.lastStep&&!this.shell.busy)this.shell.setMode(guide.mode);
  this.lastStep=guide.step;
  if(guide.target&&!this.shell.busy&&this.shell.screen==='create')document.querySelector(guide.target)?.setAttribute('data-learning-target','');
 }
}
