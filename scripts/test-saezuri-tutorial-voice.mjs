import test from 'node:test';
import assert from 'node:assert/strict';
import {MelodyLearning} from '../probe/saezuri/learning.js';
const harness=(stage=3)=>{const calls=[],lesson=Object.assign(Object.create(MelodyLearning.prototype),{active:true,stage,shell:{screen:'create',busy:false},preview:{openNow:true,play(){calls.push('replay-stale');},close(){calls.push('close');this.openNow=false;}},audition(model=false){calls.push(model?'model':'current');}});return {lesson,calls};};
test('model and current voice auditions choose the requested snapshot even with a modal open',()=>{
 const {lesson,calls}=harness();lesson.handleVoice({type:'tutorial',action:'model'});assert.deepEqual(calls,['close','model']);
 calls.length=0;lesson.preview.openNow=true;lesson.handleVoice('preview');assert.deepEqual(calls,['close','current']);
});
test('listen during the introduction replays the model rather than an empty work',()=>{
 const {lesson,calls}=harness(0);lesson.handleVoice('preview');assert.deepEqual(calls,['close','model']);
});
test('backing voice closes the old audition before staging a new candidate',()=>{
 const old=globalThis.document,{lesson,calls}=harness(7);globalThis.document={getElementById:id=>({click:()=>calls.push(id==='learning-backing'?'backing':'other')})};
 try{lesson.handleVoice({type:'tutorial',action:'backing'});assert.deepEqual(calls,['close','backing']);}finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
