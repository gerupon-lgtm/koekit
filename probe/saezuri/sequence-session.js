import {validateNotes} from '../../saezuri/document.js?v=v0.1.0-20261101031405-99da58a';
import {validateComposition,proposeSequence,commitSequence,undoSequence} from '../../saezuri/sequence.js?v=v0.1.0-20261101031405-99da58a';
import {accompanimentEvents,validateAccompaniment} from '../../saezuri/music/accompaniment.js?v=v0.1.0-20261101031405-99da58a';
import {endingEvents,endingDescription} from '../../saezuri/music/ending.js?v=v0.1.0-20261101031405-99da58a';
export const emptySequence=()=>({patterns:[],placements:[],revision:0,undoStack:[]});
export function canKeepPhrase(pattern){
 if(validateNotes(pattern))return false;
 return !!pattern.notes.length || (pattern.accompaniment?.enabled===true&&!validateAccompaniment(pattern.accompaniment,pattern.bars));
}
function phraseId(draft){
 const used=new Set([...draft.patterns,...(draft.undoStack??[]).flatMap(item=>item.patterns??[])].map(p=>p.id));
 let number=0,id;do{id=`phrase-${draft.revision}-${number++}`;}while(used.has(id));return id;
}
export function keepPhrase(draft,pattern,name) {
 const error=validateNotes(pattern);if(error)return error;
 if(!canKeepPhrase(pattern))return {code:'EMPTY_PHRASE'};
 const id=phraseId(draft);
 return {...draft,revision:draft.revision+1,patterns:[...draft.patterns,{...structuredClone(pattern),id,familyId:id,name:name.trim().slice(0,24)||`フレーズ${draft.patterns.length+1}`} ]};
}
export function derivePlacement(draft,placementId,pattern){
 const placement=draft.placements.find(p=>p.id===placementId),source=draft.patterns.find(p=>p.id===placement?.patternId);
 if(!source)return {code:'PLACEMENT_NOT_FOUND'};
 const stem=(source.familyName??draft.patterns.find(p=>p.id===source.familyId)?.name??source.name??'フレーズ').slice(0,20),names=new Set(draft.patterns.map(p=>p.name));
 let number=2,name;do{name=`${stem}${number++}`;}while(names.has(name));
 return proposeSequence(draft,{type:'derive',placementId,patternId:phraseId(draft),pattern,name});
}
export function sequencePlayback(draft,fromPlacementId=null) {
 const invalid=validateComposition(draft);if(invalid)return invalid;
 const index=fromPlacementId===null?0:draft.placements.findIndex(p=>p.id===fromPlacementId);
 if(index<0)return {code:'PLACEMENT_NOT_FOUND'};
 const startTick=draft.placements.slice(0,index).reduce((ticks,p)=>ticks+draft.patterns.find(pattern=>pattern.id===p.patternId).bars*16,0);
 let offset=0;const notes=[],backing=[],ranges=[];
 for(const placement of draft.placements.slice(index)) {
  const p=draft.patterns.find(p=>p.id===placement.patternId);
  notes.push(...p.notes.map(n=>({...n,id:`${placement.id}-${n.id}`,startTick:offset+n.startTick})));
  backing.push(...accompanimentEvents(p).map(n=>({...n,startTick:offset+n.startTick})));
  ranges.push({id:placement.id,start:offset,end:offset+p.bars*16});offset+=p.bars*16;
 }
 const ending=endingDescription(draft);if(ending?.code)return ending;
 if(ending){const events=endingEvents(draft,offset);if(events.code)return events;backing.push(...events);ranges.push({id:'ending',start:offset,end:offset+ending.durationTick});}
 return {...(fromPlacementId===null?{}:{startTick,fromPlacementId}),pattern:{bars:(offset+(ending?.durationTick??0))/16,notes},backing,ranges,ending:ending?{...ending,startTick:offset}:null};
}
// Arrangement undo must preserve the phrase shelf, which is independently added to.
export function undoPlacement(draft) {
 const restored=undoSequence(draft),patterns=restored.patterns.map(p=>draft.patterns.find(current=>current.id===p.id)??p);
 for(const pattern of draft.patterns)if(!patterns.some(p=>p.id===pattern.id))patterns.push(pattern);
 return {...restored,patterns};
}
export {proposeSequence,commitSequence};
