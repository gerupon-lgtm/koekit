import test from 'node:test';
import assert from 'node:assert/strict';
import {accompanimentEvents,validateAccompaniment} from '../saezuri/music/accompaniment.js';
import {generateImageAccompaniment} from '../saezuri/music/image-arrangement.js';
import {blankPattern} from '../probe/saezuri/entry-session.js';
test('backbeat hats play only beats 2 and 4 in every length, genre, rhythm and drum sound',()=>{
 for(const bars of [1,2,4,8])for(const genre of ['nursery','pop','ballad','rock'])for(const rhythm of ['whole','halves','quarters','offbeat','arpeggio','tutorial'])for(const drums of ['acoustic','electronic']){
  const p={...blankPattern(),bars,accompaniment:{enabled:true,genre,rhythm,progression:'home',drumPattern:'hat-backbeat',sounds:{drums},chords:[{root:2,bass:2,quality:'minor',startTick:4,durationTick:8}]}},before=JSON.stringify(p);
  assert.equal(validateAccompaniment(p.accompaniment,bars),null);const events=accompanimentEvents(p),hats=events.filter(e=>e.part==='drums');
  assert.deepEqual(hats.map(e=>e.startTick),Array.from({length:bars*2},(_,i)=>Math.floor(i/2)*16+(i%2?12:4)));
  assert.ok(hats.every(e=>e.instrument===(drums==='electronic'?'electro-hat':'hat')&&e.midi===42&&e.gain===.02));
  assert.ok(events.some(e=>e.part==='chord'));assert.equal(JSON.stringify(p),before);
 }
});
test('backbeat selection survives image regeneration and reload, resets explicitly and honors muted drums',()=>{
 const p=blankPattern();p.accompaniment=generateImageAccompaniment(p);p.accompaniment.drumPattern='hat-backbeat';
 p.accompaniment=generateImageAccompaniment(p);const saved=JSON.parse(JSON.stringify(p));assert.equal(saved.accompaniment.drumPattern,'hat-backbeat');assert.equal(accompanimentEvents(saved).filter(e=>e.part==='drums').length,8);
 saved.accompaniment.sounds={drums:'none'};assert.ok(accompanimentEvents(saved).every(e=>e.part!=='drums'));
 assert.equal(generateImageAccompaniment(saved,undefined,{resetManual:true}).drumPattern,undefined);
});
