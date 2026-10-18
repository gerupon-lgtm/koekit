import test from 'node:test';import assert from 'node:assert/strict';
import {restParts} from '../probe/saezuri/rest-symbol.js';

test('rest notation covers the same time without crossing beat or measure boundaries',()=>{
 for(let start=0;start<32;start++)for(let duration=0;duration<=64-start;duration++){
  const parts=restParts(start,duration);let cursor=start;
  for(const part of parts){assert.equal(part.startTick,cursor);assert.ok([16,8,4,2,1].includes(part.durationTick));assert.equal(part.startTick%part.durationTick,0);assert.equal(Math.floor(part.startTick/16),Math.floor((part.startTick+part.durationTick-1)/16));cursor+=part.durationTick;}
  assert.equal(cursor,start+duration);
 }
 assert.deepEqual(restParts(36,2),[{startTick:36,durationTick:2}]);
 assert.deepEqual(restParts(2,14),[{startTick:2,durationTick:2},{startTick:4,durationTick:4},{startTick:8,durationTick:8}]);
});
test('invalid rest positions fail before drawing',()=>{
 for(const [start,duration] of [[-1,2],[0,-1],[.5,2],[0,1.5],[NaN,2],[0,Infinity]])assert.throws(()=>restParts(start,duration),/REST_TIME/);
});
