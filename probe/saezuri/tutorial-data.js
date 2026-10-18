import {blankPattern} from './entry-session.js?v=v0.1.0-20261018060645-b9da761';
import {accompanimentEvents,harmonicSegments} from '../../saezuri/music/accompaniment.js?v=v0.1.0-20261018060645-b9da761';
import {POP_EIGHT_BEAT} from '../../saezuri/music/backing-patterns.js?v=v0.1.0-20261018060645-b9da761';

export const TUTORIAL_TEMPO=112;
const melody=[
 [0,4,62],[4,4,64],[8,2,67],[10,6,64],
 [16,4,65],[20,4,64],[24,8,62],
 [32,4,67],[38,2,67],[40,2,69],[42,4,67],[46,4,64],
 [50,4,62],[54,2,60],[56,8,60],
];
export function tutorialPattern({backing=false}={}){
 return {...blankPattern(),notes:melody.map(([startTick,durationTick,midi],i)=>({id:`tutorial-${i}`,startTick,durationTick,midi,origin:'manual',completedRanges:[],velocity:70})),
  accompaniment:{enabled:backing,genre:POP_EIGHT_BEAT.genre,rhythm:POP_EIGHT_BEAT.rhythm,progression:'home',sounds:{...POP_EIGHT_BEAT.sounds}}};
}

// The source is never resized or shifted. Audition a copy of exactly the chosen
// interval. The returned pattern may have 1/2 display bars and is never an editor document.
// This includes any note already sounding at its beginning.
export function tutorialExcerpt(pattern,startTick,endTick){
 if(!Number.isInteger(startTick)||!Number.isInteger(endTick)||startTick%2||endTick%2||startTick<0||endTick<=startTick||endTick>pattern.bars*16)throw new RangeError('TUTORIAL_RANGE');
 const clip=events=>events.filter(n=>n.startTick<endTick&&n.startTick+n.durationTick>startTick).map(n=>{
  const start=Math.max(startTick,n.startTick),end=Math.min(endTick,n.startTick+n.durationTick);
  return {...structuredClone(n),startTick:start-startTick,durationTick:end-start};
 });
 const result=structuredClone(pattern),notes=clip(pattern.notes).map(n=>({...n,velocity:70})),accompaniment=clip(accompanimentEvents(pattern));
 result.bars=Math.ceil((endTick-startTick)/16);result.notes=notes;
 if(result.accompaniment){result.accompaniment.chords=clip(harmonicSegments(pattern)).map(n=>({...n,manual:true}));}
 return {pattern:result,notes,accompaniment,totalTicks:endTick-startTick,offsetTick:startTick,tempo:TUTORIAL_TEMPO};
}
