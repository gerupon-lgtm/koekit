import {openEditSession, hasDraftChanges} from './edit-session.js?v=v0.1.0-20261001214550-9fb3c40';
import {proposeEntry} from './entry-session.js?v=v0.1.0-20261001214550-9fb3c40';
import {validateNotes} from '../../saezuri/document.js?v=v0.1.0-20261001214550-9fb3c40';
const clone=value=>structuredClone(value);

export function songCheckpoint(session,{existing=false}={}) {
 if(!session || session.closed)return null;
 const actual=session.working.pattern;
 const melody=actual.notes.length || session.confirmed.notes.length || session.entry || (session.accepted&&session.confirmedHasRest);
 const backing=session.accepted && session.confirmed.accompaniment?.enabled;
 if(!melody&&!backing&&!(existing&&session.accepted))return null;
 const confirmed=session.accepted?{pattern:clone(session.confirmed),cursor:session.confirmedCursor??session.working.cursor,hasRest:!!session.confirmedHasRest}:null;
 const pending=!!session.entry || hasDraftChanges(session) || !session.accepted;
 return {confirmed,draft:pending?{
  confirmed:clone(session.confirmed),accepted:!!session.accepted,confirmedCursor:session.confirmedCursor??0,confirmedHasRest:!!session.confirmedHasRest,
  working:clone(session.working),entryInput:session.entry?clone(session.entry.input):null,
 }:null};
}

export function restoreCheckpoint(checkpoint,{discardDraft=false}={}) {
 const draft=!discardDraft&&checkpoint?.draft;
 const pattern=draft?.confirmed??checkpoint?.confirmed?.pattern;
 if(!pattern)return null;
 const session=openEditSession(pattern);
 if(session.code)throw new Error(session.code);
 session.accepted=!!checkpoint.confirmed;
 session.confirmedCursor=checkpoint.confirmed?.cursor??0;
 session.confirmedHasRest=!!checkpoint.confirmed?.hasRest;
 session.working.hasRest=session.confirmedHasRest;
 if(draft){
  const invalid=validateNotes(draft.working?.pattern);if(invalid)throw new Error(invalid.code);
  session.working={...clone(draft.working),undoStack:[]};
  session.accepted=!!draft.accepted;session.confirmedCursor=draft.confirmedCursor;session.confirmedHasRest=!!draft.confirmedHasRest;
  if(draft.entryInput){const next=proposeEntry(session,draft.entryInput);if(next.code)throw new Error(next.code);return next;}
 }else session.working.cursor=checkpoint.confirmed?.cursor??0;
 return session;
}

// The data fingerprint excludes navigation, selection, input presets and Undo.
export function checkpointFingerprint(value) {
 return JSON.stringify(value,(key,item)=>['selectedNoteId','revision','undoStack','history'].includes(key)?undefined:item);
}
