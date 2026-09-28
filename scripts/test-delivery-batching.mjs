import assert from 'node:assert/strict';
import { createSession, editSequence, startExecution, advance, retry, resumeSession } from '../delivery/run.js';
import { validateSession } from '../delivery/storage.js';
import { ADDITIONAL_STAGE } from '../delivery/tutorial.js';
const input=(s,rows)=>rows.reduce((s,[direction,count])=>editSequence(s,{type:'move',direction,count}),s);
const finish=s=>{s=startExecution(s);for(let i=0;i<100&&s.phase==='executing';i++)s=advance(s).session;return s};
const roundTrip=s=>{const copy=JSON.parse(JSON.stringify(s));assert.equal(validateSession(copy),true);return copy};
for(const difficulty of ['easy','hard']){
  let s=finish(input(createSession(ADDITIONAL_STAGE,{difficulty}),[['right',4]]));
  assert.equal(s.phase,'editing');assert.equal(s.runtime.deliveredMask,3);assert.equal(s.runtime.usedSteps,4);assert.deepEqual(s.sequence,[]);
  s=finish(input(roundTrip(s),[['left',1],['right',1]]));assert.equal(s.phase,'cleared');assert.equal(s.runtime.usedSteps,6);
  s=finish(input(createSession(ADDITIONAL_STAGE,{difficulty}),[['right',4],['left',1],['right',1]]));assert.equal(s.phase,'cleared');assert.equal(s.runtime.usedSteps,6);
  s=finish(input(createSession(ADDITIONAL_STAGE,{difficulty}),[['right',4],['left',2]]));assert.equal(s.phase,'failed');assert.equal(s.failureCode,'SEQUENCE_EXHAUSTED');
  const again=retry(roundTrip(s));assert.equal(again.runtime.usedSteps,difficulty==='easy'?4:0);assert.deepEqual(again.sequence,difficulty==='easy'?[{direction:'left',count:2}]:[]);
  s=finish(input(createSession({...ADDITIONAL_STAGE,stepLimit:4},{difficulty}),[['right',4]]));assert.equal(s.failureCode,'STEP_LIMIT');
  // The delivery cell is in the middle of one command, not just between rows.
  const through={id:'through',revision:1,size:5,blocked:[],start:0,destination:2,packages:[{id:'a',cell:1},{id:'b',cell:3},{id:'c',cell:4}],stepLimit:20};
  s=startExecution(input(createSession(through,{difficulty}),[['right',4],['left',2]]));s=advance(s).session;s=advance(s).session;
  assert.equal(s.phase,'executing');assert.equal(s.commandOffset,2);assert.equal(s.runtime.deliveredMask,1);
  if(difficulty==='easy')assert.deepEqual(s.checkpointSequence,[{direction:'right',count:2},{direction:'left',count:2}]);
  s=finish(resumeSession(roundTrip(s)));assert.equal(s.phase,'cleared');assert.equal(s.runtime.usedSteps,6);
  // Returning empty-handed to the destination is not a new delivery stop.
  const emptyReturn={...through,packages:[{id:'a',cell:1},{id:'b',cell:20}]};
  s=finish(input(createSession(emptyReturn,{difficulty}),[['right',3],['left',1]]));assert.equal(s.phase,'failed');assert.equal(s.failureCode,'SEQUENCE_EXHAUSTED');
  // Retry retains only the suffix after a delivery inside a command.
  const blocked={...through,blocked:[4],packages:[{id:'a',cell:1},{id:'b',cell:3},{id:'c',cell:20}]};
  s=finish(input(createSession(blocked,{difficulty}),[['right',4],['left',2]]));assert.equal(s.failureCode,'BLOCKED');
  const recovered=retry(roundTrip(s));assert.equal(recovered.runtime.position,difficulty==='easy'?2:0);assert.equal(recovered.runtime.heldMask,0);
  assert.deepEqual(recovered.sequence,difficulty==='easy'?[{direction:'right',count:2},{direction:'left',count:2}]:[]);
  if(difficulty==='easy'){
    let edited=editSequence(recovered,{type:'select',index:0});edited=editSequence(edited,{type:'move',direction:'right',count:1});
    const failedAgain=finish(edited);assert.deepEqual(retry(failedAgain).sequence,[{direction:'left',count:1}]);
  }
}
const legacy=finish(input(createSession(ADDITIONAL_STAGE),[['right',4]]));delete legacy.checkpointSequence;
let legacyFailure=finish(input(roundTrip(legacy),[['right',1]]));assert.deepEqual(retry(legacyFailure).sequence,[{direction:'right',count:1}]);
assert.equal(validateSession({...legacy,checkpointSequence:[{direction:'right',count:0}]}),false);
console.log('Both modes: split/batch, delivery inside a command, incomplete/empty return failures, step limit, checkpoint suffix and saved/resumed retry passed');
