import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as backing from '../saezuri/music/accompaniment.js';
import {generateImageAccompaniment,IMAGE_SPEEDS,IMAGE_MOODS,imagePatternCount} from '../saezuri/music/image-arrangement.js';
import {blankPattern} from '../probe/saezuri/entry-session.js';

test('nursery preset uses the chosen electric piano and restrained chord/bass dynamics',()=>{
 const pattern={...blankPattern(),accompaniment:{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'}};
 const before=structuredClone(pattern),events=backing.accompanimentEvents(pattern);
 assert.equal(backing.SOUND_PRESETS.nursery.chord,'piano');
 assert.ok(events.some(e=>e.part==='chord'));
 for(const event of events){
  if(event.part==='chord'){assert.equal(event.instrument,'piano');assert.equal(event.gain,.045*.65);assert.equal(event.velocity,55);}
  if(event.part==='bass'){assert.equal(event.gain,.075*.8);assert.equal(event.velocity,55);}
  if(event.part==='drums'){assert.equal(event.gain,.025);assert.equal(event.velocity,undefined);}
 }
 assert.deepEqual(pattern,before);
});

test('all nursery image choices keep the selected piano through regeneration and JSON reload',()=>{
 let checked=0;
 for(const key of ['C','Am'])for(const bars of [4,8])for(const [speed] of IMAGE_SPEEDS)for(const [mood] of IMAGE_MOODS){
  const pattern={...blankPattern(key),bars};
  for(let i=0;i<imagePatternCount('nursery');i++){
   pattern.accompaniment=generateImageAccompaniment(pattern,{type:'nursery',speed,mood});
   assert.equal(pattern.accompaniment.imageArrangement.sounds.chord,'piano');
   const saved=JSON.stringify(pattern),events=backing.accompanimentEvents(pattern);
   assert.ok(events.filter(e=>e.part==='chord').every(e=>e.instrument==='piano'&&e.velocity===55));
   assert.deepEqual(backing.accompanimentEvents(JSON.parse(saved)),events);
   assert.equal(JSON.stringify(pattern),saved);
   checked++;
  }
 }
 assert.equal(checked,384);
});

test('legacy generated bell recipes sound and display piano without rewriting their stored settings',()=>{
 const pattern=blankPattern();
 pattern.accompaniment=generateImageAccompaniment(pattern,{type:'nursery',speed:'normal',mood:'bright'});
 pattern.accompaniment.imageArrangement.sounds.chord='wood';
 const before=structuredClone(pattern);
 assert.equal(typeof backing.accompanimentSounds,'function');
 assert.equal(backing.accompanimentSounds(pattern.accompaniment).chord,'piano');
 assert.ok(backing.accompanimentEvents(pattern).filter(e=>e.part==='chord').every(e=>e.instrument==='piano'));
 pattern.accompaniment.sounds={bass:'sine'};
 assert.equal(backing.accompanimentSounds(pattern.accompaniment).chord,'piano','a bass-only override does not pin the old automatic chord sound');
 delete pattern.accompaniment.sounds;
 assert.deepEqual(pattern,before);
});

test('explicit chord sounds including bell remain selected after saving or regeneration',()=>{
 for(const instrument of ['wood','fm-piano','strings','brass','sine']){
  const pattern=blankPattern();
  pattern.accompaniment=generateImageAccompaniment(pattern,{type:'nursery',speed:'normal',mood:'bright'});
  pattern.accompaniment.imageArrangement.sounds.chord='wood';
  pattern.accompaniment.sounds={chord:instrument};
  for(let i=0;i<2;i++){
   const restored=JSON.parse(JSON.stringify(pattern));
   assert.equal(backing.accompanimentSounds(restored.accompaniment).chord,instrument);
   assert.ok(backing.accompanimentEvents(restored).filter(e=>e.part==='chord').every(e=>e.instrument===instrument));
   pattern.accompaniment=generateImageAccompaniment(pattern,{type:'nursery',speed:'normal',mood:'bright'});
  }
 }
});

test('the other three genres retain exactly the published pitches, timings, instruments and levels',()=>{
 const hash=createHash('sha256');let cases=0;
 for(const genre of ['pop','rock','ballad'])for(const key of ['C','Am'])for(const bars of [4,8]){
  for(const progression of backing.PROGRESSIONS[key])for(const rhythm of backing.RHYTHMS){
   const pattern={...blankPattern(key),bars,accompaniment:{enabled:true,genre,rhythm:rhythm.id,progression:progression.id}};
   hash.update(JSON.stringify(backing.accompanimentEvents(pattern)));cases++;
  }
  for(const [speed] of IMAGE_SPEEDS)for(const [mood] of IMAGE_MOODS){
   const pattern={...blankPattern(key),bars};
   for(let i=0;i<imagePatternCount(genre);i++){
    pattern.accompaniment=generateImageAccompaniment(pattern,{type:genre,speed,mood});
    hash.update(JSON.stringify(backing.accompanimentEvents(pattern)));cases++;
   }
  }
 }
 assert.equal(cases,1392);
 // Recorded from published 8931fa1 before this adjustment, not from the implementation under test.
 assert.equal(hash.digest('hex'),'54fb802eb858935c5133141d49f6e5ca4a194d443abeb8ec8b6cc0ad8044c482');
});
