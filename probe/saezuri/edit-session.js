import { createCaptureEditor, proposeCaptureEdit, commitNote } from './capture-editor.js?v=v0.1.0-20261002222541-da565ef';

const copy = value => structuredClone(value);
const error = code => ({code, details:{}});
const workingCopy = state => {
  const {undoStack, ...working} = copy(state);
  working.selectedNoteId = working.pattern.notes.some(n => n.id === working.selectedNoteId)
    ? working.selectedNoteId : working.pattern.notes[0]?.id ?? null;
  return working;
};
export function openEditSession(pattern) {
  const state = createCaptureEditor(pattern);
  return state.code ? state : {confirmed:copy(pattern), working:workingCopy(state), history:[], accepted:false, closed:false};
}
export const hasDraftChanges = session => !!session && (JSON.stringify(session.confirmed) !== JSON.stringify(session.working.pattern) || !!session.confirmedHasRest !== !!session.working.hasRest);
export function selectEditNote(session, noteId) {
  if (session.closed) return error('SESSION_CLOSED');
  if (!session.working.pattern.notes.some(n => n.id === noteId)) return error('NOTE_NOT_FOUND');
  return {...session, working:{...session.working, selectedNoteId:noteId}};
}
export function stageEdit(session, command) {
  if (session.closed) return error('SESSION_CLOSED');
  const proposal = proposeCaptureEdit(session.working, command);
  if (proposal.code) return proposal;
  const next = commitNote(session.working, proposal);
  if (next.code) return next;
  if(command.type==='delete' && command.noteId===session.working.selectedNoteId) {
    const ordered=[...session.working.pattern.notes].sort((a,b)=>a.startTick-b.startTick);
    const index=ordered.findIndex(note=>note.id===command.noteId);
    next.selectedNoteId=ordered[index+1]?.id ?? ordered[index-1]?.id ?? null;
  }
  return {...session, imageCandidate:null, working:workingCopy(next), history:[...session.history, copy(session.working)]};
}
// Only a candidate owned by this operation may be replaced. Melody/structure
// edits still require their normal confirmation, and repeated auditions use one
// Undo entry regardless of how many arrangements the user tries.
export const canGenerateAccompaniment=session=>!!session&&!session.closed&&!session.entry&&(!hasDraftChanges(session)||!!session.imageCandidate);
export function stageAccompanimentCandidate(session,value){
  if(!canGenerateAccompaniment(session))return error('DRAFT_PENDING');
  const next=stageEdit(session,{type:'accompaniment',value});if(next.code)return next;
  return {...next,history:session.imageCandidate?session.history:next.history,
    imageCandidate:session.imageCandidate??{base:copy(session.working)}};
}
export function confirmEditSession(session) {
  if (session.closed) return error('SESSION_CLOSED');
  return {...session, imageCandidate:null, confirmed:copy(session.working.pattern),confirmedCursor:session.working.cursor,confirmedHasRest:!!session.working.hasRest, accepted:true};
}
export function cancelEditSession(session) {
  if (session.closed) return error('SESSION_CLOSED');
  if (!hasDraftChanges(session)) return session;
  return {...session, imageCandidate:null, history:[...session.history, copy(session.working)],
    working:workingCopy({...session.working, pattern:session.confirmed,hasRest:!!session.confirmedHasRest, revision:session.working.revision+1})};
}
export function undoEditSession(session) {
  if (session.closed) return error('SESSION_CLOSED');
  if (!session.history.length) return session;
  return {...session, imageCandidate:null, history:session.history.slice(0,-1),
    working:{...copy(session.history.at(-1)), revision:session.working.revision+1}};
}
export function endEditSession(session) {
  if (hasDraftChanges(session)) return error('DRAFT_PENDING');
  return {...session, closed:true, history:[]};
}
