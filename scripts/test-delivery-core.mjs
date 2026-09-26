import assert from 'node:assert/strict';
import { initialRuntime, step, validateStage, validateRuntime } from '../delivery/rules.js';
import { createSession, editSequence, startExecution, advance, retry, resumeSession, remainingSteps, markLevelCleared, highestTitle } from '../delivery/run.js';
import { solve, hint } from '../delivery/solver.js';
import { generate, hasMultipleRelevantRoutes } from '../delivery/generator.js';
import { parseUtterance } from '../delivery/commands.js';
import { BASIC_STAGE, BASIC_SEQUENCE, ADDITIONAL_STAGE, tutorialNeeded, completeTutorial } from '../delivery/tutorial.js';
import { DeliveryStorage, validateSession } from '../delivery/storage.js';
import { SearchClient } from '../delivery/search.js';

const stage = (extra={}) => ({id:'test',revision:1,size:3,blocked:[],start:0,destination:8,packages:[{id:'p0',cell:2}],stepLimit:12,...extra});
const execute = (s, limit=500) => { s=startExecution(s); for(let i=0;i<limit && s.phase==='executing';i++) s=advance(s).session; return s; };
const input = (s, directions) => directions.reduce((s,[direction,count])=>editSequence(s,{type:'move',direction,count}),s);
// Independent oracle deliberately does not call production step, neighbor or mask helpers.
function oracle(board) {
  const queue=[[board.start,[],[],0]]; const seen=new Set();
  for(let n=0;n<queue.length;n++) {
    const [pos,held,delivered,cost]=queue[n];
    if(delivered.length===board.packages.length) return cost;
    for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const row=Math.floor(pos/board.size)+dr,col=pos%board.size+dc;
      if(row<0||col<0||row>=board.size||col>=board.size) continue;
      const next=row*board.size+col; if(board.blocked.includes(next)) continue;
      let h=[...held],d=[...delivered];
      board.packages.forEach((p,i)=>{if(p.cell===next&&!h.includes(i)&&!d.includes(i)&&h.length<2)h.push(i);});
      if(next===board.destination){d=[...d,...h].sort();h=[];}
      h.sort(); const key=JSON.stringify([next,h,d]); if(seen.has(key))continue;
      seen.add(key);queue.push([next,h,d,cost+1]);
    }
  }
  return null;
}

assert.equal(validateStage(stage()).ok,true);
assert.equal(validateRuntime(BASIC_STAGE,{position:0,usedSteps:0,heldMask:4294967296,deliveredMask:0}),false);
assert.equal(validateStage(stage({packages:[{id:'a',cell:0}]})).ok,false);
assert.equal(step(stage(),initialRuntime(stage()),'left').code,'OUT_OF_BOUNDS');
assert.equal(step(stage({blocked:[1]}),initialRuntime(stage()),'right').code,'BLOCKED');
assert.equal(step(stage({destination:1}),initialRuntime(stage()),'right').events.some(e=>e.type==='deliver'),false);
let full=stage({packages:[{id:'a',cell:1},{id:'b',cell:2},{id:'c',cell:5}],destination:8});
let runtime=initialRuntime(full); for(const d of ['right','right','down'])runtime=step(full,runtime,d).state;
assert.equal(runtime.heldMask,3);assert.equal(runtime.deliveredMask,0);
assert.equal(step(full,runtime,'down').state.deliveredMask,3);

