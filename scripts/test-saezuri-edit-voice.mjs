import test from 'node:test';
import assert from 'node:assert/strict';
import {EditVoice,parseEditCommand,EDIT_WORDS} from '../probe/saezuri/edit-voice.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('confirmation grammar includes the shipped model katakana tokens',()=>{
 for(const word of ['オッケー','オーケー']) {
  assert.ok(EDIT_WORDS.includes(word)); assert.equal(parseEditCommand(word),'confirm');
 }
});
function fixture(pending=false) {
 let resolve; const events=new Map(), commands=[], status=[];
 const input={stops:0,disposed:0,on(k,f){events.set(k,f);},off(k,f){if(events.get(k)===f) events.delete(k);},
 start(){return pending?new Promise(r=>resolve=r):Promise.resolve();},stop(){this.stops++;},dispose(){this.disposed++;}};
 const controller=new EditVoice({createInput:()=>input,onCommand:c=>commands.push(c),onStatus:s=>status.push(s)});
 return {controller,input,events,commands,status,finish:()=>resolve()};
}
test('exact synonyms and semitone prefix accept kana/kanji but not unrelated sentences',()=>{
 for(const text of ['たかく','アゲル','上げる','半音 高く']) assert.equal(parseEditCommand(text),'up');
 for(const text of ['低く','さげる','はんおんさげる']) assert.equal(parseEditCommand(text),'down');
 assert.equal(parseEditCommand('オッケー'),'confirm'); assert.equal(parseEditCommand('高くない'),null);
 assert.equal(parseEditCommand('音を上げるかも'),null);
});
test('commands are accepted only in active interval; stale callback is ignored after pause',async()=>{
 const f=fixture();f.controller.setActive(true);await flush();
 const stale=f.events.get('result');stale('あげる');assert.deepEqual(f.commands,['up']);
 f.controller.setActive(false);stale('オッケー');assert.deepEqual(f.commands,['up']);
 assert.equal(f.input.disposed,0);f.controller.setActive(true);await flush();
 f.events.get('result')('さげる');assert.deepEqual(f.commands,['up','down']);
 f.controller.setActive(false,{release:true});assert.equal(f.input.disposed,1);
});
test('cancel during model load disposes late microphone startup and ignores resolution',async()=>{
 const f=fixture(true);f.controller.setActive(true);await flush();const stale=f.events.get('result');
 f.controller.setActive(false);assert.equal(f.input.disposed,1);f.finish();await flush();stale('あげる');
 assert.deepEqual(f.commands,[]);assert.equal(f.status.includes('listening'),false);
});
test('unexpected end resumes only if the editing interval remains open',async()=>{
 const f=fixture();f.controller.setActive(true);await flush();
 f.events.get('end')();await flush();assert.equal(f.status.at(-1),'listening');
 f.events.get('end')();f.controller.setActive(false,{release:true});await flush();
 assert.equal(f.controller.active,false);assert.equal(f.controller.input,null);
});

test('switching input vocabulary drops stale results and applies the new parser only after restart',async()=>{
 const f=fixture();f.controller.setActive(true);await flush();const stale=f.events.get('result');
 const words=['ド 一'];f.controller.configure(words,text=>text==='ド 一'?{type:'note',midi:60,durationTick:4}:null);
 stale('オッケー');assert.deepEqual(f.commands,[]);assert.equal(f.input.disposed,1);
 f.controller.setActive(true);await flush();f.events.get('result')('ド 一');
 assert.deepEqual(f.commands,[{type:'note',midi:60,durationTick:4}]);
 f.controller.setActive(false,{release:true});
});
