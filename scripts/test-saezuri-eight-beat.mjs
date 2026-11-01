import test from 'node:test';
import assert from 'node:assert/strict';
import {accompanimentEvents,validateAccompaniment} from '../saezuri/music/accompaniment.js';
import {blankPattern} from '../probe/saezuri/entry-session.js';
const genres=['nursery','pop','rock','ballad'],rhythms=['eight-basic','eight-light','eight-motion'];
test('twelve type-specific straight eight-beat sets have chord, bass, kick, snare and eight hats per bar',()=>{
 for(const genre of genres)for(const rhythm of rhythms)for(const bars of [1,2,4,8]){
  const p={...blankPattern(),bars,accompaniment:{enabled:true,genre,rhythm,progression:'home',drumPattern:'auto'}};
  assert.equal(validateAccompaniment(p.accompaniment,bars),null,genre+'/'+rhythm);const before=JSON.stringify(p),events=accompanimentEvents(p);assert.ok(events.some(e=>e.part==='chord'));assert.ok(events.some(e=>e.part==='bass'));
  assert.equal(events.filter(e=>e.instrument.endsWith('hat')).length,bars*8);assert.deepEqual(events.filter(e=>e.instrument.endsWith('snare')).map(e=>e.startTick),Array.from({length:bars},(_,i)=>[i*16+4,i*16+12]).flat());assert.ok(events.some(e=>e.instrument.endsWith('kick')));assert.ok(events.every(e=>Number.isInteger(e.startTick)&&e.startTick>=0&&e.startTick+e.durationTick<=bars*16&&e.durationTick>0&&Number.isFinite(e.gain)&&e.gain>0&&e.gain<=.2));assert.equal(JSON.stringify(p),before);
 }
});
test('each type has three audibly distinct event recipes',()=>{for(const genre of genres){const events=rhythms.map(rhythm=>JSON.stringify(accompanimentEvents({...blankPattern(),accompaniment:{enabled:true,genre,rhythm,progression:'home'}})));assert.equal(new Set(events).size,3,genre);}});

import {applyEightBeatSet} from '../saezuri/music/eight-beat.js';
import {harmonicSegments,accompanimentSounds} from '../saezuri/music/accompaniment.js';
import {generateImageAccompaniment} from '../saezuri/music/image-arrangement.js';
import {setChordAtBeat} from '../saezuri/music/chord-timing.js';
test('set selection preserves actual image harmony, timed blanks, slash bass, notes and explicit sounds',()=>{
 let p={...blankPattern('Am'),notes:[{id:'n',midi:72,startTick:0,durationTick:4}]};p.accompaniment=generateImageAccompaniment(p,{type:'rock',speed:'slow',mood:'sad'});p.accompaniment=setChordAtBeat(p,0,1,{root:7,bass:11,quality:'major'});p.accompaniment=setChordAtBeat(p,0,2,{rest:true});p.accompaniment=setChordAtBeat(p,0,3,{root:9,bass:9,quality:'minor'});p.accompaniment.sounds={chord:'strings',bass:'brass',drums:'none'};const before=JSON.stringify(p),harmony=harmonicSegments(p);
 for(const genre of genres)for(const rhythm of rhythms){const q=applyEightBeatSet(p,genre,rhythm);assert.deepEqual(harmonicSegments(q),harmony);assert.deepEqual(q.notes,p.notes);assert.deepEqual(q.key,p.key);assert.equal(q.bars,p.bars);assert.equal(validateAccompaniment(q.accompaniment,q.bars),null);assert.equal(accompanimentSounds(q.accompaniment).chord,'strings');assert.equal(accompanimentSounds(q.accompaniment).bass,'brass');assert.notEqual(accompanimentSounds(q.accompaniment).drums,'none');assert.deepEqual(JSON.parse(JSON.stringify(q)),q);
 const events=accompanimentEvents(q);assert.equal(events.filter(e=>e.instrument.endsWith('hat')).length,q.bars*8);assert.ok(events.some(e=>e.part==='bass'&&e.startTick===4&&e.midi===47));assert.ok(events.every(e=>e.part==='drums'||e.startTick>=12||e.startTick+e.durationTick<=8));assert.equal(events.filter(e=>e.part==='drums'&&e.startTick===8).length,2);
 const rebuilt=generateImageAccompaniment(q,{type:genre,speed:'fast',mood:'bright'});assert.equal(validateAccompaniment(rebuilt,q.bars),null);assert.equal(rebuilt.rhythm,rhythm);assert.deepEqual(rebuilt.chords,q.accompaniment.chords);
 }assert.equal(JSON.stringify(p),before);
});
test('per-beat changes do not reset the eighth grid, and drum overrides still apply',()=>{for(const genre of genres)for(const rhythm of rhythms){let p=applyEightBeatSet({...blankPattern(),bars:1},genre,rhythm);for(let beat=0;beat<4;beat++)p.accompaniment=setChordAtBeat(p,0,beat,{root:beat,bass:beat,quality:'minor'});const events=accompanimentEvents(p);assert.deepEqual(events.filter(e=>e.instrument.endsWith('hat')).map(e=>e.startTick),[0,2,4,6,8,10,12,14]);for(let beat=0;beat<4;beat++){assert.ok(events.some(e=>e.part==='bass'&&e.startTick===beat*4));assert.ok(events.every(e=>e.part==='drums'||Math.floor(e.startTick/4)===Math.floor((e.startTick+e.durationTick-1)/4)));}p.accompaniment.drumPattern='none';assert.ok(accompanimentEvents(p).every(e=>e.part!=='drums'));p.accompaniment.drumPattern='hat-half-off';p.accompaniment.drumAccent='beat-4';assert.deepEqual(accompanimentEvents(p).filter(e=>e.part==='drums').map(e=>e.startTick),[4,12]);}});

import {createHash} from 'node:crypto';
test('existing 192 stored backing recipes keep their pre-addition event bytes',()=>{const results=[];for(const genre of genres)for(const rhythm of ['quarters','offbeat','arpeggio','tutorial','whole','halves'])for(const bars of [1,2,4,8])for(const image of [false,true]){const p={...blankPattern(),bars,accompaniment:{enabled:true,genre,rhythm,progression:'home'}};if(image){p.accompaniment=generateImageAccompaniment(p,{type:genre,speed:'normal',mood:'bright'});p.accompaniment.rhythm=rhythm;}results.push(JSON.stringify(accompanimentEvents(p)));}assert.equal(createHash('sha256').update(results.join('\n')).digest('hex'),'0e9c66cf1db3f58e926e01bcea9ce90b89610772072c4c176fea0ebae3237240');});
