import {captureTiming} from './capture-support.js';
export function nextLoopHead({anchor,now,tempo,bars}){
 if(!Number.isFinite(anchor)||!Number.isFinite(now)||!Number.isFinite(tempo)||tempo<=0||![4,8].includes(bars))throw new Error('LOOP_TIME');
 const length=bars*4*60/tempo;
 return now<anchor?anchor:anchor+(Math.floor((now-anchor)/length)+1)*length;
}
export function loopCaptureTiming({musicalStart,bars,...options}){
 const estimated=captureTiming({...options,anchor:musicalStart-8*60/options.tempo,audibleCount:true});
 return {...estimated,musicalStart,endFrame:estimated.startFrame+Math.round(bars*4*60/options.tempo*options.sampleRate),countTimes:[],countBeats:[],bars,mode:'loop-estimated'};
}
