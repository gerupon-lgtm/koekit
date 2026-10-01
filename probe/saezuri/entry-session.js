import {proposeNote,proposeEdit,commitNote} from '../../saezuri/document.js?v=v0.1.0-20261001232933-0856715';
import {hasDraftChanges} from './edit-session.js?v=v0.1.0-20261001232933-0856715';
const copy=value=>structuredClone(value);
const error=(code,details={})=>({code,details});
export const blankPattern=(key='C')=>({bars:4,gridStep:2,source:'manual',key:{tonicPitchClass:key==='Am'?9:0,mode:key==='Am'?'minor':'major'},notes:[]});
export const entryPreview=session=>session.entry && !session.entry.proposal.code ? session.entry.proposal.pattern : session.working.pattern;

export function moveEntryCursor(session,tick) {
  if(session.closed) return error('SESSION_CLOSED');
  if(hasDraftChanges(session)) return error('DRAFT_PENDING');
  if(!Number.isInteger(tick) || tick<0 || tick>session.working.pattern.bars*16 || tick%session.working.pattern.gridStep) return error('NOTE_GRID');
  return {...session,entry:null,working:{...session.working,cursor:tick}};
}

export function proposeEntry(session,input) {
  if(session.closed) return error('SESSION_CLOSED');
  if(hasDraftChanges(session)) return error('DRAFT_PENDING');
  const {midi,durationTick,replaceNoteId}=input;
  let proposal;
  const manual=session.working.pattern.source==='manual';
  if(manual && midi!==null && (!Number.isInteger(midi) || midi<60 || midi>84 || ![0,2,4,5,7,9,11].includes(midi%12))) proposal=error('ENTRY_PITCH');
  else if(replaceNoteId) {
    const note=session.working.pattern.notes.find(n=>n.id===replaceNoteId);
    if(!note) proposal=error('NOTE_NOT_FOUND');
    else if(midi===null) proposal=error('ENTRY_REST_REPLACE');
    else proposal=proposeEdit(session.working,{type:'replace',noteId:replaceNoteId,midi,startTick:note.startTick,durationTick});
  } else if(midi===null && session.working.pattern.notes.some(n=>n.startTick<session.working.cursor+durationTick && n.startTick+n.durationTick>session.working.cursor)) proposal=error('NOTE_OVERLAP');
  else proposal=proposeNote(session.working,{midi,durationTick});
  // Keep rejected input visible so it can be corrected without moving the cursor.
  if(proposal.code==='NOTE_OVERFLOW' && !proposal.details?.shortageBeats) {
    const start=replaceNoteId?session.working.pattern.notes.find(n=>n.id===replaceNoteId)?.startTick:session.working.cursor;
    proposal=error('NOTE_OVERFLOW',{shortageBeats:(start+durationTick-session.working.pattern.bars*16)/4});
  }
  return {...session,entry:{input:copy(input),proposal}};
}

export function confirmEntry(session) {
  if(session.closed) return error('SESSION_CLOSED');
  if(!session.entry) return error('CANDIDATE_INVALID');
  const next=commitNote(session.working,session.entry.proposal);
  if(next.code) return next;
  const {undoStack,...working}=next;
  const added=working.pattern.notes.find(n=>!session.working.pattern.notes.some(old=>old.id===n.id));
  working.selectedNoteId=session.entry.input.replaceNoteId ?? added?.id ?? session.working.selectedNoteId;
  working.hasRest=!!session.working.hasRest || session.entry.input.midi===null;
  return {...session,working,confirmed:copy(working.pattern),confirmedCursor:working.cursor,confirmedHasRest:working.hasRest,entry:null,accepted:true,history:[...session.history,copy(session.working)]};
}

export function cancelEntry(session) {return {...session,entry:null};}