let s=input(createSession(stage({stepLimit:4}),{difficulty:'hard'}),[['right',2],['down',8]]);
assert.equal(remainingSteps(s),-6);s=execute(s);assert.equal(s.phase,'cleared');assert.equal(s.runtime.usedSteps,4);
assert.equal(s.commandIndex,0); // successful excess sequence is discarded
s=execute(input(createSession(stage({stepLimit:3}),{difficulty:'hard'}),[['right',2],['down',2]]));
assert.equal(s.phase,'failed');assert.equal(s.failureCode,'STEP_LIMIT');assert.equal(retry(s).runtime.usedSteps,0);assert.deepEqual(retry(s).sequence,[]);
const checkpointStage=stage({size:5,destination:24,packages:[{id:'a',cell:4},{id:'b',cell:20}],stepLimit:40});
s=execute(input(createSession(checkpointStage,{difficulty:'easy'}),[['right',4],['down',4],['left',4]]));
assert.equal(s.phase,'editing');assert.equal(s.runtime.usedSteps,8);assert.equal(s.runtime.deliveredMask,1);assert.deepEqual(s.sequence,[]);
const tightEasy=execute(input(createSession({...checkpointStage,stepLimit:8},{difficulty:'easy'}),[['right',4],['down',4]]));
assert.equal(tightEasy.phase,'failed');assert.equal(tightEasy.failureCode,'STEP_LIMIT');
const tightRetry=retry(tightEasy);assert.equal(tightRetry.runtime.deliveredMask,1);assert.equal(tightRetry.runtime.usedSteps,8);assert.equal(tightRetry.checkpoint.position,24);
assert.equal(tightRetry.stageSnapshot.stepLimit-tightRetry.runtime.usedSteps,0);
s=execute(input(s,[['down',1]]));assert.equal(s.phase,'failed');s=retry(s);assert.equal(s.runtime.usedSteps,8);assert.equal(s.sequence[0].direction,'down');assert.equal(s.phase,'editing');
let paused=startExecution(input(createSession(stage(),{difficulty:'hard'}),[['right',2],['down',2]]));paused=advance(paused).session;
paused=resumeSession(JSON.parse(JSON.stringify(paused)));assert.equal(paused.phase,'paused');assert.equal(paused.commandOffset,1);assert.equal(advance(paused).session.runtime.usedSteps,1);
assert.equal(execute(paused).phase,'cleared');
s=input(createSession(stage()),[['right',3],['down',5],['left',4]]);assert.equal(remainingSteps(s),0);
s=editSequence(s,{type:'select',index:1});s=editSequence(s,{type:'move',direction:'up',count:1});assert.equal(s.selectedIndex,null);assert.equal(s.sequence[1].count,1);
assert.equal(parseUtterance('2',{phase:'editing'}).type,'error');
assert.equal(parseUtterance('みぎ1 した2',{phase:'editing'}).code,'MULTIPLE_COMMANDS');
assert.deepEqual(parseUtterance('2ばん',{phase:'editing',maxRows:2}),{type:'select',index:1});
assert.equal(parseUtterance('スタート',{phase:'failed'}).type,'retry');
assert.equal(parseUtterance('オッケー',{phase:'hint'}).type,'next');
assert.equal(parseUtterance('みぎ1',{phase:'executing'}).type,'error');
assert.deepEqual(parseUtterance('右 十二',{phase:'editing'}),{type:'move',direction:'right',count:12});
assert.deepEqual(parseUtterance('みぎじゅうさん',{phase:'editing'}),{type:'move',direction:'right',count:13});
assert.equal(solve(BASIC_STAGE).minSteps,4);
assert.equal(execute(input(createSession(BASIC_STAGE,{difficulty:'hard'}),BASIC_SEQUENCE.map(c=>[c.direction,c.count]))).phase,'cleared');
assert.equal(ADDITIONAL_STAGE.packages.length,3);assert.equal(solve(ADDITIONAL_STAGE).status,'solved');
assert.equal(solve(ADDITIONAL_STAGE).minSteps,6);
let practice=startExecution(input(createSession(ADDITIONAL_STAGE,{source:'tutorial',difficulty:'hard'}),[['right',4],['left',1],['right',1]])),deliveries=0,sawFull=false;
while(practice.phase==='executing'){const update=advance(practice);practice=update.session;deliveries+=update.events.filter(e=>e.type==='deliver').length;sawFull||=update.events.some(e=>e.type==='full');}
assert.equal(deliveries,2);assert.equal(sawFull,true);assert.equal(practice.phase,'cleared');
const solvedState={position:8,heldMask:0,deliveredMask:1,usedSteps:4};assert.equal(solve(stage(),solvedState).minSteps,0);
let progress=completeTutorial({},'basic','easy');assert.equal(tutorialNeeded(progress,'hard',1),null);assert.equal(tutorialNeeded(progress,'hard',3),'additional');
progress=completeTutorial(progress,'additional','easy');assert.equal(tutorialNeeded(progress,'hard',3),'additional');
progress=markLevelCleared(progress,createSession(stage(),{source:'normal',difficulty:'hard',level:4,stageIndex:2,phase:'cleared'}));
assert.deepEqual(progress.hard.clearedLevelIds,[4]);assert.equal(highestTitle(progress,'hard').level,4);assert.equal(highestTitle(progress,'easy'),null);
assert.deepEqual(markLevelCleared(progress,createSession(stage(),{source:'custom',difficulty:'easy',level:1,stageIndex:2,phase:'cleared'})),progress);
for(let level=1;level<=4;level++)for(let seed=1;seed<=12;seed++) {
  const board=generate(seed,level,{difficulty:'hard'});assert.deepEqual(generate(seed,level,{difficulty:'hard'}),board);
  assert.equal(validateStage(board).ok,true);const solution=solve(board);assert.equal(solution.minSteps,oracle(board));
  assert.equal(hasMultipleRelevantRoutes(board),level>=2);assert.ok(board.stepLimit>=solution.minSteps);
}
assert.equal(solve(stage({blocked:[3,4,5]})).status,'no-solution');
assert.equal(solve(stage(),undefined,{isCancelled:()=>true}).status,'cancelled');
assert.equal(solve(stage(),undefined,{timeoutMs:0}).status,'timeout');
assert.throws(()=>generate(1,1,{generationAttempts:0}),e=>e.code==='GENERATION_FAILED');
const h=hint(stage(),initialRuntime(stage()));assert.equal(h.status,'solved');assert.equal(h.direction,'right');assert.equal(h.target,2);

