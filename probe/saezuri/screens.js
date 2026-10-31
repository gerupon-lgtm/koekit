import {formatBuildTime} from './build-display.js?v=v0.1.0-20261031144007-3fbf8da';
import {MelodyLearning} from './learning.js?v=v0.1.0-20261031144007-3fbf8da';
import {emptySequence,canKeepPhrase,keepPhrase,sequencePlayback,proposeSequence,commitSequence,undoPlacement} from './sequence-session.js?v=v0.1.0-20261031144007-3fbf8da';
import {readCaptureReport} from './capture-report.js?v=v0.1.0-20261031144007-3fbf8da';
import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261031144007-3fbf8da';
import {PlacementWorkflow} from './placement-workflow.js?v=v0.1.0-20261031144007-3fbf8da';
import {EndingWorkflow} from './ending-workflow.js?v=v0.1.0-20261031144007-3fbf8da';
import {extractSongPhrases} from './phrase-transfer.js?v=v0.1.0-20261031144007-3fbf8da';
const $=id=>document.getElementById(id);
const trialBuild=new URL(import.meta.url).searchParams.get('v')||'local-20261010';
const trialVersion=formatBuildTime(trialBuild);
const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;return b;};

export class MelodyScreens {
 constructor({editor,onStop,onNavigate,onPlay,onDiscard,onOpenPattern,onAudition,onEditWorkspace,onTutorialPlay}) {
  Object.assign(this,{editor,onStop,onNavigate,onPlay,onDiscard,onOpenPattern,onAudition,onTutorialPlay});
  this.screen='home';this.sequence=emptySequence();this.proposal=null;this.selected=null;this.mode='input';this.busy=false;
  document.body.classList.add('melody-app');
  document.querySelector('#composer-panel .composer-values').append(document.querySelector('[data-pitch="7"]'));
  document.querySelector('[data-pitch="7"]').id='composer-rest';document.title='サエズリズム';
  document.querySelector('main > header').hidden=true;
  const main=document.querySelector('main');
  const home=document.createElement('section');home.id='melody-home';home.className='melody-screen';
  home.innerHTML=`<nav class="home-nav"><a class="menu-home" href="../../" aria-label="コエキットへ"><svg viewBox="0 0 24 24"><path d="M12 3l9 8h-2.5v9h-5.5v-6h-2v6H5.5v-9H3z"/></svg></a></nav>
   <h1 tabindex="-1"><img src="../../assets/brand/saezurhythm.svg" alt="サエズリズム"></h1><p class="home-caption">こえと タッチで、メロディーを つくろう。</p>
   <div class="home-menu"><button id="home-create">新しくつくる<small>作り方を選んではじめる</small></button></div><div class="home-support"><button id="home-tutorial">おてほん</button><button id="home-help">使い方</button></div>
   <p class="session-note">このタブの中で試せます。再読み込みすると作業は消えます。</p><p class="home-credit" data-build="${trialBuild}">開発版 ${trialVersion}　© 2026 SIKUMI LAB</p>`;
  const choose=document.createElement('section');choose.id='melody-choose';choose.className='melody-screen';
  choose.innerHTML='<div class="screen-heading"><button id="choose-cancel" data-screen-back>取消</button><h2 tabindex="-1">作り方を選ぶ</h2></div><p id="choose-song-name"></p><p>どこから はじめる？</p><div id="creation-choices"></div><p id="choose-notice" role="status"></p><button id="choose-resume" hidden>つづきから</button>';
  const create=document.createElement('div');create.id='melody-create';create.className='melody-screen';
  create.innerHTML='<div class="screen-heading"><button data-screen-back>← トップ</button><h2 tabindex="-1">つくる</h2><button id="screen-settings">設定</button></div><div id="creation-tabs" aria-label="操作"><button data-mode="input">音を置く</button><button data-mode="edit">音を直す</button><button data-mode="backing">伴奏</button></div>';
  const shape=document.createElement('div');shape.id='phrase-shape';shape.setAttribute('aria-label','ふんいきと小節数');
  const key=$('composer-key'),keyLabel=key.closest('label');for(const child of [...keyLabel.childNodes])if(child.nodeType===3)child.remove();keyLabel.prepend(document.createTextNode('ふんいき'));
  key.title='あかるめ：長調（C）／くらめ：短調（Am）';
  for(const option of key.options){const value=option.value;option.value=value;option.textContent=value==='Am'?'くらめ':'あかるめ';}
  shape.append(keyLabel);const length=document.createElement('label');length.innerHTML='小節数<select id="phrase-bars"><option value="4">4小節</option><option value="8">8小節</option></select>';shape.append(length);
  create.querySelector('#creation-tabs').after(shape);const shapeHint=document.createElement('p');shapeHint.id='phrase-shape-hint';shapeHint.setAttribute('role','status');shape.after(shapeHint);
  shape.before($('image-words'));shape.append($('image-next'),$('image-choice-reopen'));
  length.querySelector('select').onchange=()=>editor.changeStructure({type:'resize',bars:Number($('phrase-bars').value)});
  $('composer-panel').querySelector('details>summary').textContent='入力位置・表示・コピー';
  const connect=document.createElement('section');connect.id='melody-connect';connect.className='melody-screen';
  connect.innerHTML='<div class="screen-heading"><button data-screen-back>← トップ</button><h2 tabindex="-1">つなげる</h2><button id="sequence-settings">音の設定</button></div><p id="sequence-empty">まだフレーズがありません。新しくつくるか、ほかの曲からえらぼう。</p><div class="phrase-source-actions"><button id="sequence-create">フレーズをつくる</button><button id="sequence-import">ほかの曲から</button></div><h3>使うフレーズを選ぶ</h3><div id="phrase-shelf" aria-label="使えるフレーズ"></div><h3>ならべる順番 <small id="sequence-count"></small></h3><div id="sequence-line" aria-label="曲の順番"></div><div class="sequence-edit"><button id="sequence-left">← 前へ</button><button id="sequence-right">次へ →</button><button id="sequence-delete">はずす</button></div><p id="sequence-message" role="status">フレーズを選ぶと、最後に追加する候補になります。</p><div class="sequence-actions"><button id="sequence-preview">▶ 聴く</button><button id="sequence-confirm">オッケー</button><button id="sequence-undo">もどす</button></div>';
  main.append(home,choose,create,connect);
  const songChoice=button('曲をえらぶ',()=>this.songWorkflow?.library({destination:'connect'}));songChoice.id='sequence-song';connect.querySelector('.phrase-source-actions').prepend(songChoice);
  const songName=document.createElement('p');songName.id='sequence-song-name';connect.querySelector('.phrase-source-actions').before(songName);
  this.screens={home,choose,create,connect};
  for(const [node,prefix] of [[create,'work'],[connect,'sequence-work']]){
   const tabs=document.createElement('div');tabs.className='song-work-tabs';tabs.setAttribute('aria-label','同じ曲の作業');
   for(const [screen,label,id] of [['create','フレーズをつくる',`${prefix}-create`],['connect','つなげる',`${prefix}-connect`]]){const b=button(label,()=>this.go(screen));b.id=id;b.dataset.workScreen=screen;tabs.append(b);}
   node.querySelector('.screen-heading').after(tabs);
  }
  const source=$('editor-source');source.open=true;$('creation-choices').append(source);
  const chooseMic=button('マイク ON',()=>$('mic').click());chooseMic.id='choose-mic';$('creation-choices').prepend(chooseMic);
  $('new-manual').textContent='じゆうに つくる';$('new-image').textContent='イメージから つくる';$('capture').textContent='ハナウタで つくる';
  const sample=button('おためしを アレンジ',()=>this.go('samples'));sample.id='choose-example';source.querySelector('.source-actions').append(sample);
  // Creation opens its screen after the asynchronous storage-capacity check.
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
  setupPlaybackSheet(dialog,{closeId:'settings-close',stopId:'settings-stop',onStop,stopOnClose:false});
  $('settings-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{const inline=$('keyboard-instrument');if(inline)inline.append($('instrument').closest('label'));onNavigate();});
  $('screen-settings').onclick=()=>this.openSettings();$('sequence-settings').onclick=()=>this.openSettings();
  $('home-help').onclick=()=>{
   const help=document.createElement('dialog');help.className='melody-help menu-help-dialog';help.innerHTML='<h2>つかいかた</h2><p>「新しくつくる」で曲をはじめます。「保存した曲をひらく」で前回の作業へ戻れます。</p><p>音を置いて、聴いて、オッケー。「フレーズを登録」で同じ曲の材料に追加します。「フレーズをつくる／つなげる」で作業を切り替えられます。</p><p>作業は自動保存します。「トップへ」は保存が終わってから戻ります。一覧の「聴く」はその場で試聴し、曲をひらく操作とは別です。</p>';
   const voiceHelp=document.createElement('p');voiceHelp.textContent='マイクONと「声で操作」で、「スタート」は伴奏をループ、「ストップ」は停止。ループ中の「はなうた」「ろくおん」で次の先頭から録ります。「イメージからつくる」では「ロック」「ゆっくり」「やさしい」などで伴奏を選び、「別のパターン」で作り直せます。「きく」で聴き、「オッケー」で決めます。';help.append(voiceHelp);
   const close=button('とじる',()=>help.close());close.className='menu-help-dismiss';help.append(close);help.addEventListener('close',()=>help.remove());main.append(help);help.showModal();
  };
  const toolbar=document.querySelector('.edit-toolbar'),listen=document.querySelector('.listen-actions');
  const edit=document.createElement('div');edit.id='screen-note-edit';
  edit.append($('capture-selection'),document.querySelector('.note-navigation'),document.querySelector('.note-actions'),$('capture-time-edit'));
  toolbar.prepend(edit);
  // Keep the candidate, confirm and audition together, independent of editor tab.
  toolbar.append($('composer-candidate'),listen,$('capture-edit-status'));
  const save=document.createElement('div');save.className='phrase-register';
  save.innerHTML='<label>フレーズの名前<input id="phrase-name" maxlength="24" placeholder="フレーズ1"></label><button id="keep-phrase">フレーズを登録</button><p id="phrase-feedback" role="status"></p>';
  create.append(save);
  const next=document.createElement('div');next.id='after-keep';next.hidden=true;next.innerHTML='<button id="after-keep-connect">つなげるへ</button><button id="after-keep-more">もうひとつ つくる</button>';create.append(next);
  $('after-keep-connect').onclick=()=>this.connectKeptPhrase();$('after-keep-more').onclick=()=>this.createAnotherPhrase();
  $('keep-phrase').onclick=()=>this.keep();
  for(const b of document.querySelectorAll('[data-mode]')) b.onclick=()=>{this.setMode(b.dataset.mode);this.onNavigate();};
  for(const id of ['capture-score','capture-blocks'])$(id).addEventListener('click',event=>{if(!this.busy&&!editor.pending&&event.target.closest('[data-note-id]'))this.setMode('edit');});
  for(const b of document.querySelectorAll('[data-screen-back]')){
   const choosing=!!b.closest('#melody-choose');
   this.icon(b,'back',choosing?'取消':'トップへ');b.onclick=()=>this.go(choosing?(this.chooseReturn??'home'):'home');
  }
  $('home-create').onclick=()=>{this.chooseReturn='home';this.go('choose');};$('sequence-create').onclick=()=>this.createAnotherPhrase();
  $('home-tutorial').onclick=()=>this.requestDiscard(()=>this.learning.start(),true);
  $('adopt').addEventListener('click',()=>{if(!editor.isOpen)this.go('home');});
  $('discard').onclick=()=>this.requestDiscard(()=>this.go('home'),true);
  $('discard').hidden=true;
  this.icon($('screen-settings'),'settings','設定');this.icon($('sequence-settings'),'settings','設定');
  $('choose-resume').onclick=()=>this.go('create');
  const confirm=document.createElement('dialog');confirm.id='melody-discard';confirm.setAttribute('aria-labelledby','discard-title');
  confirm.innerHTML='<h2 id="discard-title"></h2><p id="discard-message"></p><p>登録したフレーズと、つなげた順番は残ります。</p><div class="discard-actions"><button id="discard-cancel" autofocus>やめておく</button><button id="discard-confirm">オッケー・破棄する</button></div>';
  main.append(confirm);this.discardDialog=confirm;
  $('discard-cancel').onclick=()=>confirm.close();
  confirm.addEventListener('close',()=>{this.discardAction=null;this.onNavigate();});
  $('discard-confirm').onclick=()=>{const action=this.discardAction;if(!action)return;this.discardAction=null;confirm.close();this.onDiscard();$('phrase-name').value='';$('phrase-feedback').textContent='';action();};
  // Capture phase intercepts existing handlers before they can replace a session.
  for(const id of ['new-manual','new-image','capture','capture-import-button'])$(id).addEventListener('click',event=>{
   if(!this.editor.isOpen)return;
   event.preventDefault();event.stopImmediatePropagation();
   if(id==='capture-import-button'){try{readCaptureReport($('capture-import-text').value);}catch(error){$('capture-import-status').textContent=error.message;return;}}
   this.requestDiscard(()=>$(id).click());
  },true);
  $('sequence-preview').onclick=()=>{const data=sequencePlayback(this.proposal?.next??this.sequence);if(data.pattern?.bars)onPlay(data,!!this.proposal);};
  $('sequence-confirm').onclick=()=>this.confirmSequence();
  $('sequence-undo').onclick=()=>{if(this.busy||this.projectWorkflow?.parkedPlacement)return;if(this.proposal)this.proposal=null;else this.sequence=undoPlacement(this.sequence);this.renderSequence();};
  for(const [id,type,delta] of [['sequence-left','move',-1],['sequence-right','move',1],['sequence-delete','remove',0]])$(id).onclick=()=>this.stage({type,placementId:this.selected,index:this.sequence.placements.findIndex(p=>p.id===this.selected)+delta});
  addEventListener('popstate',()=>{
   const target=['home','choose','create','connect','samples'].includes(history.state?.melodyScreen)?history.state.melodyScreen:'home';
   if(['create','connect'].includes(target)&&this.songWorkflow&&!this.songWorkflow.id&&!this.editor.isOpen&&!this.sequence.patterns.length){this.songWorkflow.library();return;}
   this.go(target,{history:false});
  });
  this.placementWorkflow=new PlacementWorkflow(this,onEditWorkspace);
  this.endingWorkflow=new EndingWorkflow(this);
  this.learning=new MelodyLearning(this);
  history.replaceState({...history.state,melodyScreen:'home'},'');this.go('home',{history:false,focus:false});
 }
 icon(node,type,label,aria=label){
  const paths={back:'M15 5l-7 7 7 7',exit:'M10 4H4v16h6m0-8h11m-5-5 5 5-5 5',settings:'M4 7h16M4 17h16M9 4v6M15 14v6'};
  node.classList.add('melody-icon');node.setAttribute('aria-label',aria);
  node.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[type]}"/></svg><span>${label}</span>`;
 }
 requestDiscard(action,ending=false){
  if(this.placementWorkflow?.active){this.placementWorkflow.cancel();return;}
  if(this.songWorkflow){this.songWorkflow.depart(action,ending);return;}
  if(this.discardDialog.open)return;
  if(!this.editor.isOpen&&!this.busy){action();return;}
  this.onStop();this.discardAction=action;
  $('discard-title').textContent=ending?'作業を破棄して おわる？':'作業を破棄して つくり直す？';
  $('discard-message').textContent='今の音列・入力中の候補・もどす履歴は消えます。';
  this.discardDialog.showModal();this.onNavigate();$('discard-cancel').focus();
 }
 get allowsVoice(){return this.screen==='create'&&![...document.querySelectorAll('dialog[open]')].some(d=>d.id!=='progression-suggestions'&&(d.id!=='learning-preview'||!this.learning?.active));}
 openSettings(){ $('creation-settings').hidden=this.screen!=='create';this.dialog.querySelector('.listen-settings').append($('instrument').closest('label'));this.dialog.showModal();this.onNavigate();}
 go(screen,{history:push=true,stop=true,focus=true}={}) {
  if(this.phase==='saving')return;
  if(screen==='home'&&this.songWorkflow&&this.screen!=='home'&&!this.leavingSaved){
   this.songWorkflow.depart(()=>{this.leavingSaved=true;try{this.go('home',{history:push,stop,focus});}finally{this.leavingSaved=false;}},true);return;
  }
  if(this.placementWorkflow?.active)screen='create';
  if(screen==='create'&&!this.editor.isOpen&&this.phase==='idle'){this.chooseReturn=this.screen==='connect'?'connect':'home';screen='choose';}
  if(['create','connect'].includes(screen))this.lastWorkScreen=screen;
  if(stop)this.onStop();
  for(const open of document.querySelectorAll('dialog[open]'))open.close();
  this.discardAction=null;this.discardDialog?.close();this.dialog.close();this.screen=screen;document.body.dataset.melodyScreen=screen;
  for(const [name,node] of Object.entries(this.screens))node.hidden=name!==screen;
  for(const b of document.querySelectorAll('[data-work-screen]'))b.setAttribute('aria-pressed',String(b.dataset.workScreen===screen));
  $('choose-song-name').textContent=this.chooseReturn!=='home'?`いまの曲：${$('song-title')?.value||this.songWorkflow?.title||'新しい曲'}`:'';
  if(screen==='choose')$('editor-source').open=true;
  document.querySelector('body > footer').hidden=!['create','connect','samples'].includes(screen);
  if(push)history.pushState({...history.state,melodyScreen:screen},'');
  this.projectWorkflow?.gestures.cancel();
  this.onNavigate();this.sync(this.phase??'idle');
  if(screen!==this.previousScreen)window.scrollTo(0,0);this.previousScreen=screen;
  this.navigationHistory??=[];this.navigationHistory.push({screen,phrases:this.sequence.patterns.length,placements:this.sequence.placements.length,at:new Date().toISOString()});this.navigationHistory=this.navigationHistory.slice(-10);
  if(focus)(this.screens[screen].querySelector('h2,h1')??this.screens[screen].querySelector('button'))?.focus({preventScroll:true});
 }
 setMode(mode){
  this.mode=mode;
  if(mode==='backing'){$('image-settings').open=true;$('capture-note-panel').append($('image-settings'));}
  const destination=document.querySelector(mode==='backing'?'#image-settings .image-more':'.keyboard-settings');
  if(destination&&$('image-settings-open'))destination.prepend($('image-settings-open'),$('image-suggest'));
  const genres=$('image-genre')?.closest('.composer-values');
  if(genres&&$('backing-settings')){if(mode==='backing')(this.editor.previewPattern?.accompaniment?.imageChoice&&$('image-backing-detail')?$('image-backing-detail'):$('image-settings')).prepend(genres);else $('image-progression').closest('label').before(genres);}
  document.body.dataset.createMode=mode;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
  this.onModeChange?.();
 }
 sync(phase) {
  this.phase=phase;this.busy=phase!=='idle';
  const pattern=this.editor.previewPattern;
  $('phrase-bars').value=String(pattern?.bars??4);$('phrase-bars').disabled=this.busy||!this.editor.isOpen||!!this.editor.entry;
  $('composer-key').value=pattern?.key?.mode==='minor'?'Am':'C';$('composer-key').disabled=this.busy||!this.editor.isOpen||!!this.editor.entry;
  $('phrase-shape-hint').textContent=this.editor.pending&&this.editor.pattern?.bars===8&&pattern?.bars===4?'後半4小節を外す候補です。聴いて「オッケー」で決めよう。':'';
  const manual=this.editor.previewPattern?.source==='manual';
  if(!manual&&this.mode==='input')this.setMode('edit');
  $('choose-mic').textContent=$('mic').textContent;
  for(const id of ['choose-example','new-manual','new-image','capture-import-button','capture-import-text'])$(id).disabled=this.busy;
  $('capture').disabled=this.busy||$('mic').getAttribute('aria-pressed')!=='true';
  $('discard').disabled=!this.editor.isOpen&&!this.busy;
  $('choose-resume').hidden=!this.editor.isOpen;
  $('choose-notice').textContent=this.editor.isOpen?'作業を残しています。別の作り方を選ぶと、今の作業をほぞんします。':'';
  $('capture-position').hidden=!['preparing','count-in','recording','analyzing'].includes(phase);
  $('keep-phrase').disabled=this.busy||!!this.placementWorkflow?.active||!this.editor.isOpen||this.editor.pending||!!this.proposal||!canKeepPhrase(this.editor.pattern);
  if(this.proposal)$('phrase-feedback').textContent='つなげる画面の候補を確定か取消してから登録できます。';
  $('phrase-name').disabled=this.busy;
  for(const id of ['after-keep-connect','after-keep-more'])$(id).disabled=this.busy;
  for(const b of document.querySelectorAll('[data-work-screen]'))b.disabled=this.busy||!!this.placementWorkflow?.active;
  for(const b of document.querySelectorAll('[data-mode]'))b.disabled=this.busy||(b.dataset.mode==='input'&&!manual);
  document.body.dataset.createMode=this.mode;
  $('composer-candidate').hidden=!manual||this.mode!=='input';
  this.renderSequence();this.learning?.sync(phase);
 }
  async keep() {
  if(this.busy||this.placementWorkflow?.active||!this.editor.isOpen||this.editor.pending||this.proposal||!canKeepPhrase(this.editor.pattern))return;
    if(this.songWorkflow?.practice){
     const pattern=JSON.stringify(this.editor.pattern);
     if(!await this.songWorkflow.allowNew())return;
     if(this.busy||this.editor.pending||this.proposal||pattern!==JSON.stringify(this.editor.pattern))return;
     this.songWorkflow.practice=false;
    }
  if(!this.editor.accepted)this.editor.command('confirm');
  if(!this.addPhrase(this.editor.pattern,$('phrase-name').value))return;
  $('phrase-feedback').textContent=`「${this.keptPhrase.name}」をつなげる画面に追加しました。`;
  $('after-keep').hidden=false;
  $('phrase-name').value='';$('phrase-name').placeholder=`フレーズ${this.sequence.patterns.length+1}`;
  this.renderSequence();
 }
 createAnotherPhrase(){
  if(this.projectWorkflow)return this.projectWorkflow.create();
  if(this.busy||this.proposal||this.placementWorkflow?.active)return;
  const checkpoint=this.editor.checkpoint(!!this.songWorkflow?.id);
  const unregistered=checkpoint&&extractSongPhrases({schemaVersion:1,data:{sequence:this.sequence,checkpoint}}).some(p=>p.id==='current');
  if(checkpoint&&(this.editor.pending||unregistered||!canKeepPhrase(this.editor.pattern))){
   this.go('create');if($('phrase-tools'))$('phrase-tools').open=true;
   const message=this.editor.pending?'今の変更をオッケーか取消で決めてから、フレーズを登録してください。元の作業は残しています。':canKeepPhrase(this.editor.pattern)?'今のフレーズを登録してから、もうひとつつくれます。元の作業は残しています。':'今の作業を残しています。音や伴奏を入れ、フレーズを登録してから追加できます。';
   $('phrase-feedback').textContent=message;$('capture-edit-status').textContent=message;return;
  }
  this.chooseReturn=this.screen==='connect'?'connect':'create';
  this.go('choose');
 }
 addPhrase(pattern,name){
  if(this.busy||this.proposal||this.placementWorkflow?.active)return false;
  const next=keepPhrase(this.sequence,pattern,name);if(next.code)return false;
  this.sequence=next;this.keptPhrase=next.patterns.at(-1);this.renderSequence();return true;
 }
 diagnostics(){
  return {build:trialBuild,screen:this.screen,phrases:this.sequence.patterns.length,placements:this.sequence.placements.length,pending:!!this.proposal,shelfButtons:$('phrase-shelf').querySelectorAll('[data-phrase]').length,songId:this.songWorkflow?.id??null,saveStatus:$('song-status')?.textContent??'',saveError:this.songWorkflow?.error?.code??null,libraryError:this.songWorkflow?.libraryPlayer.lastError??null,navigation:this.navigationHistory??[]};
 }
 connectKeptPhrase(){
  this.go('connect');
  if(this.screen!=='connect'||!this.sequence.patterns.includes(this.keptPhrase))return;
  const shelf=$('phrase-shelf'),target=[...shelf.querySelectorAll('[data-phrase]')].find(b=>b.dataset.phrase===this.keptPhrase.id);
  if(!target)return;
  const row=target.closest('.phrase-shelf-row')??target,bounds=shelf.getBoundingClientRect(),rect=row.getBoundingClientRect();
  // Reveal within the bounded shelf without scrolling the whole page away from its heading.
  if(rect.top<bounds.top)shelf.scrollTop-=Math.ceil(bounds.top-rect.top);
  else if(rect.bottom>bounds.bottom)shelf.scrollTop+=Math.ceil(rect.bottom-bounds.bottom);
  target.focus({preventScroll:true});
 }
 stage(command) {
  if(this.projectWorkflow?.parkedPlacement){$('sequence-message').textContent='修正中の場所を先にオッケーか取消で決めてね。';return;}
  if(this.busy||this.proposal||this.placementWorkflow?.active)return;
  const next=proposeSequence(this.sequence,command);
  if(next.code){$('sequence-message').textContent=next.code==='PLACEMENT_LIMIT'?'16個まで並べられます。':'その並べ方にはできません。';return;}
  this.proposal=next;if(command.type==='append')this.selected=command.placement.id;this.renderSequence();
 }
 confirmSequence(){
  if(this.busy||!this.proposal)return false;
  const next=commitSequence(this.sequence,this.proposal);if(next.code)return false;
  this.sequence=next;this.proposal=null;this.renderSequence();return true;
 }
 renderSequence() {
  this.projectWorkflow?.capture();
  const draft=this.proposal?.next??this.sequence,locked=this.busy||!!this.proposal||!!this.placementWorkflow?.active;
  $('sequence-empty').hidden=!!this.sequence.patterns.length;
  $('sequence-create').textContent=this.sequence.patterns.length?'もうひとつ つくる':'フレーズを つくる';
  $('sequence-create').disabled=locked;$('sequence-import').disabled=locked;
  $('sequence-song').disabled=this.busy;for(const id of ['sequence-song-name','create-song-name']){const name=$(id);if(name){name.textContent=this.songWorkflow?.id?`いまの曲：${$('song-title')?.value||this.songWorkflow.title||'わたしのきょく'}`:'新しい曲';name.title=name.textContent;}}
  const shelf=$('phrase-shelf');shelf.replaceChildren();
  for(const p of this.sequence.patterns){const b=button(`${p.name} ・ ${p.bars}小節`,()=>this.stage({type:'append',placement:{id:`place-${this.sequence.revision}`,patternId:p.id}}));b.dataset.phrase=p.id;b.toggleAttribute('data-kept-phrase',p===this.keptPhrase);b.disabled=locked||draft.placements.length>=16;shelf.append(b);}
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
  const playback=sequencePlayback(draft);this.ranges=playback.ranges??[];
  $('sequence-count').textContent=`${draft.placements.length} / 16 ・ ${(this.ranges.at(-1)?.end??0)/16}小節`;
  $('sequence-message').textContent=this.proposal?'仮の順番です。聴いてからオッケーで決めます。':'フレーズを選ぶと、最後に追加する候補になります。';
  this.placementWorkflow?.render(locked);
  if(!this.projectWorkflow)this.endingWorkflow?.render(draft,playback);
  this.projectWorkflow?.render();
  if(this.projectWorkflow)this.endingWorkflow?.render(draft,playback);
  this.songWorkflow?.schedule();
  this.songWorkflow?.phraseTransfer?.render();
 }
 follow(tick){if(this.screen!=='connect')return;const active=tick==null?null:this.ranges?.find(p=>p.start<=tick&&tick<p.end);
  if(this.playingId===active?.id)return;this.playingId=active?.id;
  const line=$('sequence-line');for(const b of line.children){const playing=(b.dataset.placement??b.dataset.ending)===active?.id;b.toggleAttribute('data-playing',playing);if(playing)line.scrollTop+=b.getBoundingClientRect().top-line.getBoundingClientRect().top-(line.clientHeight-b.offsetHeight)/2;}
 }
}
