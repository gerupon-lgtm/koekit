// One short, owned voice. Never use the song transport or mutate a candidate.
export class PitchPreview{
 constructor({prepareVoice,onActivity=()=>{},onError=()=>{}}){Object.assign(this,{prepareVoice,onActivity,onError});this.epoch=0;this.active=false;}
 cancel(){this.epoch++;clearTimeout(this.timer);this.stopVoice?.();this.stopVoice=null;if(this.active){this.active=false;this.onActivity();}}
 async play(midi){
  this.cancel();if(midi===null||!Number.isFinite(midi))return;
  const epoch=this.epoch;this.active=true;this.onActivity();
  try{
   const start=await this.prepareVoice();if(epoch!==this.epoch)return;
   this.stopVoice=start(midi);
   this.timer=setTimeout(()=>{if(epoch===this.epoch)this.cancel();},650);
  }catch{if(epoch===this.epoch){this.cancel();this.onError();}}
 }
}