class MemoryStorage {data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,v);}removeItem(k){this.data.delete(k);}}
const memory=new MemoryStorage(),a=new DeliveryStorage(memory),b=new DeliveryStorage(memory);
assert.equal(validateSession(createSession(stage())),true);
assert.equal(validateSession(createSession(stage(),{source:'custom'})),false);
assert.equal(validateSession(createSession(stage(),{source:'tutorial'})),false);
assert.equal(validateSession(createSession(stage(),{stageIndex:-1})),false);
assert.equal(validateSession(createSession(stage(),{stageIndex:1.5})),false);
assert.equal(validateSession(createSession(stage(),{level:99})),false);
const validCustom=createSession(stage(),{source:'custom',orderedStageSnapshots:[stage()],stageIndex:0});assert.equal(validateSession(validCustom),true);
assert.equal(validateSession({...validCustom,stageIndex:1}),false);
const validTutorial=createSession(BASIC_STAGE,{source:'tutorial',tutorialType:'basic',pendingStart:{level:1,stageIndex:0,difficulty:'easy'}});assert.equal(validateSession(validTutorial),true);
assert.equal(validateSession({...validTutorial,pendingStart:{level:1,stageIndex:0,difficulty:'unknown'}}),false);
const corruptCheckpoint=createSession(stage());corruptCheckpoint.checkpoint.usedSteps=1;assert.equal(validateSession(corruptCheckpoint),false);
const invalidCursor=createSession(stage());invalidCursor.commandOffset=1;assert.equal(validateSession(invalidCursor),false);
assert.equal(validateSession({...createSession(stage()),phase:'cleared'}),false);
assert.equal(validateSession({...createSession(stage()),sequence:[null]}),false);
assert.equal(a.save('library',{stages:[null]},0).code,'INVALID_SAVE');
assert.equal(a.save('progress',{tutorialCompletion:{basic:'false',additional:{easy:'false'}}},0).code,'INVALID_SAVE');
let result=a.save('session',createSession(stage()),0);assert.equal(result.ok,true);
const saved=a.load('session');assert.equal(saved.value.sessionId,result.value.sessionId);
assert.equal(b.save('session',saved.value,0).code,'STALE_REVISION');
assert.equal(a.endSession(saved.value.sessionId,saved.revision).ok,true);assert.equal(a.load('session').value,null);
assert.equal(b.save('session',saved.value,a.load('session').revision).code,'SESSION_ENDED');
memory.setItem(a.key('progress'),'{"schemaVersion":999,"revision":3,"value":{"legacy":"keep"}}');
assert.equal(a.load('progress').code,'UNKNOWN_VERSION');assert.equal(a.save('progress',{},3).code,'UNKNOWN_VERSION');assert.ok(memory.getItem(a.key('progress')).includes('legacy'));
const failing=new DeliveryStorage({getItem(){return null;},setItem(){throw new Error('quota');}});assert.equal(failing.save('progress',{},0).code,'STORAGE_UNAVAILABLE');
// Worker lifecycle is exercised with an injected Worker factory, without browser dependencies.
let workers=[];class FakeWorker {constructor(){workers.push(this);}postMessage(m){this.message=m;}terminate(){this.terminated=true;}}
const search=new SearchClient({workerFactory:()=>new FakeWorker(),timeoutMs:30});
const pending=search.run('solve',{stage:stage()});search.cancel();assert.equal((await pending).status,'cancelled');assert.equal(workers[0].terminated,true);
const timed=await search.run('solve',{stage:stage()},{timeoutMs:1});assert.equal(timed.status,'timeout');assert.equal(workers[1].terminated,true);
const finished=search.run('solve',{stage:stage()});workers[2].onmessage({data:{id:workers[2].message.id,result:{status:'solved',minSteps:4,path:[]}}});assert.equal((await finished).minSteps,4);search.dispose();
console.log('Delivery core: rule, runtime, oracle, generation, commands, tutorial, progress, storage and Worker tests passed');
