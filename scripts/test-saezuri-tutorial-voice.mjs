import test from 'node:test';
import assert from 'node:assert/strict';
import {MelodyLearning} from '../probe/saezuri/learning.js';
const harness=(stage=3)=>{const calls=[],lesson=Object.assign(Object.create(MelodyLearning.prototype),{active:true,stage,shell:{screen:'create',busy:false},preview:{openNow:true,replay(){calls.push('replay-visible');},close(){calls.push('close');this.openNow=false;}},audition(model=false){calls.push(model?'model':'current');}});return {lesson,calls};};
test('explicit model opens a fresh model; listen in an open audition repeats its visible target',()=>{
 const {lesson,calls}=harness();lesson.handleVoice({type:'tutorial',action:'model'});assert.deepEqual(calls,['close','model']);
 calls.length=0;lesson.preview.openNow=true;lesson.handleVoice('preview');assert.deepEqual(calls,['replay-visible']);
});
test('listen during the introduction replays the model rather than an empty work',()=>{
 const {lesson,calls}=harness(0);lesson.preview.openNow=false;lesson.handleVoice('preview');assert.deepEqual(calls,['close','model']);
});
test('backing voice closes the old audition before staging a new candidate',()=>{
 const old=globalThis.document,{lesson,calls}=harness(7);globalThis.document={getElementById:id=>({click:()=>calls.push(id==='learning-backing'?'backing':'other')})};
 try{lesson.handleVoice({type:'tutorial',action:'backing'});assert.deepEqual(calls,['close','backing']);}finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});

test('repeat synonyms use the same visible audition during playback',()=>{const {lesson,calls}=harness();lesson.shell.busy=true;lesson.handleVoice({type:'tutorial',action:'replay'});assert.deepEqual(calls,['replay-visible']);});
