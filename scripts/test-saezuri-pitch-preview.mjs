import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PitchPreview} from '../probe/saezuri/pitch-preview.js';
import {pitchLabel,registerLabel} from '../probe/saezuri/pitch-label.js';
test('pitch preview uses the last requested pitch even when preparation resolves out of order',async()=>{
 const pending=[],started=[],stopped=[];
 const preview=new PitchPreview({prepareVoice:()=>new Promise(resolve=>pending.push(resolve))});
 const first=preview.play(60),second=preview.play(64);
 const start=midi=>{started.push(midi);return ()=>stopped.push(midi);};
 pending[1](start);await second;pending[0](start);await first;
 assert.deepEqual(started,[64]);assert.equal(preview.active,true);
 preview.cancel();assert.deepEqual(stopped,[64]);assert.equal(preview.active,false);
});
test('rest, navigation cancellation and failed preparation leave no sounding voice',async()=>{
 let resolve,started=0,failed=0;
 const preview=new PitchPreview({prepareVoice:()=>new Promise(r=>resolve=r),onError:()=>failed++});
 const request=preview.play(60);await preview.play(null);resolve(()=>{started++;});await request;
 assert.equal(started,0);assert.equal(preview.active,false);
 preview.prepareVoice=async()=>{throw new Error('unavailable');};await preview.play(62);
 assert.equal(failed,1);assert.equal(preview.active,false);
});
test('selection labels identify solfege and register instead of English pitch notation',()=>{
 assert.equal(pitchLabel(61),'ド♯');assert.equal(registerLabel(64),'ふつうのミ');
 assert.equal(registerLabel(72),'うえのド');assert.equal(registerLabel(57),'したのラ');
 assert.equal(registerLabel(null),'休み');
});
