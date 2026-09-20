import assert from 'node:assert/strict';
import {test} from 'node:test';
import {scoreFor, scoreDuration, SoundPlayer} from '../jintori/sound.js';

test('different actions have distinct percussive, airy and melodic sounds within a bounded input pause',()=>{
 const scores=['dice','basic','enhanced','strongest','win','loss','draw','invalid','pass'].map(event=>scoreFor(event,{flipped:6}));
 assert.equal(new Set(scores.map(s=>JSON.stringify(s))).size,scores.length);
 for(const score of scores){assert.ok(score.length);assert.ok(scoreDuration(score)>0&&scoreDuration(score)<1700);}
 assert.ok(scoreFor('basic').some(n=>n.type==='noise'));
 assert.ok(scoreFor('strongest').some(n=>n.type==='noise'&&n.duration>.1));
 assert.ok(scoreFor('win').filter(n=>n.frequency).length>=4);
});
test('flip sequence follows capture count but cannot grow without bound',()=>{
 assert.ok(scoreFor('basic',{flipped:1}).length<scoreFor('basic',{flipped:5}).length);
 assert.deepEqual(scoreFor('basic',{flipped:6}),scoreFor('basic',{flipped:64}));
});
test('no audio support still yields the correct pause and cancellation is safe',()=>{
 const player=new SoundPlayer({contextFactory:()=>null});
 assert.equal(player.play('win'),scoreDuration(scoreFor('win')));
 player.stopAll();player.primeAudio();
});

test('dice ticks slow down in pitch and stay quieter during stop-word listening',()=>{
 const fast=scoreFor('diceTick',{interval:55}),slow=scoreFor('diceTick',{interval:420});
 assert.ok(fast[0].frequency>slow[0].frequency);
 assert.ok(scoreDuration(fast)<=55);
 assert.ok(scoreFor('diceTick',{interval:120,stopping:true})[0].gain>scoreFor('diceTick',{interval:120})[0].gain);
});
