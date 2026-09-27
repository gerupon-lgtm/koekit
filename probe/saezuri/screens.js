import {emptySequence,keepPhrase,sequencePlayback,proposeSequence,commitSequence,undoPlacement} from './sequence-session.js';
const $=id=>document.getElementById(id);
const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;return b;};

export class MelodyScreens {
 constructor({editor,onStop,onNavigate,onPlay,onNew,onExample}) {
  Object.assign(this,{editor,onStop,onNavigate,onPlay,onNew,onExample});
  this.screen='home';this.sequence=emptySequence();this.proposal=null;this.selected=null;this.mode='input';this.busy=false;
  document.body.classList.add('melody-app');document.title='サエズリズム';
  document.querySelector('main > header').hidden=true;
  const main=document.querySelector('main');
  const home=document.createElement('section');home.id='melody-home';home.className='melody-screen';
  home.innerHTML=`<nav class="home-nav"><a class="menu-home" href="../../" aria-label="コエキットへ"><svg viewBox="0 0 24 24"><path d="M12 3l9 8h-2.5v9h-5.5v-6h-2v6H5.5v-9H3z"/></svg></a><button class="menu-help" id="melody-help" aria-label="つかいかた">？</button></nav>
   <h1><img src="../../assets/brand/saezurhythm.svg" alt="サエズリズム"></h1><p class="home-caption">こえと タッチで、メロディーを つくろう。</p>
   <div class="home-menu"><button id="home-create">つくる<small>音をならべて、ひとつのフレーズに</small></button><button id="home-connect">つなげる<small>フレーズをならべて、長い曲に</small></button><button id="home-resume" hidden>つづきから</button></div>
   <p class="session-note">このタブの中で試せます。再読み込みすると作業は消えます。</p><p class="home-credit">試作 v21　© 2026 SIKUMI LAB</p>`;
  const choose=document.createElement('section');choose.id='melody-choose';choose.className='melody-screen';
  choose.innerHTML='<div class="screen-heading"><button data-screen-back>← トップ</button><h2 tabindex="-1">つくる</h2></div><p>どこから はじめる？</p><div id="creation-choices"></div><p id="choose-notice" role="status"></p>';
  const create=document.createElement('div');create.id='melody-create';create.className='melody-screen';
  create.innerHTML='<div class="screen-heading"><button data-screen-back>← トップ</button><h2 tabindex="-1">つくる</h2><button id="screen-settings">設定</button></div><div id="creation-tabs" aria-label="操作"><button data-mode="input">音を置く</button><button data-mode="edit">音を直す</button><button data-mode="backing">伴奏</button></div>';
  const connect=document.createElement('section');connect.id='melody-connect';connect.className='melody-screen';
  connect.innerHTML='<div class="screen-heading"><button data-screen-back>← トップ</button><h2 tabindex="-1">つなげる</h2><button id="sequence-settings">音の設定</button></div><p id="sequence-empty">まだフレーズがありません。つくる画面で「フレーズにする」を押すと、ここで選べます。</p><button id="sequence-create">フレーズをつくる</button><h3>使うフレーズを選ぶ</h3><div id="phrase-shelf" aria-label="使えるフレーズ"></div><h3>ならべる順番 <small id="sequence-count"></small></h3><div id="sequence-line" aria-label="曲の順番"></div><div class="sequence-edit"><button id="sequence-left">← 前へ</button><button id="sequence-right">次へ →</button><button id="sequence-delete">はずす</button></div><p id="sequence-message" role="status">フレーズを選ぶと、最後に追加する候補になります。</p><div class="sequence-actions"><button id="sequence-preview">▶ 聴く</button><button id="sequence-confirm">オッケー</button><button id="sequence-undo">もどす</button></div>';
  main.append(home,choose,create,connect);
  this.screens={home,choose,create,connect};
  const source=$('editor-source');source.open=true;$('creation-choices').append(source);
  const chooseMic=button('マイク ON',()=>$('mic').click());chooseMic.id='choose-mic';$('creation-choices').prepend(chooseMic);
  $('new-manual').textContent='じゆうに つくる';$('new-image').textContent='イメージから つくる';$('capture').textContent='ハナウタで つくる';
  const sample=button('おためしの フレーズ',()=>{if(!editor.pending){onExample();this.go('create');this.setMode('edit');}});sample.id='choose-example';source.querySelector('.source-actions').append(sample);
  for(const id of ['new-manual','new-image']) $(id).addEventListener('click',()=>{if(!editor.pending){$('phrase-feedback').textContent='';this.go('create');this.setMode(id==='new-image'?'backing':'input');}});
  // The recording button keeps its existing permission / start handler.
  $('capture').addEventListener('click',()=>this.go('create',{stop:false}));
  create.append($('edit-workspace'));
  const captureProgress=$('capture-position');create.insertBefore(captureProgress,$('edit-workspace'));
  const dialog=document.createElement('dialog');dialog.id='melody-settings';dialog.setAttribute('aria-label','設定');
  dialog.innerHTML='<div class="screen-heading"><h2>設定</h2><button id="settings-close">とじる</button></div><div id="sound-settings"></div><div id="creation-settings"></div>';
  main.append(dialog);this.dialog=dialog;
  $('sound-settings').append(document.querySelector('.listen-settings'));
  $('creation-settings').append($('composer-panel').querySelector('details'),document.querySelector('.quick-transpose'),$('editor-more'),document.querySelector('.editor-finish'),$('technical-tools'));
  dialog.append($('copy-status'),$('copy-fallback'));
  $('settings-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{onNavigate();});
  $('screen-settings').onclick=()=>this.openSettings();$('sequence-settings').onclick=()=>this.openSettings();
  $('melody-help').onclick=()=>{
   const help=document.createElement('dialog');help.className='melody-help';help.innerHTML='<h2>つかいかた</h2><p>「つくる」で音を置いて、聴いて、オッケー。「フレーズにする」でつなげる画面に持っていけます。</p><p>「つなげる」でフレーズを順番に選びます。追加・並べ替えはオッケーで決定。声を使わなくても操作できます。</p>';
   help.append(button('とじる',()=>help.close()));help.addEventListener('close',()=>help.remove());main.append(help);help.showModal();
  };
  const toolbar=document.querySelector('.edit-toolbar'),listen=document.querySelector('.listen-actions');
  const edit=document.createElement('div');edit.id='screen-note-edit';
  edit.append($('capture-selection'),document.querySelector('.note-navigation'),document.querySelector('.note-actions'));
  toolbar.prepend(edit);
  // Keep the candidate, confirm and audition together, independent of editor tab.
  toolbar.append($('composer-candidate'),listen,$('capture-edit-status'));
  const save=document.createElement('div');save.className='phrase-register';
  save.innerHTML='<label>フレーズの名前<input id="phrase-name" maxlength="24" placeholder="フレーズ1"></label><button id="keep-phrase">フレーズにする</button><p id="phrase-feedback" role="status"></p>';
  create.append(save);
  $('keep-phrase').onclick=()=>this.keep();
  for(const b of document.querySelectorAll('[data-mode]')) b.onclick=()=>this.setMode(b.dataset.mode);
  for(const id of ['capture-score','capture-blocks'])$(id).addEventListener('click',event=>{if(!this.busy&&!editor.pending&&event.target.closest('[data-note-id]'))this.setMode('edit');});
  for(const b of document.querySelectorAll('[data-screen-back]'))b.onclick=()=>this.go('home');
  $('home-create').onclick=()=>this.go('choose');$('home-connect').onclick=()=>this.go('connect');
  $('home-resume').onclick=()=>this.go('create');$('sequence-create').onclick=()=>this.go('choose');
  for(const id of ['adopt','discard'])$(id).addEventListener('click',()=>{if(!editor.isOpen)this.go('home');});
  $('sequence-preview').onclick=()=>{const data=sequencePlayback(this.proposal?.next??this.sequence);if(data.pattern?.bars)onPlay(data,!!this.proposal);};
  $('sequence-confirm').onclick=()=>{if(!this.busy&&this.proposal){const next=commitSequence(this.sequence,this.proposal);if(!next.code){this.sequence=next;this.proposal=null;this.renderSequence();}}};
  $('sequence-undo').onclick=()=>{if(this.busy)return;if(this.proposal)this.proposal=null;else this.sequence=undoPlacement(this.sequence);this.renderSequence();};
  for(const [id,type,delta] of [['sequence-left','move',-1],['sequence-right','move',1],['sequence-delete','remove',0]])$(id).onclick=()=>this.stage({type,placementId:this.selected,index:this.sequence.placements.findIndex(p=>p.id===this.selected)+delta});
  addEventListener('popstate',()=>this.go(['home','choose','create','connect'].includes(history.state?.melodyScreen)?history.state.melodyScreen:'home',{history:false}));
  history.replaceState({...history.state,melodyScreen:'home'},'');this.go('home',{history:false});
 }
 get allowsVoice(){return this.screen==='create'&&!this.dialog.open;}
 openSettings(){ $('creation-settings').hidden=this.screen!=='create';this.dialog.showModal();this.onNavigate();}
 go(screen,{history:push=true,stop=true}={}) {
  if(screen==='create'&&!this.editor.isOpen&&this.phase==='idle')screen='choose';
  if(stop)this.onStop();
  this.dialog.close();this.screen=screen;document.body.dataset.melodyScreen=screen;
  for(const [name,node] of Object.entries(this.screens))node.hidden=name!==screen;
  if(screen==='choose')$('editor-source').open=true;
  document.querySelector('body > footer').hidden=!['create','connect'].includes(screen);
  if(push)history.pushState({...history.state,melodyScreen:screen},'');
  this.onNavigate();this.sync(this.phase??'idle');window.scrollTo(0,0);
  (this.screens[screen].querySelector('h2')??this.screens[screen].querySelector('button'))?.focus({preventScroll:true});
 }
 setMode(mode){this.mode=mode;if(mode==='backing')$('image-settings').open=true;document.body.dataset.createMode=mode;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));}
 sync(phase) {
  this.phase=phase;this.busy=phase!=='idle';
  const manual=this.editor.previewPattern?.source==='manual';
  if(!manual&&this.mode==='input')this.setMode('edit');
  $('home-resume').hidden=!this.editor.isOpen;
  $('choose-mic').textContent=$('mic').textContent;
  $('choose-example').disabled=this.busy||this.editor.pending;
  $('choose-notice').textContent=this.editor.pending?'入力中の候補があります。「つづきから」で確定か取消をすると、新しく作れます。':'';
  $('capture-position').hidden=!['preparing','count-in','recording','analyzing'].includes(phase);
  $('keep-phrase').disabled=this.busy||!this.editor.isOpen||this.editor.pending||!!this.proposal||!this.editor.pattern?.notes.length;
  if(this.proposal)$('phrase-feedback').textContent='つなげる画面の候補を確定か取消してから登録できます。';
  $('phrase-name').disabled=this.busy;
  for(const b of document.querySelectorAll('[data-mode]'))b.disabled=this.busy||(b.dataset.mode!=='edit'&&!manual);
  document.body.dataset.createMode=this.mode;
  $('composer-candidate').hidden=!manual||this.mode==='backing';
  this.renderSequence();
 }
 keep() {
  if(this.busy||!this.editor.isOpen||this.editor.pending||this.proposal||!this.editor.pattern)return;
  if(!this.editor.accepted)this.editor.command('confirm');
  const next=keepPhrase(this.sequence,this.editor.pattern,$('phrase-name').value);
  if(next.code)return;
  this.sequence=next;this.proposal=null;
  $('phrase-feedback').textContent=`「${next.patterns.at(-1).name}」をつなげる画面に追加しました。`;
  $('phrase-name').value='';$('phrase-name').placeholder=`フレーズ${next.patterns.length+1}`;
  this.renderSequence();
 }
 stage(command) {
  if(this.busy||this.proposal)return;
  const next=proposeSequence(this.sequence,command);
  if(next.code){$('sequence-message').textContent=next.code==='PLACEMENT_LIMIT'?'16個まで並べられます。':'その並べ方にはできません。';return;}
  this.proposal=next;if(command.type==='append')this.selected=command.placement.id;this.renderSequence();
 }
 renderSequence() {
  const draft=this.proposal?.next??this.sequence,locked=this.busy||!!this.proposal;
  $('sequence-empty').hidden=!!this.sequence.patterns.length;
  $('sequence-create').hidden=!!this.sequence.patterns.length;
  const shelf=$('phrase-shelf');shelf.replaceChildren();
  for(const p of this.sequence.patterns){const b=button(`${p.name} ・ ${p.bars}小節`,()=>this.stage({type:'append',placement:{id:`place-${this.sequence.revision}`,patternId:p.id}}));b.dataset.phrase=p.id;b.disabled=locked||draft.placements.length>=16;shelf.append(b);}
  const line=$('sequence-line');line.replaceChildren();
  if(!draft.placements.some(p=>p.id===this.selected))this.selected=draft.placements[0]?.id??null;
  for(const [i,p] of draft.placements.entries()){
   const phrase=draft.patterns.find(n=>n.id===p.patternId),b=button(`${i+1}. ${phrase.name}`,()=>{this.selected=p.id;this.renderSequence();});b.dataset.placement=p.id;b.setAttribute('aria-pressed',String(this.selected===p.id));b.classList.toggle('sequence-draft',!!this.proposal&&this.sequence.placements.findIndex(n=>n.id===p.id)!==i);b.disabled=this.busy;line.append(b);
  }
  const index=draft.placements.findIndex(p=>p.id===this.selected);
  $('sequence-left').disabled=locked||index<=0;$('sequence-right').disabled=locked||index<0||index>=draft.placements.length-1;
  $('sequence-delete').disabled=locked||index<0;
  $('sequence-preview').disabled=this.busy||!draft.placements.length;
  $('sequence-confirm').disabled=this.busy||!this.proposal;
  $('sequence-undo').disabled=this.busy||(!this.proposal&&!this.sequence.undoStack.length);
  this.ranges=sequencePlayback(draft).ranges??[];
  $('sequence-count').textContent=`${draft.placements.length} / 16 ・ ${(this.ranges.at(-1)?.end??0)/16}小節`;
  $('sequence-message').textContent=this.proposal?'仮の順番です。聴いてからオッケーで決めます。':'フレーズを選ぶと、最後に追加する候補になります。';
 }
 follow(tick){if(this.screen!=='connect')return;const active=tick==null?null:this.ranges?.find(p=>p.start<=tick&&tick<p.end);
  if(this.playingId===active?.id)return;this.playingId=active?.id;
  const line=$('sequence-line');for(const b of line.children){const playing=b.dataset.placement===active?.id;b.toggleAttribute('data-playing',playing);if(playing)line.scrollTop+=b.getBoundingClientRect().top-line.getBoundingClientRect().top-(line.clientHeight-b.offsetHeight)/2;}
 }
}
