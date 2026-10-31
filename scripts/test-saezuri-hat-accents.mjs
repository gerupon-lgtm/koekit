import test from 'node:test';
import assert from 'node:assert/strict';
import {accompanimentEvents,validateAccompaniment} from '../saezuri/music/accompaniment.js';
import {blankPattern} from '../probe/saezuri/entry-session.js';
export const accentCases=[
 ['hat-half-front',[0,8],[0]],['hat-half-back',[0,8],[8]],
 ['hat-backbeat-front',[4,12],[4]],['hat-backbeat-back',[4,12],[12]],
 ['hat-quarters-first',[0,4,8,12],[0]],['hat-quarters-third',[0,4,8,12],[8]],
 ['hat-quarters-front',[0,4,8,12],[0,8]],['hat-quarters-back',[0,4,8,12],[4,12]],
];
test('all selected hat accents have clear contrast and stay on their bar positions across chord changes',()=>{
 for(const [drumPattern,ticks,strong] of accentCases)for(const bars of [1,2,4,8])for(const genre of ['nursery','pop','ballad','rock'])for(const rhythm of ['whole','halves','quarters','offbeat','arpeggio','tutorial'])for(const drums of ['acoustic','electronic']){
  const p={...blankPattern(),bars,accompaniment:{enabled:true,genre,rhythm,progression:'home',drumPattern,sounds:{drums},chords:[{root:2,bass:2,quality:'minor',startTick:4,durationTick:8}]}};
  assert.equal(validateAccompaniment(p.accompaniment,bars),null);
  const hats=accompanimentEvents(p).filter(e=>e.part==='drums');assert.deepEqual(hats.map(e=>e.startTick),Array.from({length:bars},(_,bar)=>ticks.map(t=>bar*16+t)).flat());
  assert.ok(hats.every(e=>e.instrument===(drums==='electronic'?'electro-hat':'hat')&&e.midi===42));
  const loud=hats.filter(e=>strong.includes(e.startTick%16)),soft=hats.filter(e=>!strong.includes(e.startTick%16));assert.equal(loud.length,bars*strong.length);assert.equal(soft.length,bars*(ticks.length-strong.length));
  assert.ok(Math.min(...loud.map(e=>e.gain))/Math.max(...soft.map(e=>e.gain))>=6,'every accented pattern has at least sixfold gain contrast');
 }
});
