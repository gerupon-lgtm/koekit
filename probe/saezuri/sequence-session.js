import {validateNotes} from '../../saezuri/document.js?v=v0.1.0-20261001232933-0856715';
import {validateComposition,proposeSequence,commitSequence,undoSequence} from '../../saezuri/sequence.js?v=v0.1.0-20261001232933-0856715';
import {accompanimentEvents} from '../../saezuri/music/accompaniment.js?v=v0.1.0-20261001232933-0856715';
export const emptySequence=()=>({patterns:[],placements:[],revision:0,undoStack:[]});
export function keepPhrase(draft,pattern,name) {
 const error=validateNotes(pattern);if(error)return error;
 if(!pattern.notes.length)return {code:'EMPTY_PHRASE'};
 const id=`phrase-${draft.revision}-${draft.patterns.length}`;
 return {...draft,revision:draft.revision+1,patterns:[...draft.patterns,{...structuredClone(pattern),id,familyId:id,name:name.trim().slice(0,24)||`フレーズ${draft.patterns.length+1}`} ]};
}
export function sequencePlayback(draft) {
 const invalid=validateComposition(draft);if(invalid)return invalid;
 let offset=0;const notes=[],backing=[],ranges=[];
 for(const placement of draft.placements) {
  const p=draft.patterns.find(p=>p.id===placement.patternId);
  notes.push(...p.notes.map(n=>({...n,id:`${placement.id}-${n.id}`,startTick:offset+n.startTick})));
  backing.push(...accompanimentEvents(p).map(n=>({...n,startTick:offset+n.startTick})));
  ranges.push({id:placement.id,start:offset,end:offset+p.bars*16});offset+=p.bars*16;
 }
 return {pattern:{bars:offset/16,notes},backing,ranges};
}
// Arrangement undo must preserve the phrase shelf, which is independently added to.
export function undoPlacement(draft) {
 const restored=undoSequence(draft);return {...restored,patterns:draft.patterns};
}
export {proposeSequence,commitSequence};
