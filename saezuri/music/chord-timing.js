// Quarter-note editing over the existing timed-chord representation.
import {harmonicSegments} from './accompaniment.js';
import {chordTones} from './catalog.js';
const same=(a,b)=>['root','quality','bass'].every(k=>a?.[k]===b?.[k]);
export function chordAtTick(pattern,tick){return harmonicSegments(pattern).find(c=>c.startTick<=tick&&tick<c.startTick+c.durationTick);}
export function chordChangesInBar(pattern,bar){
 const changes=[];for(const c of harmonicSegments(pattern).filter(c=>c.startTick>=bar*16&&c.startTick<(bar+1)*16))if(!same(c,changes.at(-1)))changes.push(c);
 return changes;
}
function beatTick(pattern,bar,beat){
 if(!Number.isInteger(bar)||bar<0||bar>=pattern.bars||!Number.isInteger(beat)||beat<0||beat>3)throw new Error('CHORD_TIME');
 return bar*16+beat*4;
}
export function setChordAtBeat(pattern,bar,beat,chord){
 const startTick=beatTick(pattern,bar,beat);if(chordTones(chord).code)throw new Error('CHORD_INVALID');
 const current=chordAtTick(pattern,startTick),end=current.startTick+current.durationTick;
 return replaceChordRange(pattern,startTick,end,chord);
}
function replaceChordRange(pattern,startTick,end,chord){
 const value=structuredClone(pattern.accompaniment),chords=[];
 for(const c of value.chords??[]){
  const last=c.startTick+c.durationTick;
  if(last<=startTick||c.startTick>=end){chords.push(c);continue;}
  if(c.startTick<startTick)chords.push({...c,durationTick:startTick-c.startTick});
  if(last>end)chords.push({...c,startTick:end,durationTick:last-end});
 }
 chords.push({root:chord.root,quality:chord.quality,bass:chord.bass,startTick,durationTick:end-startTick,manual:true});
 value.enabled=true;value.chords=chords.sort((a,b)=>a.startTick-b.startTick);
 // Equal adjacent manual chords are a single change, so held notes do not
 // retrigger after removing a change. Keep bar boundaries independently editable.
 value.chords=value.chords.reduce((result,c)=>{const previous=result.at(-1);if(previous&&same(previous,c)&&previous.startTick+previous.durationTick===c.startTick&&Math.floor(previous.startTick/16)===Math.floor(c.startTick/16))previous.durationTick+=c.durationTick;else result.push(c);return result;},[]);
 return value;
}
export function removeChordAtBeat(pattern,bar,beat){
 const tick=beatTick(pattern,bar,beat);if(beat===0)throw new Error('CHORD_TIME');
 const previous=chordAtTick(pattern,tick-1),current=chordAtTick(pattern,tick);
 return replaceChordRange(pattern,previous.startTick,current.startTick+current.durationTick,previous);
}
