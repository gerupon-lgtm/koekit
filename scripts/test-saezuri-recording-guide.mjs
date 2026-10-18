import test from 'node:test';import assert from 'node:assert/strict';
import {recordingPosition} from '../probe/saezuri/recording-guide.js';

test('standby follows the backing through the last beat and starts recording at the exact next head',()=>{
 const plan={bars:4,tempo:120,anchor:1,loop:true,kind:'tap',recordAnchor:9};
 assert.deepEqual(recordingPosition({...plan,now:8.99}),{mode:'tap-wait',tick:63.92,remaining:1,bar:3,beat:3});
 assert.deepEqual(recordingPosition({...plan,now:9}),{mode:'tap',tick:0,remaining:0,bar:0,beat:0});
 assert.equal(recordingPosition({...plan,now:17}).bar,0,'tap takes repeat from bar one');
});
test('eight bars keep their actual bar and beat; humming ends on the final bar instead of wrapping',()=>{
 const plan={bars:8,tempo:120,anchor:1,loop:true};
 assert.equal(recordingPosition({...plan,now:9}).bar,4);
 assert.deepEqual(recordingPosition({...plan,now:17}),{mode:'loop',tick:0,remaining:0,bar:0,beat:0});
 const end=recordingPosition({...plan,kind:'hum',recordAnchor:1,now:17});
 assert.equal(end.bar,7);assert.equal(end.beat,3);assert.equal(end.mode,'hum');
 const waiting=recordingPosition({...plan,kind:'hum',recordAnchor:33,now:19});
 assert.equal(waiting.mode,'hum-wait');assert.equal(waiting.bar,1,'humming standby follows the backing even after several cycles');assert.equal(waiting.beat,0);assert.equal(waiting.remaining,28);
});
test('initial lead and stopped/analyzing states do not falsely highlight the first bar',()=>{
 const plan={bars:4,tempo:120};
 assert.deepEqual(recordingPosition({...plan,anchor:1,loop:true,now:.4}),{mode:'count',tick:null,remaining:2,bar:null,beat:null});
 assert.equal(recordingPosition({...plan,now:1,phase:'idle'}).bar,null);
 assert.equal(recordingPosition({...plan,now:1,phase:'analyzing'}).mode,'analyzing');
});
