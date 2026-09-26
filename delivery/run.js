import { RULES_VERSION, LEVELS, TITLES, DIRECTIONS } from './config.js';
import { initialRuntime, step, validateStage } from './rules.js';
const clone=value=>JSON.parse(JSON.stringify(value));
let nextId=0;
export function createSession(stage,options={}) {
  const valid=validateStage(stage);if(!valid.ok)throw Object.assign(new Error(valid.code),{code:valid.code});
  const runtime=initialRuntime(stage);
  return {sessionId:options.sessionId??globalThis.crypto?.randomUUID?.()??`delivery-${Date.now()}-${++nextId}`,revision:0,rulesVersion:RULES_VERSION,source:'normal',difficulty:'easy',level:1,stageIndex:0,...options,stageSnapshot:clone(stage),runtime,checkpoint:{...runtime},sequence:[],commandIndex:0,commandOffset:0,selectedIndex:null,phase:options.phase??'editing',failureCode:null};
}
export function editSequence(session,command) {
  if(session.phase!=='editing')return session;
  const s=clone(session);s.failureCode=null;
  if(command.type==='move'){
    if(!DIRECTIONS[command.direction]||!Number.isInteger(command.count)||command.count<1||command.count>999)return session;
    const row={direction:command.direction,count:command.count};
    if(s.selectedIndex!=null&&s.selectedIndex<s.sequence.length)s.sequence[s.selectedIndex]=row;else s.sequence.push(row);
    s.selectedIndex=null;
  }else if(command.type==='select'){
    if(!Number.isInteger(command.index)||command.index<0||command.index>=s.sequence.length)return session;
    s.selectedIndex=command.index;
  }else if(command.type==='undo'){s.sequence.pop();s.selectedIndex=null;}
  else if(command.type==='reset'){s.sequence=[];s.selectedIndex=null;}
  else return session;
  s.revision++;return s;
}
export const remainingSteps = session => session.stageSnapshot.stepLimit-session.runtime.usedSteps-(session.phase==='editing'?session.sequence.reduce((n,c)=>n+c.count,0):0);
export function startExecution(session) {
  if(session.phase==='paused')return {...session,phase:'executing',revision:session.revision+1};
  if(session.phase!=='editing'||session.sequence.length===0)return session;
  return {...session,phase:'executing',selectedIndex:null,commandIndex:0,commandOffset:0,revision:session.revision+1};
}
export function advance(session) {
  if(session.phase!=='executing')return {session,events:[]};
  const s=clone(session),fail=code=>{s.phase='failed';s.failureCode=code;s.revision++;return {session:s,events:[{type:'failure',code}]};};
  const command=s.sequence[s.commandIndex];if(!command)return fail('SEQUENCE_EXHAUSTED');
  const result=step(s.stageSnapshot,s.runtime,command.direction);
  if(result.status==='failed')return fail(result.code);
  s.runtime=result.state;s.commandOffset++;
  if(s.commandOffset>=command.count){s.commandIndex++;s.commandOffset=0;}
  // Every actual partial delivery becomes the easy-mode retry checkpoint,
  // including delivery on the final allowed step. Its spent budget is retained.
  const deliveryBoundary=s.difficulty==='easy'&&result.status!=='cleared'&&result.events.some(e=>e.type==='deliver');
  if(deliveryBoundary)s.checkpoint={...s.runtime};
  if(result.status==='cleared'){s.phase='cleared';s.sequence=[];s.commandIndex=0;s.commandOffset=0;}
  else if(s.stageSnapshot.stepLimit!=null&&s.runtime.usedSteps>=s.stageSnapshot.stepLimit){s.phase='failed';s.failureCode='STEP_LIMIT';result.events.push({type:'failure',code:s.failureCode});}
  else if(deliveryBoundary){s.sequence=[];s.commandIndex=0;s.commandOffset=0;s.phase='editing';}
  else if(s.commandIndex>=s.sequence.length){s.phase='failed';s.failureCode='SEQUENCE_EXHAUSTED';result.events.push({type:'failure',code:s.failureCode});}
  s.revision++;return {session:s,events:result.events};
}
export function retry(session) {
  if(session.phase!=='failed')return session;
  return {...clone(session),runtime:session.difficulty==='easy'?{...session.checkpoint}:initialRuntime(session.stageSnapshot),sequence:session.difficulty==='easy'?clone(session.sequence):[],commandIndex:0,commandOffset:0,selectedIndex:null,phase:'editing',failureCode:null,revision:session.revision+1};
}
export const resumeSession = session => ({...clone(session),selectedIndex:null,phase:session.phase==='executing'?'paused':session.phase});
export function markLevelCleared(progress,session) {
  if(session.source!=='normal'||session.phase!=='cleared'||session.stageIndex!==2||!LEVELS.some(l=>l.id===session.level))return progress;
  const p=clone(progress),difficulty=session.difficulty;
  p[difficulty]={...(p[difficulty]??{}),clearedLevelIds:[...new Set([...(p[difficulty]?.clearedLevelIds??[]),session.level])].sort((a,b)=>a-b)};return p;
}
export function highestTitle(progress,difficulty) {
  const ids=progress?.[difficulty]?.clearedLevelIds??[];return [...TITLES].reverse().find(t=>ids.includes(t.level))??null;
}
export function allLevelsCleared(progress,difficulty) {
  return LEVELS.every(level=>progress?.[difficulty]?.clearedLevelIds?.includes(level.id));
}
