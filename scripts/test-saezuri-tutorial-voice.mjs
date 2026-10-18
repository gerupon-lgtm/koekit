import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialPattern} from '../probe/saezuri/tutorial-data.js';
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

test('explicit next advances once and immediately auditions the model, while busy/incomplete stages stay put',()=>{
 const oldDocument=globalThis.document,oldWindow=globalThis.window,calls=[];
 globalThis.document={getElementById:()=>({value:'1'})};globalThis.window={scrollTo:()=>{}};
 const lesson=Object.assign(Object.create(MelodyLearning.prototype),{active:true,stage:0,currentGuide:()=>({done:true}),preview:{close:()=>calls.push('close')},shell:{busy:false,phase:'idle',editor:{moveCursor:tick=>calls.push(['cursor',tick])},setMode:mode=>calls.push(mode)},sync:()=>{},audition:model=>calls.push(['audition',model])});
 try{
  lesson.next();assert.equal(lesson.stage,1);assert.deepEqual(calls,['close',['cursor',0],'input',['audition',true]]);
  calls.length=0;lesson.shell.busy=true;lesson.next();assert.deepEqual(calls,[]);assert.equal(lesson.stage,1);
  lesson.shell.busy=false;lesson.currentGuide=()=>({done:false});lesson.next();assert.deepEqual(calls,[]);assert.equal(lesson.stage,1);
 }finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});

test('each model describes the new stage and the final model has backing without changing the work',()=>{
 for(let stage=1;stage<=7;stage++){
  const original=tutorialPattern(),before=structuredClone(original);let data,options,plays=0;
  const lesson=Object.assign(Object.create(MelodyLearning.prototype),{active:true,stage,display:'cards',shell:{busy:false,editor:{previewPattern:original}},preview:{setDisplay(){},open(value,settings){data=value;options=settings;},play(){plays++;}}});
  lesson.audition(true);assert.equal(plays,1);assert.ok(data.notes.length);assert.match(options.title,/おてほん/);assert.deepEqual(original,before);
  assert.equal(data.accompaniment.length>0,stage===7);
  if(stage===7)assert.match(options.title,/伴奏つき/);
 }
});
