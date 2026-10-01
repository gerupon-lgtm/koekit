import test from 'node:test';import assert from 'node:assert/strict';
import * as music from '../saezuri/music/accompaniment.js';
import {chordTones} from '../saezuri/music/catalog.js';
const pattern=()=>({bars:4,key:{mode:'major',tonicPitchClass:0},notes:[],accompaniment:{enabled:true,genre:'pop',rhythm:'quarters',progression:'home'}});
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
 const suggestions=music.recommendProgressions(p);assert.equal(suggestions.length,3);
 for(const v of suggestions){assert.deepEqual(v.chords,p.accompaniment.chords);assert.deepEqual(v.sounds,p.accompaniment.sounds);}
 const eight={...p,bars:8};assert.equal(music.harmonicSegments(eight).at(-1).startTick,112);
});
