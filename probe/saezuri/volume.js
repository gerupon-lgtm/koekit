const storageKey='saezuri.mix.v1';
export const volumeLevel=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(2,Number(value))):1;
export class VolumeControls {
 constructor({onChange}={}){
  this.onChange=onChange;const count=document.getElementById('count-volume'),parent=count.closest('label').parentElement;
  const group=document.createElement('div');group.className='volume-settings';group.setAttribute('aria-label','音量');
  this.controls={count};
  for(const [part,label] of [['count','カウント'],['backing','伴奏'],['master','全体']]){
   const field=part==='count'?count.closest('label'):document.createElement('label');
   const select=part==='count'?count:document.createElement('select');select.id=`${part}-volume`;
   field.replaceChildren(document.createTextNode(label),select);select.replaceChildren(...[0,.5,1,1.5,2].map(value=>{const option=document.createElement('option');option.value=value;option.textContent=`${value*100}%`;return option;}));
   this.controls[part]=select;group.append(field);select.onchange=()=>{const levels=this.value();try{localStorage.setItem(storageKey,JSON.stringify(levels));}catch{}this.onChange?.(levels);};
  }
  parent.append(group);let saved;try{saved=JSON.parse(localStorage.getItem(storageKey));}catch{}
  for(const [part,select] of Object.entries(this.controls)){const value=saved?.[part];select.value=[0,.5,1,1.5,2].includes(value)?value:1;}
 }
 value(){return Object.fromEntries(Object.entries(this.controls).map(([part,select])=>[part,volumeLevel(select.value)]));}
 setBusy(busy){for(const select of Object.values(this.controls))select.disabled=busy;}
}
export class AudioMixer {
 constructor(ctx,levels={}){
  this.ctx=ctx;this.master=ctx.createGain();this.count=ctx.createGain();this.backing=ctx.createGain();this.melody=this.master;
  // A memoryless peak limit preserves the existing audio clock and normal levels.
  this.limit=ctx.createWaveShaper();this.limit.curve=Float32Array.from({length:4097},(_,i)=>Math.max(-.95,Math.min(.95,i/2048-1)));
  this.master.connect(this.limit).connect(ctx.destination);this.count.connect(this.master);this.backing.connect(this.master);
  this.setLevels(levels,true);
 }
 setLevels(levels,initial=false){
  this.levels=Object.fromEntries(['count','backing','master'].map(part=>[part,volumeLevel(levels[part]??1)]));
  for(const part of ['count','backing','master']){const gain=this[part].gain,value=this.levels[part];if(initial)gain.value=value;else{const now=this.ctx.currentTime,current=gain.value;gain.cancelScheduledValues(now);gain.setValueAtTime(current,now);gain.linearRampToValueAtTime(value,now+.015);}}
 }
}
