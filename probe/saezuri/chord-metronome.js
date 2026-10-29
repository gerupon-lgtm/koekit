import {ProbeTransport,preparePlaybackOutput} from './audio.js?v=v0.1.0-20261029225948-ef4bb5a';
const validTempo=value=>Number.isFinite(value)&&value>=60&&value<=180;

// Own only a silent, looping count track. Song playback and live recording
// retain their transport; stopping this track never stops another owner's notes.
export class ClickLoop{
 constructor({prepareTrack,onChange=()=>{},onError=()=>{},warm=preparePlaybackOutput,makeTransport=(ctx,mixer,onStop)=>new ProbeTransport(ctx,onStop,mixer)}){
  Object.assign(this,{prepareTrack,onChange,onError,warm,makeTransport});this.epoch=0;this.pending=false;this.track=null;
 }
 get active(){return !!this.track?.active;}
 stop(){const changed=this.active||this.pending;this.epoch++;this.track?.stop(false);this.track=null;this.pending=false;if(changed)this.onChange();}
 async start(tempo){
  if(!validTempo(tempo)){this.onError('テンポは60〜180で指定してください。');return false;}
  this.stop();this.tempo=tempo;const epoch=this.epoch;this.pending=true;this.onChange();
  try{
   const {ctx,mixer,style='rim'}=await this.prepareTrack();if(epoch!==this.epoch)return false;
   if(!await this.warm(ctx,()=>epoch===this.epoch)){if(epoch===this.epoch)this.stop();return false;}
   if(epoch!==this.epoch)return false;
   const track=this.makeTransport(ctx,mixer,()=>{if(this.track===track){this.stop();this.onError('ドンカマが中断しました。もう一度「開始」を押してね。');}});this.track=track;
   track.start([],{tempo,totalTicks:16,loop:true,countSound:true,countStyle:style,lead:.12,ahead:1});
   if(epoch!==this.epoch)return false;this.pending=false;this.onChange();return this.active;
  }catch{if(epoch===this.epoch){this.stop();this.onError('ドンカマを鳴らせませんでした。もう一度「開始」を押してね。');}return false;}
 }
 setTempo(tempo){if(!validTempo(tempo)||tempo===this.tempo)return false;if(this.active||this.pending)return this.start(tempo);this.tempo=tempo;return false;}
}

export class ChordMetronome{
 constructor({parent,tempoInput,prepareTrack,onError}){
  this.source=tempoInput;this.row=document.createElement('div');this.row.id='chord-metronome';this.row.setAttribute('role','group');this.row.setAttribute('aria-label','ドンカマ（拍だけ）');
  this.row.innerHTML='<label><span>テンポ<small>ドンカマ</small></span><input id="chord-tempo" type="number" inputmode="numeric" min="60" max="180" step="1" required aria-label="ドンカマのテンポ（60〜180）"></label><button id="chord-count-start">▶ 開始</button><button id="chord-count-stop">■ 停止</button>';
  parent.append(this.row);this.input=this.row.querySelector('input');this.startButton=this.row.querySelector('#chord-count-start');this.stopButton=this.row.querySelector('#chord-count-stop');
  this.loop=new ClickLoop({prepareTrack,onChange:()=>this.render(),onError});
  this.input.oninput=()=>{if(this.input.validity.valid){this.source.value=this.input.value;this.source.dispatchEvent(new Event('change'));}this.render();};
  this.input.onchange=()=>{if(!this.input.validity.valid)this.input.reportValidity();};
  this.source.addEventListener('change',()=>{this.syncTempo();this.render();});
  this.startButton.onclick=()=>{if(this.input.reportValidity())void this.loop.start(Number(this.input.value));};this.stopButton.onclick=()=>this.stop();
  this.render(false);
 }
 stop(){this.loop.stop();this.render();}
 syncTempo(){if(this.source.value!==this.sourceValue){this.sourceValue=this.source.value;this.input.value=this.source.value;this.loop.setTempo(Number(this.source.value));}}
 render(busy=this.busy??false){
  this.busy=busy;if(busy)this.loop.stop();this.syncTempo();const {active,pending}=this.loop;
  this.row.dataset.state=pending?'preparing':active?'running':'stopped';this.startButton.textContent=pending?'準備中…':active?'鳴動中':'▶ 開始';
  this.input.disabled=busy;this.input.setAttribute('aria-invalid',String(!this.input.validity.valid));
  this.startButton.disabled=busy||active||pending||!this.input.validity.valid;this.stopButton.disabled=!active&&!pending;
 }
}
