import test from 'node:test';
import assert from 'node:assert/strict';
import {setChordAtBeat,removeChordAtBeat,chordAtTick,chordChangesInBar} from '../saezuri/music/chord-timing.js';
import {accompanimentEvents,validateAccompaniment} from '../saezuri/music/accompaniment.js';
import {blankPattern} from '../probe/saezuri/entry-session.js';
const p=()=>({...blankPattern(),accompaniment:{enabled:true,genre:'nursery',rhythm:'whole',progression:'home',drumPattern:'hat-half-front'}});
const c=root=>({root,bass:root,quality:'major'});
test('quarter-note chord changes retain the earlier chord and stop at the next change or bar end',()=>{
 const pattern=p(),before=structuredClone(pattern);let value=setChordAtBeat(pattern,0,0,c(0));
 value=setChordAtBeat({...pattern,accompaniment:value},0,2,c(7));
 const changed={...pattern,accompaniment:value};assert.equal(validateAccompaniment(value,4),null);
 assert.deepEqual([0,4,8,12].map(t=>chordAtTick(changed,t).root),[0,0,7,7]);assert.equal(chordAtTick(changed,16).root,5);
 value=setChordAtBeat(changed,0,1,c(2));assert.deepEqual([0,4,8,12].map(t=>chordAtTick({...pattern,accompaniment:value},t).root),[0,2,7,7]);
 value=setChordAtBeat({...pattern,accompaniment:value},0,0,c(9));assert.deepEqual([0,4,8,12].map(t=>chordAtTick({...pattern,accompaniment:value},t).root),[9,2,7,7]);
 assert.deepEqual(pattern,before);
});
test('all four beats, slash chords and 8-bar boundaries survive JSON reload',()=>{
 const pattern=p();pattern.bars=8;
 for(let bar=0;bar<8;bar++)for(let beat=0;beat<4;beat++)pattern.accompaniment=setChordAtBeat(pattern,bar,beat,{root:beat*2,bass:beat,quality:'m7'});
 const saved=JSON.parse(JSON.stringify(pattern));assert.equal(validateAccompaniment(saved.accompaniment,8),null);
 for(let bar=0;bar<8;bar++)assert.deepEqual(chordChangesInBar(saved,bar).map(c=>[c.startTick%16,c.root,c.bass]),[[0,0,0],[4,2,1],[8,4,2],[12,6,3]]);
 const events=accompanimentEvents(saved);assert.equal(events.filter(e=>e.part==='drums').length,16);assert.ok(events.filter(e=>e.part!=='drums').every(e=>e.durationTick===4));
});
test('removing a beat change extends the previous chord and keeps subsequent changes',()=>{
 const pattern=p();for(const [beat,root] of [[0,0],[1,2],[2,7],[3,9]])pattern.accompaniment=setChordAtBeat(pattern,0,beat,c(root));
 pattern.accompaniment=removeChordAtBeat(pattern,0,1);
 assert.deepEqual(chordChangesInBar(pattern,0).map(c=>[c.startTick,c.root]),[[0,0],[8,7],[12,9]]);
 pattern.accompaniment=removeChordAtBeat(pattern,0,2);
 assert.deepEqual(chordChangesInBar(pattern,0).map(c=>[c.startTick,c.root]),[[0,0],[12,9]]);
 assert.throws(()=>removeChordAtBeat(pattern,0,0));
});
test('editing a bar inside a legacy long chord preserves its portions outside that bar',()=>{
 const pattern=p();pattern.accompaniment.chords=[{...c(2),startTick:0,durationTick:48,manual:true}];
 pattern.accompaniment=setChordAtBeat(pattern,1,2,c(7));
 assert.deepEqual([0,16,24,32,48].map(t=>chordAtTick(pattern,t).root),[2,2,7,2,0]);assert.equal(validateAccompaniment(pattern.accompaniment,4),null);
 for(const [bar,beat] of [[-1,0],[4,0],[0,4],[0,.5]])assert.throws(()=>setChordAtBeat(pattern,bar,beat,c(0)));
});
test('automatic drum positions also stay on the bar grid across quarter-note harmony changes',()=>{
 for(const rhythm of ['quarters','offbeat','arpeggio','tutorial']){
  const pattern=p();pattern.accompaniment.rhythm=rhythm;pattern.accompaniment.drumPattern='auto';
  const drums=p=>accompanimentEvents(p).filter(e=>e.part==='drums').map(e=>[e.startTick,e.instrument,e.gain]).sort((a,b)=>a[0]-b[0]||a[1].localeCompare(b[1]));
  const original=drums(pattern);
  for(let beat=0;beat<4;beat++)pattern.accompaniment=setChordAtBeat(pattern,0,beat,c(beat));
  assert.deepEqual(drums(pattern),original);
 }
});

test('removing a change after an automatic chord restores a single sustained note',()=>{
 const pattern=p();pattern.accompaniment=setChordAtBeat(pattern,0,2,c(7));
 pattern.accompaniment=removeChordAtBeat(pattern,0,2);
 assert.deepEqual(accompanimentEvents(pattern).filter(e=>e.part==='bass'&&e.startTick<16).map(e=>[e.startTick,e.durationTick,e.midi%12]),[[0,16,0]]);
});
