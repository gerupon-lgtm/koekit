import {renderTutorialView,highlightTutorialView} from './tutorial-view.js?v=v0.1.0-20261027203252-3fea222';
import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261027203252-3fea222';

export class TutorialPreview{
 constructor({onPlay,onStop,onNavigate=()=>{},onDisplay=()=>{}}){
  Object.assign(this,{onPlay,onStop,onNavigate,onDisplay});this.display='cards';this.playing=false;this.epoch=0;
  const dialog=document.createElement('dialog');dialog.id='learning-preview';dialog.className='tutorial-preview';dialog.setAttribute('aria-labelledby','learning-preview-title');
  dialog.innerHTML='<div class="screen-heading"><h2 id="learning-preview-title">おてほんを 聴く</h2><button data-close>とじる</button></div><div class="tutorial-preview-options"><div class="tutorial-display-switch" role="group" aria-label="メロディーの表示"><button data-tutorial-view="cards">カード</button><button data-tutorial-view="score">五線譜</button></div><label class="tutorial-sound-choice">音<select id="learning-preview-sound"><option value="backing">伴奏つき</option><option value="melody">メロディーだけ</option></select></label></div><p id="learning-preview-status" role="status" aria-live="polite"></p><div id="learning-preview-view"></div><div class="tutorial-play-actions"><button id="learning-preview-play">もういちど 聴く</button><button id="learning-preview-return">つくる画面へ →</button></div>';
  document.querySelector('main').append(dialog);this.dialog=dialog;this.view=dialog.querySelector('#learning-preview-view');this.status=dialog.querySelector('#learning-preview-status');
  const info=document.createElement('div');info.className='tutorial-preview-info';
  const voiceButton=document.createElement('button');voiceButton.id='learning-preview-voice-toggle';voiceButton.type='button';voiceButton.onclick=()=>document.getElementById('learning-voice')?.click();
  const text=document.createElement('div'),hint=document.createElement('p');hint.id='learning-preview-voice-hint';this.status.before(info);info.append(voiceButton,text);text.append(this.status,hint);
  setupPlaybackSheet(dialog,{closeId:'learning-preview-close',stopId:'learning-preview-stop',onStop:()=>this.stop(),stopOnClose:false});
  dialog.querySelector('.sheet-stop').append(dialog.querySelector('.tutorial-play-actions'));
  dialog.querySelector('#learning-preview-close').onclick=()=>this.close();
  dialog.querySelector('#learning-preview-play').onclick=()=>this.play(dialog.querySelector('#learning-preview-sound').value);dialog.querySelector('#learning-preview-return').onclick=()=>this.close();
  for(const button of dialog.querySelectorAll('[data-tutorial-view]'))button.onclick=()=>{this.setDisplay(button.dataset.tutorialView);this.onDisplay(this.display);};
  dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
  dialog.addEventListener('close',()=>{if(!dialog.open)this.finishClose();});
  let width=0;this.resize=new ResizeObserver(()=>{if(dialog.open&&this.view.clientWidth&&width!==this.view.clientWidth){width=this.view.clientWidth;this.render();}});this.resize.observe(this.view);
  this.sync();
 }
 get openNow(){return this.dialog.open;}
 open(data,{onHeard=()=>{},onClose=()=>{},title='おてほんを 聴く'}={}){
  this.stop();this.data=structuredClone(data);this.onHeard=onHeard;this.onClosed=onClose;this.heard=false;this.opened=true;this.playMode='backing';this.dialog.querySelector('#learning-preview-sound').value='backing';
  this.dialog.querySelector('h2').textContent=title;if(!this.dialog.open)this.dialog.showModal();this.render();this.sync();this.onNavigate();
 }
 setDisplay(display){this.display=display==='score'?'score':'cards';this.view.dataset.display=this.display;for(const b of this.dialog.querySelectorAll('[data-tutorial-view]'))b.setAttribute('aria-pressed',String(b.dataset.tutorialView===this.display));}
 render(){if(!this.data)return;renderTutorialView(this.view,this.data.pattern,{display:this.display,barCount:Math.ceil(this.data.totalTicks/16),endTick:this.data.totalTicks});highlightTutorialView(this.view,this.lastTick??null);this.setDisplay(this.display);}
 sync(){
  this.dialog.dataset.phase=this.playing?'preparing':'idle';this.dialog.classList.toggle('tutorial-playing',this.playing);
  this.dialog.querySelector('#learning-preview-stop').disabled=!this.playing;
  const backing=!!this.data?.accompaniment.length;
  this.dialog.querySelector('.tutorial-sound-choice').hidden=!backing;this.dialog.querySelector('#learning-preview-sound').disabled=this.playing;
  for(const b of this.dialog.querySelectorAll('.tutorial-play-actions button'))b.disabled=this.playing;
  if(!this.playing)this.status.textContent=`${this.data?.tempo??112} BPM・1小節カウント`;
  this.syncVoice();
 }
 syncVoice(){
  const toggle=this.dialog.querySelector('#learning-preview-voice-toggle'),hint=this.dialog.querySelector('#learning-preview-voice-hint');
  const enabled=!!document.getElementById('edit-voice')?.checked&&document.getElementById('mic')?.getAttribute('aria-pressed')==='true';
  toggle.textContent=enabled?'声 ON':'声 OFF';toggle.setAttribute('aria-pressed',String(enabled));
  const status=document.getElementById('edit-voice-status')?.textContent;
  hint.textContent=!enabled?'声の操作は「声 OFF」を押してね。':status==='声を受け付けています'?'声：「きく」「もういちど」「とめる」「とじる」':status==='音声認識の準備中…'?'声のじゅんび中…':'声の受付はおやすみ中。ボタンで操作できます。';
 }
 replay(){const mode=this.dialog.querySelector('#learning-preview-sound').value;this.stop();return this.play(mode);}
 async play(mode='backing'){
  if(!this.openNow||!this.data||this.playing)return;
  this.playMode=mode;this.dialog.querySelector('#learning-preview-sound').value=mode;
  const epoch=++this.epoch;this.playing=true;this.lastTick=null;this.sync();this.status.textContent='音をじゅんび中…';
  try{const data=structuredClone(this.data);if(mode==='melody')data.accompaniment=[];const result=await this.onPlay(data);if(epoch===this.epoch&&result===false)this.stop({notify:false,reason:'ERROR'});}
  catch{if(epoch===this.epoch)this.stop({reason:'ERROR'});}
 }
 follow(tick,{countBeat=null}={}){
  if(!this.playing||!this.openNow)return;
  if(countBeat!==null){this.lastTick=null;this.dialog.dataset.phase='count-in';this.status.textContent=`カウント ${Math.min(4,countBeat+1)} / 4拍`;highlightTutorialView(this.view,null);return;}
  this.lastTick=tick;this.dialog.dataset.phase='music';this.status.textContent=`${Math.min(Math.ceil(this.data.totalTicks/16),Math.floor(tick/16)+1)} / ${Math.ceil(this.data.totalTicks/16)}小節`;
  highlightTutorialView(this.view,tick);if(!this.heard){this.heard=true;this.onHeard();}
 }
 stop({notify=true,reason='STOPPED'}={}){
  const wasPlaying=this.playing;this.playing=false;this.lastTick=null;this.epoch++;highlightTutorialView(this.view,null);this.sync();
  if(notify&&wasPlaying)this.onStop();if(reason==='ENDED')this.status.textContent='聴き終わったよ。';else if(reason==='ERROR')this.status.textContent='音を出せませんでした。もう一度押してね。';
  else if(reason==='SCHEDULER_LATE')this.status.textContent='画面の処理が間に合わず止まりました。「きく」でやり直せます。';
  else if(reason==='AUDIO_INTERRUPTED')this.status.textContent='音が中断しました。「きく」でやり直せます。';
  if(reason==='ENDED'&&wasPlaying&&this.openNow)this.dialog.querySelector('#learning-preview-return').focus({preventScroll:true});
 }
 finishClose(){if(!this.opened)return;this.opened=false;this.stop();this.onClosed?.();this.onNavigate();}
 close(){this.finishClose();if(this.dialog.open)this.dialog.close();}
}
