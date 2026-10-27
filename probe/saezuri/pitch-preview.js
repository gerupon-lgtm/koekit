// One short, owned note or harmony. Never use the song transport or mutate a candidate.
export class PitchPreview{
 constructor({prepareVoice,onActivity=()=>{},onError=()=>{},isValid=Number.isFinite,timeoutMs=650}){Object.assign(this,{prepareVoice,onActivity,onError,isValid,timeoutMs});this.epoch=0;this.active=false;}
 cancel(){this.epoch++;clearTimeout(this.timer);this.stopVoice?.();this.stopVoice=null;if(this.active){this.active=false;this.onActivity();}}
 async play(value){
  this.cancel();if(!this.isValid(value))return;
  const snapshot=structuredClone(value);
  const epoch=this.epoch;this.active=true;this.onActivity();
  try{
   const start=await this.prepareVoice();if(epoch!==this.epoch)return;
   this.stopVoice=start(snapshot);
   this.timer=setTimeout(()=>{if(epoch===this.epoch)this.cancel();},this.timeoutMs);
  }catch{if(epoch===this.epoch){this.cancel();this.onError();}}
 }
}
