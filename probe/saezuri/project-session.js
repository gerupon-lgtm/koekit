import {openEditSession} from './edit-session.js?v=v0.1.0-20261031130511-e7ac30d';
import {restoreCheckpoint,checkpointFingerprint} from './song-session.js?v=v0.1.0-20261031130511-e7ac30d';
import {canKeepPhrase} from './sequence-session.js?v=v0.1.0-20261031130511-e7ac30d';
const copy=value=>structuredClone(value);
export function emptyPartCheckpoint(pattern,{accepted=false}={}){
 const session=openEditSession(pattern);if(session.code)throw new Error(session.code);
 return accepted?{confirmed:{pattern:copy(pattern),cursor:0,hasRest:false},draft:null}:{confirmed:null,draft:{confirmed:copy(pattern),accepted:false,confirmedCursor:0,confirmedHasRest:false,working:copy(session.working),entryInput:null,imageCandidate:null}};
}
export function validateProject(project,sequence){
 if(project?.version!==1||!Array.isArray(project.parts))return 'PROJECT_INVALID';
 const ids=new Set();
 try{for(const part of project.parts){
  if(!part||typeof part.id!=='string'||ids.has(part.id)||typeof part.name!=='string')return 'PART_INVALID';ids.add(part.id);
  if(part.patternId&&!sequence.patterns.some(p=>p.id===part.patternId))return 'PART_PATTERN_MISSING';
  if(part.checkpoint&&!restoreCheckpoint(part.checkpoint))return 'PART_CHECKPOINT_INVALID';
  if(!part.patternId&&!part.checkpoint)return 'PART_EMPTY';
 }if(project.activeId&&!ids.has(project.activeId))return 'PART_ACTIVE_MISSING';}catch{return 'PART_CHECKPOINT_INVALID';}
 return null;
}
export function migrateProject(data){
 if(data.project){const invalid=validateProject(data.project,data.sequence);if(invalid)throw new Error(invalid);return copy(data.project);}
 const project={version:1,parts:(data.sequence?.patterns??[]).map(p=>({id:p.id,name:p.name,patternId:p.id,checkpoint:null,mode:p.source==='manual'?'input':'edit'})),activeId:null};
 // The old unregistered workspace stays independent even when its notes match a shelf item.
 if(data.checkpoint){const session=restoreCheckpoint(data.checkpoint);if(!session)throw new Error('PART_CHECKPOINT_INVALID');
  const part=allocatePart(project,session.confirmed);part.name='つくりかけ';part.checkpoint=copy(data.checkpoint);part.mode=data.navigation?.mode??part.mode;project.activeId=part.id;
 }
 return project;
}
export function allocatePart(project,pattern,{copyFrom=null}={}){
 const id=crypto.randomUUID(),names=new Set(project.parts.map(p=>p.name));let name;
 if(copyFrom){const stem=(copyFrom.familyName??project.parts.find(p=>p.patternId===copyFrom.familyId)?.name??copyFrom.name??'パーツ').slice(0,20);let n=2;do{name=stem+n++;}while(names.has(name));}
 else{let n=1;do{name='パーツ'+n++;}while(names.has(name));}
 const part={id,name,patternId:null,mode:pattern.source==='manual'?'input':'edit',checkpoint:emptyPartCheckpoint(pattern,{accepted:!!copyFrom})};
 project.parts.push(part);project.activeId=id;return part;
}
export function capturePart(project,sequence,checkpoint,mode){
 let part=project.parts.find(p=>p.id===project.activeId);if(!part)return;
 const source=sequence.patterns.find(p=>p.id===part.patternId),incoming=checkpoint?.confirmed?.pattern;
 const content=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['id','name','familyId','familyName','derivedFrom','revision'].includes(k)));
 if(source&&incoming&&sequence.placements.some(p=>p.patternId===source.id)&&checkpointFingerprint(content(source))!==checkpointFingerprint(content(incoming))){
  // Even browser Back or a retained editor cannot overwrite every occurrence.
  const previous=part;part=allocatePart(project,incoming,{copyFrom:source});previous.checkpoint=emptyPartCheckpoint(source,{accepted:true});
 }

 if(checkpoint)part.checkpoint=copy(checkpoint);part.mode=mode;
 const pattern=part.checkpoint?.confirmed?.pattern;
 if(!pattern||!part.patternId&&!canKeepPhrase(pattern))return;
 const index=sequence.patterns.findIndex(p=>p.id===part.patternId),id=part.patternId??part.id;
 const next={...copy(pattern),id,familyId:pattern.familyId??id,name:part.name};
 if(index<0){sequence.patterns.push(next);part.patternId=id;sequence.revision++;}
 else if(checkpointFingerprint(sequence.patterns[index])!==checkpointFingerprint(next)){sequence.patterns[index]=next;sequence.revision++;}
}
export function syncProjectParts(project,sequence){
 for(const pattern of sequence.patterns)if(!project.parts.some(p=>p.patternId===pattern.id))project.parts.push({id:pattern.id,name:pattern.name,patternId:pattern.id,checkpoint:null,mode:pattern.source==='manual'?'input':'edit'});
 project.parts=project.parts.filter(part=>!part.patternId||sequence.patterns.some(p=>p.id===part.patternId));
 if(project.activeId&&!project.parts.some(p=>p.id===project.activeId))project.activeId=null;
}
