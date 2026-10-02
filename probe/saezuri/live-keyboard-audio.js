// A held voice owns its nodes. Releasing it never stops the accompaniment.
import { createLightVoice, LIGHT_ENGINES } from './light-voice.js?v=v0.1.0-20261002214255-70753ad';
export function heldVoice(ctx,output,midi,instrument='piano',{engine='classic'}={}){
 if(LIGHT_ENGINES.includes(engine))return createLightVoice(ctx,output,{midi,instrument,engine});
 const partials={piano:[1,.35,.16,.08],wood:[1,0,.12],soft:[1,.12,.04],sine:[1],lead:[1,.5,.33,.25,.2,.16]};
 const harmonics=partials[instrument]??partials.piano,level=ctx.createGain(),oscillators=[];
 const now=ctx.currentTime;level.gain.setValueAtTime(0,now);level.gain.linearRampToValueAtTime(.16,now+.008);level.connect(output);
 harmonics.forEach((amplitude,i)=>{
  if(!amplitude)return;const osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.frequency.value=440*2**((midi-69)/12)*(i+1);gain.gain.value=amplitude/harmonics.reduce((a,b)=>a+b,0);
  osc.connect(gain);gain.connect(level);
  const owned={osc,ended:false};osc.onended=()=>{owned.ended=true;osc.disconnect();gain.disconnect();if(oscillators.every(o=>o.ended))level.disconnect();};
  oscillators.push(owned);osc.start(now);
 });
 let released=false;
 return {release(){if(released)return;released=true;const time=ctx.currentTime;level.gain.cancelScheduledValues(time);level.gain.setValueAtTime(.16*Math.min(1,Math.max(0,(time-now)/.008)),time);level.gain.linearRampToValueAtTime(0,time+.035);for(const {osc} of oscillators)osc.stop(time+.04);}};
}
