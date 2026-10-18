// Only finite auditions may trade response for playback stability. Live input
// and recording keep one interactive clock, even on a comparison URL.
export function playbackLatencyHint(value,purpose='playback'){
 if(purpose!=='playback')return 'interactive';
 if(value==='10ms')return .01;
 if(value==='20ms')return .02;
 return value==='interactive'?'interactive':'playback';
}
const counters=['underrunEvents','underrunDuration','totalDuration'];
export function readPlaybackStats(ctx){
 try{
  const native=ctx.playbackStats;if(!native)return null;
  const result=Object.fromEntries(counters.map(key=>[key,native[key]]));
  return counters.every(key=>Number.isFinite(result[key])&&result[key]>=0)?result:null;
 }catch{return null;}
}
export function playbackStatsDelta(before,after){
 if(!before||!after)return {status:'unavailable'};
 if(counters.some(key=>after[key]<before[key]))return {status:'counter-reset'};
 return {status:'measured',...Object.fromEntries(counters.map(key=>[key,after[key]-before[key]]))};
}
