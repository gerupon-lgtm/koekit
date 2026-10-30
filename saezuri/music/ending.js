import {chordTones} from './catalog.js?v=v0.1.0-20261030102318-2f22e53';
import {SOUND_PRESETS,chordVoicing,harmonicSegments,validateAccompaniment} from './accompaniment.js?v=v0.1.0-20261030102318-2f22e53';
const error=()=>({code:'ENDING_INVALID'});
const lastPattern=draft=>draft.patterns.find(p=>p.id===draft.placements.at(-1)?.patternId);
export const endingBars=ending=>ending?.enabled?(ending.bars??1):0;
export function validateEnding(ending){
 if(ending===undefined||ending===null)return null;
 if(typeof ending!=='object'||Array.isArray(ending)||typeof ending.enabled!=='boolean')return error();
 if(ending.bars!==undefined&&(![0,1,2,4].includes(ending.bars)||ending.enabled&&ending.bars===0))return error();
 if(ending.mode!==undefined&&!['auto','custom'].includes(ending.mode))return error();
 if(ending.bassMode!==undefined&&!['root','custom'].includes(ending.bassMode))return error();
 if(ending.mode==='custom'&&chordTones(ending.customChord).code)return error();
 if(ending.customChord!=null&&chordTones(ending.customChord).code)return error();
 return null;
}
// Missing keys in older phrases use the same C default as their accompaniment.
export function automaticEndingChord(draft){
 const key=lastPattern(draft)?.key??{tonicPitchClass:0,mode:'major'};
 if(!Number.isInteger(key.tonicPitchClass)||key.tonicPitchClass<0||key.tonicPitchClass>11||!['major','minor'].includes(key.mode))return {code:'ENDING_KEY_INVALID'};
 return {root:key.tonicPitchClass,quality:key.mode==='minor'?'minor':'major',bass:key.tonicPitchClass};
}
export function endingDescription(draft){
 const invalid=validateEnding(draft.ending);if(invalid)return invalid;
 const bars=endingBars(draft.ending);if(!bars||!draft.placements.length)return null;
 const chord=draft.ending.mode==='custom'?structuredClone(draft.ending.customChord):automaticEndingChord(draft);
 if(chord.code)return chord;
 return {bars,durationTick:bars*16,chord,mode:draft.ending.mode??'auto'};
}
export function endingEvents(draft,startTick=0){
 const ending=endingDescription(draft);if(!ending)return [];if(ending.code)return ending;
 const pattern=lastPattern(draft),value=pattern.accompaniment??{},sounds={...SOUND_PRESETS[value.genre??'nursery'],...value.imageArrangement?.sounds,...value.sounds};
 const previous=value.enabled&&!validateAccompaniment(value,pattern.bars)?chordVoicing(harmonicSegments(pattern).at(-1)):[];
 const strength=value.imageArrangement?.strength??1;
 const event=(midi,instrument,gain,part)=>({startTick,durationTick:ending.durationTick,midi,instrument,gain:gain*strength,part,ending:true});
 return [event(36+ending.chord.bass,sounds.bass??'soft',.065,'bass'),...chordVoicing(ending.chord,previous).map(midi=>event(midi,sounds.chord??'piano',.04,'chord'))];
}
