import test from 'node:test';import assert from 'node:assert/strict';
import * as music from '../saezuri/music/accompaniment.js';
import {chordTones} from '../saezuri/music/catalog.js';
import {CHORD_INTERVALS} from '../saezuri/music/catalog.js';
const pattern=()=>({bars:4,key:{mode:'major',tonicPitchClass:0},notes:[],accompaniment:{enabled:true,genre:'pop',rhythm:'quarters',progression:'home'}});
test('Am F C G keeps upper piano voices separate from the bass through four and eight bars',()=>{
 for(const bars of [4,8])for(const rhythm of music.RHYTHMS){
  const p={...pattern(),bars,key:{mode:'minor',tonicPitchClass:9}};p.accompaniment={...p.accompaniment,progression:'pop',rhythm:rhythm.id,sounds:{chord:'piano',bass:'sine',drums:'none'}};
  const before=structuredClone(p),events=music.accompanimentEvents(p);
  for(let bar=0;bar<bars;bar++){
   const chord=events.filter(n=>n.part==='chord'&&n.startTick>=bar*16&&n.startTick<(bar+1)*16),bass=events.filter(n=>n.part==='bass'&&n.startTick===bar*16)[0];
   assert.ok(chord.length&&chord.some(n=>n.midi>=60),'piano retains an upper voice in each bar');assert.ok(chord.every(n=>n.midi>=bass.midi+12),'piano does not merge into the bass register');
   const [root,quality]=music.PROGRESSIONS.Am.find(v=>v.id==='pop').chords[bar%4];assert.deepEqual(new Set(chord.map(n=>n.midi%12)),new Set(CHORD_INTERVALS[quality].map(n=>(n+root)%12)),'voicing preserves the requested chord');
  }
  assert.deepEqual(p,before);
 }
});
test('half diminished is distinct and permits a non-chord bass',()=>{
 assert.deepEqual(chordTones({root:11,quality:'m7♭5',bass:1}),{notes:[71,74,77,81],bass:37});
});
test('short harmonic segments stop previous voices at the next change',()=>{
 const p=pattern();p.accompaniment.chords=[{startTick:0,durationTick:4,root:11,quality:'m7♭5',bass:1,manual:true},{startTick:4,durationTick:8,root:5,quality:'major',bass:5,manual:true}];
 const events=music.accompanimentEvents(p);
 assert.ok(events.some(n=>n.startTick===0&&n.midi===37));
 assert.ok(events.filter(n=>n.startTick<4).every(n=>n.startTick+n.durationTick<=4));
 assert.ok(events.some(n=>n.startTick===4&&n.midi===41));
 assert.equal(music.validateAccompaniment({...p.accompaniment,chords:[...p.accompaniment.chords,{startTick:2,durationTick:4,root:0,quality:'major',bass:0}]}).code,'CHORD_OVERLAP');
});
test('recommendations preserve hand-edited harmonies and custom part sounds',()=>{
 assert.equal(typeof music.recommendProgressions,'function');
 const p=pattern();p.notes=[{midi:64,startTick:0,durationTick:16}];
 p.accompaniment.chords=[{startTick:16,durationTick:16,root:11,quality:'m7♭5',bass:1,manual:true}];
 p.accompaniment.sounds={chord:'lead',bass:'wood',drums:'none'};
 const suggestions=music.recommendProgressions(p);assert.equal(suggestions.length,4);
 for(const mode of ['major','minor']){const candidates=music.recommendProgressions({...p,key:{mode,tonicPitchClass:mode==='minor'?9:0}});assert.deepEqual(new Set(candidates.map(v=>v.progression)),new Set(music.PROGRESSIONS[mode==='minor'?'Am':'C'].map(v=>v.id)));}
 for(const v of suggestions){assert.deepEqual(v.chords,p.accompaniment.chords);assert.deepEqual(v.sounds,p.accompaniment.sounds);}
 const eight={...p,bars:8};assert.equal(music.harmonicSegments(eight).at(-1).startTick,112);
});
