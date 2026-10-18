// Comparison only: keep the usual low-latency keyboard path unless requested.
export const playbackLatencyHint=value=>value==='playback'?'playback':'interactive';
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
