import test from 'node:test';
import assert from 'node:assert/strict';
import * as backing from '../saezuri/music/accompaniment.js';
import {generateImageAccompaniment} from '../saezuri/music/image-arrangement.js';
import {blankPattern} from '../probe/saezuri/entry-session.js';

test('one-chord audition plays the whole selected slash chord together without melody or drums',()=>{
 const pattern={...blankPattern(),notes:[{id:'n',midi:76,startTick:0,durationTick:4}]};
 pattern.accompaniment=generateImageAccompaniment(pattern,{type:'nursery',speed:'normal',mood:'gentle'});
 const before=structuredClone(pattern),chord={root:11,quality:'m7♭5',bass:1,startTick:32,durationTick:16,manual:true};
 assert.equal(typeof backing.chordAuditionEvents,'function');
 const events=backing.chordAuditionEvents(pattern,chord);
 assert.equal(events.length,5);
 assert.deepEqual(events.filter(e=>e.part==='chord').map(e=>e.midi%12).sort((a,b)=>a-b),[2,5,9,11]);
 assert.deepEqual(events.filter(e=>e.part==='bass').map(e=>e.midi),[37]);
 assert.ok(events.every(e=>e.startTick===0&&e.durationTick===8&&e.velocity===55));
 assert.ok(events.filter(e=>e.part==='chord').every(e=>e.instrument==='piano'));
 assert.deepEqual(pattern,before,'audition never pins or commits a chord');
});

test('one-chord audition respects an explicit sound and works while accompaniment is off',()=>{
 const pattern={...blankPattern(),accompaniment:{enabled:false,genre:'rock',rhythm:'offbeat',progression:'pop',sounds:{chord:'wood',bass:'sine'}}};
 const before=structuredClone(pattern),events=backing.chordAuditionEvents(pattern,{root:2,quality:'minor',bass:2});
 assert.equal(events.length,4);
 assert.ok(events.filter(e=>e.part==='chord').every(e=>e.instrument==='wood'));
 assert.equal(events.find(e=>e.part==='bass').instrument,'sine');
 assert.deepEqual(pattern,before);
 assert.deepEqual(backing.chordAuditionEvents(pattern,{root:99,quality:'minor',bass:2}),[]);
});
