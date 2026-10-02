// Audition proposals, not an approved musical catalog. Store the complete
// arrangement recipe so playback never depends on random numbers or UI state.
import {CHORD_INTERVALS} from './catalog.js?v=v0.1.0-20261002215245-e39d004';
export const IMAGE_TYPES=[['nursery','どうよう'],['pop','ポップ'],['rock','ロック'],['ballad','バラード']];
export const IMAGE_SPEEDS=[['slow','ゆっくり'],['normal','ふつう'],['fast','はやい']];
export const IMAGE_MOODS=[['bright','あかるい'],['gentle','やさしい'],['cool','かっこいい'],['sad','かなしい']];
export const DEFAULT_IMAGE={type:'nursery',speed:'normal',mood:'bright'};
export const IMAGE_TEMPOS={slow:80,normal:120,fast:144};
export const IMAGE_PATTERN_COUNT=8;
const major=[
 [[0,'major'],[5,'major'],[7,'7'],[0,'major']],
 [[0,'major'],[7,'major'],[9,'minor'],[5,'major']],
 [[0,'major'],[9,'minor'],[2,'minor'],[7,'7']],
 [[5,'major'],[7,'major'],[4,'minor'],[9,'minor']],
 [[0,'major'],[4,'minor'],[5,'major'],[7,'major']],
 [[9,'minor'],[5,'major'],[0,'major'],[7,'major']],
 [[2,'minor'],[7,'7'],[0,'major'],[9,'minor']],
 [[9,'minor'],[2,'minor'],[5,'major'],[7,'7']],
];
const minor=[
 [[9,'minor'],[2,'minor'],[4,'7'],[9,'minor']],
 [[9,'minor'],[5,'major'],[0,'major'],[7,'major']],
 [[9,'minor'],[7,'major'],[5,'major'],[4,'7']],
 [[5,'major'],[7,'major'],[0,'major'],[4,'7']],
 [[9,'minor'],[0,'major'],[2,'minor'],[4,'7']],
 [[9,'minor'],[2,'minor'],[7,'major'],[0,'major']],
 [[2,'minor'],[7,'major'],[0,'major'],[4,'7']],
 [[9,'minor'],[5,'major'],[2,'minor'],[4,'7']],
];
const profiles={
 nursery:{sounds:{chord:'wood',bass:'soft',drums:'acoustic'},rhythm:'quarters',bass:[0,8]},
 pop:{sounds:{chord:'piano',bass:'sine',drums:'electronic'},rhythm:'offbeat',bass:[0,6,8,14]},
 rock:{sounds:{chord:'lead',bass:'soft',drums:'acoustic'},rhythm:'quarters',bass:[0,4,8,12]},
 ballad:{sounds:{chord:'piano',bass:'sine',drums:'acoustic'},rhythm:'arpeggio',bass:[0,8]},
};
export function validImageChoice(choice){return !!choice&&[[IMAGE_TYPES,'type'],[IMAGE_SPEEDS,'speed'],[IMAGE_MOODS,'mood']].every(([list,key])=>list.some(([id])=>id===choice[key]));}
const hitsValid=hits=>Array.isArray(hits)&&hits.length<=16&&hits.every((n,i)=>Number.isInteger(n)&&n>=0&&n<16&&(i===0||n>hits[i-1]));
export function validateImageArrangement(value){
 if(!value)return null;
 if(!validImageChoice(value.choice)||value.version!==1||!Number.isInteger(value.index)||value.index<0||value.index>=IMAGE_PATTERN_COUNT)return {code:'IMAGE_INVALID'};
 if(!['major','minor'].every(mode=>Array.isArray(value.progressions?.[mode])&&value.progressions[mode].length===4&&value.progressions[mode].every(c=>Array.isArray(c)&&c.length===2&&Number.isInteger(c[0])&&c[0]>=0&&c[0]<12&&typeof c[1]==='string'&&Object.hasOwn(CHORD_INTERVALS,c[1]))))return {code:'IMAGE_INVALID'};
 if(!['quarters','offbeat','arpeggio'].includes(value.rhythm)||!['block','broken','rising','falling'].includes(value.voicing))return {code:'IMAGE_INVALID'};
 if(![value.chordTicks,value.bassTicks,value.drums?.kick,value.drums?.snare,value.drums?.hat].every(hitsValid)||!Array.isArray(value.bassIntervals)||value.bassIntervals.length!==value.bassTicks.length||!value.bassIntervals.every(n=>[0,7,12].includes(n)))return {code:'IMAGE_INVALID'};
 if(![0,1,2].includes(value.inversion)||!Number.isFinite(value.gate)||value.gate<1||value.gate>15||!Number.isFinite(value.strength)||value.strength<.3||value.strength>1.2)return {code:'IMAGE_INVALID'};
 if(!['piano','wood','soft','sine','lead'].includes(value.sounds?.chord)||!['piano','wood','soft','sine','lead'].includes(value.sounds?.bass)||!['none','acoustic','electronic'].includes(value.sounds?.drums))return {code:'IMAGE_INVALID'};
 return null;
}
export function generateImageAccompaniment(pattern,choice=DEFAULT_IMAGE,{resetManual=false}={}){
 if(!validImageChoice(choice))throw new Error('IMAGE_INVALID');
 const old=structuredClone(pattern.accompaniment??{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'});
 if(resetManual){delete old.chords;delete old.sounds;delete old.manualSettings;}
 const previous=old.imageArrangement,sameChoice=previous&&['type','speed','mood'].every(key=>previous.choice[key]===choice[key]);
 const index=sameChoice?(previous.index+1)%IMAGE_PATTERN_COUNT:0;
 const manual=old.manualSettings??{},type=manual.genre?old.genre:choice.type,profile=profiles[type];
 const gentle=choice.mood==='gentle'||choice.mood==='sad',sparse=choice.speed==='slow';
 const rhythm=manual.rhythm?old.rhythm:(type==='ballad'||gentle?'arpeggio':profile.rhythm);
 const chordTicks=rhythm==='arpeggio'?(sparse?[0,4,8,12]:[0,2,4,6,8,10,12,14]):rhythm==='offbeat'?(sparse?[2,10]:[2,6,10,14]):sparse?[0,8]:[0,4,8,12];
 const bassTicks=sparse?[0,8]:choice.speed==='fast'?[0,2,4,6,8,10,12,14]:profile.bass;
 const shift={bright:0,gentle:2,cool:4,sad:5}[choice.mood];
 const sounds={...profile.sounds};if(gentle)sounds.chord=type==='nursery'?'wood':'piano';
 const voicing=rhythm==='arpeggio'?(index%2?'falling':'rising'):gentle||index%2?'broken':'block';
 const arrangement={version:1,choice:{...choice},index,progressions:{major:structuredClone(major[(index+shift)%8]),minor:structuredClone(minor[(index+shift)%8])},rhythm,voicing,chordTicks,bassTicks,
  bassIntervals:bassTicks.map((_,i)=>i%2===0?0:index%3===0?7:index%3===1?12:0),inversion:index%3,
  gate:sparse?7:type==='ballad'?3:2,strength:gentle?.65:choice.mood==='cool'?1:.85,sounds,
  drums:{kick:type==='ballad'?[0]:index%2?[0,6,8]:[0,8],snare:gentle?[12]:[4,12],hat:sparse?[4,12]:choice.speed==='fast'?[0,2,4,6,8,10,12,14]:[2,6,10,14]}};
 return {...old,enabled:manual.enabled?old.enabled:true,genre:type,rhythm,imageChoice:{...choice},imageArrangement:arrangement};
}
