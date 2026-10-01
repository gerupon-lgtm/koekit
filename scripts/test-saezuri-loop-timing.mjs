import test from 'node:test';import assert from 'node:assert/strict';
const timing=await import('../probe/saezuri/loop-timing.js').catch(()=>({}));
test('reservation takes the immediately next head even within the final beat',()=>{
 assert.equal(typeof timing.nextLoopHead,'function');
 assert.equal(timing.nextLoopHead({anchor:1,now:8.99,tempo:120,bars:4}),9);
 assert.equal(timing.nextLoopHead({anchor:1,now:9,tempo:120,bars:4}),17);
 assert.equal(timing.nextLoopHead({anchor:1,now:.5,tempo:120,bars:4}),1);
});
test('eight bars capture exactly the phrase on the shared clock, keeping correction explicit',()=>{
 assert.equal(typeof timing.loopCaptureTiming,'function');
 const plan=timing.loopCaptureTiming({musicalStart:17,tempo:120,bars:8,sampleRate:48000,baseLatency:.01,outputLatency:.02,inputLatency:.01,manualMs:-10});
 assert.equal(plan.startFrame,817440);assert.equal(plan.endFrame-plan.startFrame,768000);
 assert.equal(plan.countTimes.length,0);assert.equal(plan.musicalStart,17);
});
