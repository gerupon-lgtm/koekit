import {pianoKeys,TapRecording} from './tap-recording.js?v=v0.1.0-20261002162220-642e03c';
const $=id=>document.getElementById(id);
export class KeyboardControls {
 constructor({editor,prepareVoice,onStart,onActivity,onPreview,clock}){
  Object.assign(this,{editor,prepareVoice,onStart,onActivity,onPreview,clock});this.octave=0;this.take=null;this.held=null;
  const panel=document.createElement('div');panel.id='live-keyboard';
  panel.innerHTML='<div class="keyboard-actions"><button id="tap-record">タップ<br>で録る</button></div><p id="keyboard-status" role="status">れんしゅう中</p><div id="piano-keys" aria-label="練習と録音の鍵盤"></div><div class="keyboard-octaves" aria-label="鍵盤の高さ"><button data-keyboard-octave="-1">↓ 下げ</button><button data-keyboard-octave="0">元</button><button data-keyboard-octave="1">↑ 上げ</button></div><p class="keyboard-help">押しているあいだ音がのびます。録るときは「タップで録る」。</p><details id="keyboard-more"><summary>伴奏の設定・進行のおすすめ</summary><div class="keyboard-settings"></div></details><details id="step-entry"><summary>1音ずつ置く</summary></details>';
  const toolbar=document.querySelector('.edit-toolbar');toolbar.before(panel);this.panel=panel;
  const actions=panel.querySelector('.keyboard-actions');actions.prepend($('backing-loop'));actions.append($('loop-record'));
  $('backing-loop').innerHTML='伴奏<br>ループ';$('loop-record').innerHTML='ハナウタ<br>で録る';
  panel.before($('image-chords'));
  panel.querySelector('.keyboard-settings').append($('image-settings-open'),$('image-suggest'));
  $('step-entry').append($('composer-panel'));$('tap-record').onclick=()=>onStart();
  const options=document.createElement('div');options.id='keyboard-options';options.append($('keyboard-more'),$('step-entry'));toolbar.after(options);
  for(const b of panel.querySelectorAll('[data-keyboard-octave]'))b.onclick=()=>{this.octave=Number(b.dataset.keyboardOctave);this.drawKeys();};
  this.drawKeys();
  this.abort=()=>this.release();window.addEventListener('blur',this.abort);document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release();});
 }
 drawKeys(){
  const row=$('piano-keys');
  // Keep the held pointer's element alive when the octave changes.
  if(!row.children.length)for(const key of pianoKeys()){
   const b=document.createElement('button');b.type='button';b.dataset.base=key.base;b.className=key.black?'piano-black':'piano-white';b.toggleAttribute('data-reference',key.reference);
   b.style.left=`${key.position*10-(key.black?3:0)}%`;b.textContent=key.black?'':key.label;
   b.oncontextmenu=e=>e.preventDefault();b.onpointerdown=e=>{if(e.button!==0||b.disabled)return;e.preventDefault();b.setPointerCapture(e.pointerId);this.press(b,e.pointerId);};
   b.onpointerup=b.onpointercancel=b.onlostpointercapture=e=>{if(this.held?.pointer===e.pointerId)this.release();};
   b.onkeydown=e=>{if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();this.press(b,'key');}};
   b.onkeyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(this.held?.pointer==='key')this.release();}};b.onblur=()=>{if(this.held?.pointer==='key')this.release();};row.append(b);
  }
  const keys=pianoKeys(this.octave);
  for(const b of row.children){const key=keys.find(k=>k.base===Number(b.dataset.base));b.dataset.midi=key.midi;b.toggleAttribute('data-reference',key.reference);b.setAttribute('aria-label',`${key.label} MIDI ${key.midi}`);}
  for(const b of this.panel.querySelectorAll('[data-keyboard-octave]'))b.setAttribute('aria-pressed',String(Number(b.dataset.keyboardOctave)===this.octave));
 }
 async press(button,pointer){
  this.release();const held={button,pointer,midi:Number(button.dataset.midi)};this.held=held;button.setAttribute('data-held','');this.onActivity();this.captureHeld();
  try{const startVoice=await this.prepareVoice();if(this.held!==held)return;held.voice=startVoice(held.midi);this.captureHeld();}
  catch(error){if(this.held===held){this.release();$('keyboard-status').textContent=`音を出せません：${error.message}`;}}
 }
 captureHeld(){if(this.take&&this.held&&!this.take.model.held&&this.tick()>=0)this.take.model.press(this.held.midi,this.tick());}
 tick(){return this.take?(this.clock()-this.take.anchor)*this.take.tempo*4/60:0;}
 release(){
  const held=this.held;if(!held)return;this.captureHeld();if(this.take?.model.held)this.take.model.release(Math.max(0,this.tick()));
  held.voice?.release();held.button.removeAttribute('data-held');this.held=null;this.onActivity();
 }
 begin(pattern,anchor,tempo){this.take={model:new TapRecording(pattern),anchor,tempo,previewKey:null};this.captureHeld();this.frame();}
 finish(){this.release();const take=this.take;this.take=null;return take?.model.events?take.model.pattern:null;}
 frame(){
  if(!this.take)return;this.captureHeld();const tick=this.tick(),remaining=Math.ceil(-tick/4);
  $('keyboard-status').textContent=tick<0?`次の先頭から：${remaining} → タップ録音`:`タップ録音中 ${Math.floor((tick%this.take.model.totalTicks)/16)+1}小節・${Math.floor(tick/4)%4+1}拍`;
  if(tick>=0){const key=`${this.take.model.events}:${this.take.model.held?.midi??''}:${this.take.model.held?Math.round(tick):''}`;if(key!==this.take.previewKey){this.take.previewKey=key;this.onPreview(this.take.model.preview(tick));}}
 }
 render({phase,loop=false,screen='create'}){
  const humming=['count-in','recording','analyzing'].includes(phase),playable=phase==='idle'||phase==='playing'&&loop;
  this.panel.hidden=screen!=='create'||!this.editor.isOpen;
  $('piano-keys').hidden=this.panel.querySelector('.keyboard-octaves').hidden=humming;
  $('step-entry').hidden=humming||this.editor.previewPattern?.source!=='manual';
  for(const b of $('piano-keys').children)b.disabled=!playable;
  for(const b of this.panel.querySelectorAll('[data-keyboard-octave]'))b.disabled=!playable;
  $('tap-record').disabled=!playable||!!this.take||this.editor.pending;
  $('loop-record').disabled=!!this.take||!playable||this.editor.pending||!document.querySelector('#mic').getAttribute('aria-pressed').includes('true');
  for(const b of document.querySelectorAll('.keyboard-settings button'))b.disabled=phase!=='idle';
  for(const b of $('image-chords').children)b.disabled=phase!=='idle'||!!this.editor.entry;
  if(!this.take)$('keyboard-status').textContent=humming?'ハナウタを録っています':playable?'れんしゅう中':'再生中';
  document.body.classList.toggle('keyboard-recording',!!this.take);document.body.classList.toggle('keyboard-humming',humming);
 }
}
