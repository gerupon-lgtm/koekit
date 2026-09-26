import { SCHEMA_VERSION, RULES_VERSION } from './config.js';
import { validateStage, validateRuntime, allPackagesMask } from './rules.js';
import { resumeSession } from './run.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=code=>({ok:false,code,value:null,revision:null});
export function validateSession(value){
  if(!value||typeof value.sessionId!=='string'||value.rulesVersion!==RULES_VERSION||!['normal','custom','tutorial'].includes(value.source)||!['easy','hard'].includes(value.difficulty)||!['editing','executing','paused','failed','cleared'].includes(value.phase))return false;
  if(!Number.isSafeInteger(value.revision)||value.revision<0||!Number.isInteger(value.stageIndex)||value.stageIndex<0)return false;
  if(!validateStage(value.stageSnapshot).ok||!validateRuntime(value.stageSnapshot,value.runtime)||!validateRuntime(value.stageSnapshot,value.checkpoint)||!Array.isArray(value.sequence))return false;
  if(!Number.isSafeInteger(value.stageSnapshot.stepLimit)||value.stageSnapshot.stepLimit<1||value.runtime.usedSteps>value.stageSnapshot.stepLimit)return false;
  if(value.source==='normal'&&(![1,2,3,4].includes(value.level)||value.stageIndex>2))return false;
  if(value.source==='custom'){
    if(!Array.isArray(value.orderedStageSnapshots)||value.orderedStageSnapshots.length<1||value.orderedStageSnapshots.length>10||value.stageIndex>=value.orderedStageSnapshots.length||value.orderedStageSnapshots.some(s=>!validateStage(s).ok||!Number.isSafeInteger(s.stepLimit)||s.stepLimit<1))return false;
    const active=value.orderedStageSnapshots[value.stageIndex];if(active.id!==value.stageSnapshot.id||active.revision!==value.stageSnapshot.revision)return false;
    if(value.preview!=null&&typeof value.preview!=='boolean')return false;
  }
  if(value.source==='tutorial'){
    if(!['basic','additional'].includes(value.tutorialType)||![1,2,3,4].includes(value.level)||value.stageIndex>2||!value.pendingStart||value.pendingStart.level!==value.level||value.pendingStart.stageIndex!==value.stageIndex||value.pendingStart.difficulty!==value.difficulty)return false;
    if(value.reviewTutorial!=null&&typeof value.reviewTutorial!=='boolean')return false;
  }
  if(value.sequence.some(c=>!c||!['up','down','left','right'].includes(c.direction)||!Number.isInteger(c.count)||c.count<1||c.count>999))return false;
  if(!Number.isInteger(value.commandIndex)||value.commandIndex<0||value.commandIndex>value.sequence.length||!Number.isInteger(value.commandOffset)||value.commandOffset<0)return false;
  const command=value.sequence[value.commandIndex];if(command?value.commandOffset>=command.count:value.commandOffset!==0)return false;
  if(['executing','paused'].includes(value.phase)&&!command)return false;
  if(['editing','cleared'].includes(value.phase)&&(value.commandIndex!==0||value.commandOffset!==0))return false;
  if(value.selectedIndex!=null&&(!Number.isInteger(value.selectedIndex)||value.selectedIndex<0||value.selectedIndex>=value.sequence.length||value.phase!=='editing'))return false;
  const {runtime,checkpoint}=value,mask=allPackagesMask(value.stageSnapshot);
  if((value.phase==='cleared')!==(runtime.deliveredMask===mask))return false;
  if(value.phase==='cleared'&&(runtime.heldMask!==0||value.sequence.length!==0||runtime.position!==value.stageSnapshot.destination))return false;
  if(value.phase==='failed'&&!['BLOCKED','OUT_OF_BOUNDS','STEP_LIMIT','SEQUENCE_EXHAUSTED'].includes(value.failureCode))return false;
  if(checkpoint.usedSteps>runtime.usedSteps||checkpoint.heldMask!==0||(checkpoint.deliveredMask&runtime.deliveredMask)!==checkpoint.deliveredMask)return false;
  if(checkpoint.usedSteps===0){if(checkpoint.position!==value.stageSnapshot.start||checkpoint.deliveredMask!==0)return false;}
  else if(checkpoint.position!==value.stageSnapshot.destination||checkpoint.deliveredMask===0)return false;
  if(value.difficulty==='hard'&&(checkpoint.usedSteps!==0||checkpoint.deliveredMask!==0))return false;
  return true;
}
function validValue(kind,value){
  if(value===null)return true;
  if(kind==='session')return validateSession(value);
  if(kind==='library')return value&&Array.isArray(value.stages)&&value.stages.length<=10&&value.stages.every(s=>s&&typeof s.id==='string'&&validateStage(s,{draft:true}).ok)&&new Set(value.stages.map(s=>s.id)).size===value.stages.length;
  if(kind==='progress'){
    if(!value||typeof value!=='object'||Array.isArray(value)||!['easy','hard'].every(d=>value[d]==null||(Array.isArray(value[d].clearedLevelIds)&&value[d].clearedLevelIds.every(id=>[1,2,3,4].includes(id)))))return false;
    const tutorial=value.tutorialCompletion;if(tutorial==null)return true;
    if(typeof tutorial!=='object'||Array.isArray(tutorial)||(tutorial.basic!=null&&typeof tutorial.basic!=='boolean'))return false;
    const additional=tutorial.additional;return additional==null||(typeof additional==='object'&&!Array.isArray(additional)&&['easy','hard'].every(d=>additional[d]==null||typeof additional[d]==='boolean'));
  }
  return false;
}
export class DeliveryStorage {
  constructor(storage){this.storage=storage;this.ended=new Set();this.listeners=new Set();this.storageHandler=event=>{if(event.key?.startsWith('koekit.delivery.v1.'))this.listeners.forEach(fn=>fn(event.key.split('.').at(-1)));};globalThis.addEventListener?.('storage',this.storageHandler);}
  key(kind){if(!['session','library','progress'].includes(kind))throw new Error('INVALID_KEY');return `koekit.delivery.v1.${kind}`;}
  backend(){return this.storage??globalThis.localStorage;}
  subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  dispose(){globalThis.removeEventListener?.('storage',this.storageHandler);this.listeners.clear();}
  read(kind){
    let raw;try{raw=this.backend().getItem(this.key(kind));}catch{return fail('STORAGE_UNAVAILABLE');}
    if(raw===null)return {ok:true,value:null,revision:0,envelope:null};
    let envelope;try{envelope=JSON.parse(raw);}catch{return fail('INVALID_SAVE');}
    if(!envelope||envelope.schemaVersion!==SCHEMA_VERSION||envelope.rulesVersion!==RULES_VERSION)return fail('UNKNOWN_VERSION');
    if(!Number.isInteger(envelope.revision)||envelope.revision<1||!validValue(kind,envelope.value)||(envelope.endedSessionIds!=null&&(!Array.isArray(envelope.endedSessionIds)||envelope.endedSessionIds.some(id=>typeof id!=='string'))))return fail('INVALID_SAVE');
    if(kind==='session')for(const id of envelope.endedSessionIds??[])this.ended.add(id);
    return {ok:true,value:envelope.value,revision:envelope.revision,envelope};
  }
  load(kind){const result=this.read(kind);if(!result.ok)return result;let value=result.value;if(kind==='session'&&value)value=this.ended.has(value.sessionId)?null:resumeSession(value);return {ok:true,value:value==null?null:clone(value),revision:result.revision};}
  save(kind,value,expectedRevision){
    const old=this.read(kind);if(!old.ok)return old;
    if(expectedRevision!==old.revision)return fail('STALE_REVISION');
    if(kind==='session'&&value&&this.ended.has(value.sessionId))return fail('SESSION_ENDED');
    if(!validValue(kind,value))return fail('INVALID_SAVE');
    const envelope={...(old.envelope??{}),schemaVersion:SCHEMA_VERSION,rulesVersion:RULES_VERSION,revision:old.revision+1,value:clone(value)};
    if(kind==='session')envelope.endedSessionIds=[...this.ended];
    try{this.backend().setItem(this.key(kind),JSON.stringify(envelope));}catch{return fail('STORAGE_UNAVAILABLE');}
    return {ok:true,value:clone(value),revision:envelope.revision};
  }
  endSession(sessionId,expectedRevision){
    this.ended.add(sessionId);const old=this.read('session');if(!old.ok)return old;
    if(old.revision!==expectedRevision)return fail('STALE_REVISION');
    if(old.value&&old.value.sessionId!==sessionId)return fail('STALE_REVISION');
    return this.save('session',null,expectedRevision);
  }
  saveStage(stage,expectedRevision){const old=this.load('library');if(!old.ok)return old;const value=old.value??{stages:[]},index=value.stages.findIndex(s=>s.id===stage.id);
    if(index<0&&value.stages.length>=10)return fail('LIBRARY_FULL');if(index<0)value.stages.push(clone(stage));else value.stages[index]=clone(stage);return this.save('library',value,expectedRevision);}
  deleteStage(id,expectedRevision){const old=this.load('library');if(!old.ok)return old;const value=old.value??{stages:[]};value.stages=value.stages.filter(s=>s.id!==id);return this.save('library',value,expectedRevision);}
  duplicateStage(id,expectedRevision){const old=this.load('library');if(!old.ok)return old;const stage=old.value?.stages.find(s=>s.id===id);if(!stage)return fail('NOT_FOUND');
    return this.saveStage({...clone(stage),id:globalThis.crypto?.randomUUID?.()??`copy-${Date.now()}-${Math.random()}`,revision:1},expectedRevision);}
}
