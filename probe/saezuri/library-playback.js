import {songPlaybackChoices} from './workflow-state.js?v=v0.1.0-20261031005919-fd25477';

const TICKS_PER_BAR=16;

// Playback feedback follows the transport's audio clock; song records stay untouched.
export class LibraryPlayback {
 constructor({onPlay,onStop,onChoose,onCancelChoice}){
  Object.assign(this,{onPlay,onStop,onChoose,onCancelChoice});this.bindings=new Set();this.serial=0;this.active=null;this.pending=null;
 }
 bind(record,row,button){
  const view=document.createElement('div');view.className='song-playback';view.hidden=true;
  const status=document.createElement('span');status.className='song-playback-status';status.setAttribute('role','status');status.setAttribute('aria-atomic','true');
  const progress=document.createElement('progress');progress.value=0;progress.max=1;progress.setAttribute('aria-label',`${record.title}の再生位置`);
  view.append(status,progress);row.append(view);
  const binding={record,row,button,view,status,progress};this.bindings.add(binding);
  button.dataset.songPlay=record.id;this.idle(binding);
  button.onclick=()=>this.play(binding);
 }
 idle(binding){
  const {record,row,button,view,status,progress}=binding;
  delete row.dataset.songPlaying;delete row.dataset.songPreparing;
  button.textContent='▶ 聴く';button.setAttribute('aria-label',`${record.title}を聴く`);button.setAttribute('aria-pressed','false');button.removeAttribute('aria-busy');
  view.hidden=true;status.textContent='';progress.hidden=false;progress.value=0;
 }
 async play(binding){
  if(this.active?.binding===binding||this.pending?.binding===binding){this.stop();return;}
  this.stop();
  const pending={binding,serial:++this.serial,tick:null};this.pending=pending;
  const {record,row,button,view,status,progress}=binding;
  row.dataset.songPreparing='true';button.textContent='じゅんび中…';button.setAttribute('aria-label',`${record.title}の再生準備をとめる`);button.setAttribute('aria-pressed','true');button.setAttribute('aria-busy','true');
  view.hidden=false;status.textContent='音をじゅんび中…';
  try{
   const choices=songPlaybackChoices(record);
   if(!choices.length)throw new Error('NO_PLAYBACK_SOURCE');
   const choice=choices.length===1?choices[0]:await this.onChoose?.(record,choices);
   if(this.pending!==pending||pending.serial!==this.serial)return;
   if(!choice){this.pending=null;this.idle(binding);return;}
   const data={...choice.data,previewName:`${record.title}・${choice.label}（${choice.state}）`};
   const totalTicks=data.pattern.bars*TICKS_PER_BAR;
   if(!Number.isFinite(totalTicks)||totalTicks<=0)throw new Error('INVALID_PLAYBACK_LENGTH');
   progress.max=totalTicks;
   const started=await this.onPlay(data,record.data.settings.tempo);
   if(this.pending!==pending||pending.serial!==this.serial)return;
   this.pending=null;
   if(started!==true){this.lastError={songId:record.id,code:'START_FAILED',detail:document.getElementById('status')?.textContent??'',source:structuredClone(record),at:new Date().toISOString()};this.failed(binding);return;}
   this.lastError=null;
   this.active={binding,totalTicks,bars:Math.ceil(totalTicks/TICKS_PER_BAR),label:data.previewName??'',lastTick:null,lastBar:null};
   delete row.dataset.songPreparing;row.dataset.songPlaying='true';
   button.textContent='■ とめる';button.setAttribute('aria-label',`${record.title}をとめる`);button.removeAttribute('aria-busy');
   this.follow(pending.tick??-1);
  }catch(error){
   if(this.pending!==pending||pending.serial!==this.serial)return;
   this.lastError={songId:record.id,code:String(error?.code??error?.message??'PLAYBACK_FAILED'),source:structuredClone(record),at:new Date().toISOString()};
   this.pending=null;this.failed(binding);
  }
 }
 failed(binding){
  this.idle(binding);binding.view.hidden=false;binding.progress.hidden=true;binding.status.textContent=`「${binding.record.title}」は聴けませんでした。「ひらく」で曲を確かめられます。`;
 }
 follow(tick){
  // app.play() stops the previous transport before preparing this request.
  // That notification must not cancel this module's own pending start.
  if(tick===null){if(this.active){this.idle(this.active.binding);this.active=null;}return;}
  if(!Number.isFinite(tick))return;
  if(this.pending)this.pending.tick=tick;
  const active=this.active;if(!active)return;
  const position=Math.min(active.totalTicks,Math.max(0,Math.floor(tick)));
  const step=tick<0?-1:position;
  if(step===active.lastTick)return;
  active.lastTick=step;
  const {status,progress}=active.binding;
  if(progress.value!==position)progress.value=position;
  const bar=tick<0?0:Math.min(active.bars,Math.floor(position/TICKS_PER_BAR)+1);
  if(bar!==active.lastBar){active.lastBar=bar;status.textContent=(active.label?`${active.label}・`:'')+(bar?`再生中 ${bar} / ${active.bars}小節`:'カウント中');}
 }
 stop(){
  this.onCancelChoice?.();
  this.serial++;this.pending=null;this.active=null;
  for(const binding of this.bindings)this.idle(binding);
  this.onStop();
 }
 reset(){this.stop();this.bindings.clear();}
}
