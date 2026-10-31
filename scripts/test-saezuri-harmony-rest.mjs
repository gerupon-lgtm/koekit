import test from 'node:test';
import assert from 'node:assert/strict';
import {resizePattern} from '../saezuri/document.js';
import {blankPattern} from '../probe/saezuri/entry-session.js';
import {accompanimentEvents,validateAccompaniment,recommendProgressions} from '../saezuri/music/accompaniment.js';
import {setChordAtBeat,removeChordAtBeat,chordAtTick} from '../saezuri/music/chord-timing.js';
import {chordLabel} from '../saezuri/music/catalog.js';
import {generateImageAccompaniment} from '../saezuri/music/image-arrangement.js';
import {emptySequence,keepPhrase,sequencePlayback,canKeepPhrase} from '../probe/saezuri/sequence-session.js';
import {readPartView} from '../probe/saezuri/part-view.js';
const base=()=>({...blankPattern(),notes:[{id:'m',midi:72,startTick:0,durationTick:16}],accompaniment:{enabled:true,genre:'nursery',rhythm:'whole',progression:'home',drumPattern:'hat-sixteenths',drumAccent:'beats-24'}});
test('a quarter-note blank cuts held harmony and bass, preserving melody and hats',()=>{
 const p=base(),before=structuredClone(p);p.accompaniment=setChordAtBeat(p,0,2,{root:7,bass:7,quality:'major'});p.accompaniment=setChordAtBeat(p,0,1,{rest:true});
 assert.equal(validateAccompaniment(p.accompaniment,4),null);assert.equal(chordAtTick(p,4).rest,true);assert.equal(chordLabel(chordAtTick(p,4)),'空白');assert.equal(chordAtTick(p,8).root,7);
 const pitched=accompanimentEvents(p).filter(e=>e.part!=='drums');assert.ok(pitched.every(e=>e.startTick>=8||e.startTick+e.durationTick<=4));assert.equal(accompanimentEvents(p).filter(e=>e.part==='drums').length,64);assert.deepEqual(p.notes,before.notes);
 p.accompaniment=removeChordAtBeat(p,0,1);assert.equal(chordAtTick(p,4).rest,undefined);assert.equal(chordAtTick(p,4).root,0);
});
test('all backing recipes keep their drum beat through empty harmony, and never emit invalid pitches',()=>{
 for(const genre of ['nursery','pop','ballad','rock'])for(const rhythm of ['whole','halves','quarters','offbeat','arpeggio','tutorial'])for(const image of [false,true]){
  const p=base();if(image)p.accompaniment=generateImageAccompaniment(p,{type:genre,speed:'normal',mood:'bright'});Object.assign(p.accompaniment,{enabled:true,genre,rhythm,drumPattern:'auto'});delete p.accompaniment.drumAccent;
  const drums=p=>accompanimentEvents(p).filter(e=>e.part==='drums').map(e=>[e.startTick,e.instrument,e.gain]).sort((a,b)=>a[0]-b[0]||a[1].localeCompare(b[1]));const original=drums(p);
  p.accompaniment=setChordAtBeat(p,0,0,{rest:true});assert.deepEqual(drums(p),original);assert.ok(accompanimentEvents(p).every(e=>Number.isFinite(e.midi)));assert.ok(accompanimentEvents(p).filter(e=>e.part!=='drums').every(e=>e.startTick>=16));assert.equal(recommendProgressions(p).length,4);
 }
});
test('a deliberate silent bar can be saved as a part, arranged, copied and played with its duration',()=>{
 const p=base();p.bars=1;p.notes=[];p.accompaniment.drumPattern='none';delete p.accompaniment.drumAccent;p.accompaniment=setChordAtBeat(p,0,0,{rest:true});const saved=JSON.parse(JSON.stringify(p));assert.ok(canKeepPhrase(saved));assert.deepEqual(accompanimentEvents(saved),[]);
 let seq=keepPhrase(emptySequence(),saved,'空白');seq.placements=[{id:'x',patternId:seq.patterns[0].id}];const part={patternId:seq.patterns[0].id,checkpoint:{confirmed:{pattern:saved}}};const view=readPartView(part,seq);assert.ok(view.canInsert);assert.equal(view.listenChoices.length,1);assert.match(view.listenChoices[0].description,/空白/);
 let play=sequencePlayback(seq);assert.equal(play.pattern.bars,1);assert.deepEqual(play.backing,[]);assert.deepEqual(play.pattern.notes,[]);play=sequencePlayback({...seq,ending:{enabled:true,bars:1,mode:'auto'}});assert.equal(play.pattern.bars,2);assert.ok(play.backing.every(e=>Number.isFinite(e.midi)));
});
test('blank segments survive regeneration, resize and invalid data is rejected',()=>{
 const p=base();p.accompaniment=setChordAtBeat(p,0,0,{rest:true});const next=generateImageAccompaniment(p);assert.equal(next.chords[0].rest,true);assert.equal(validateAccompaniment(next,4),null);const short=resizePattern({pattern:p,cursor:0,revision:0},1,{confirmed:true});assert.equal(short.pattern.accompaniment.chords[0].rest,true);
 for(const chords of [[null],[{rest:'yes',startTick:0,durationTick:4}],[{rest:true,startTick:0,durationTick:0}]])assert.ok(validateAccompaniment({...p.accompaniment,chords},4));
});
