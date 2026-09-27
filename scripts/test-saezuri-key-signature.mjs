import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSignature, signature, spellPitch } from '../probe/saezuri/key-signature.js';
const notes=(pitches)=>pitches.map((midi,i)=>({midi,startTick:i*4,durationTick:4}));

test('estimate signature from the complete melody, retaining ambiguity between relative keys',()=>{
 const melody=notes([54,51,52,54,49,51,47]);melody.at(-1).durationTick=29;
 const before=structuredClone(melody), result=inferSignature(melody);
 assert.equal(result.fifths,5);
 assert.ok(result.alternatives.includes(4));
 assert.match(signature(result.fifths).label,/B.*G♯/);
 assert.deepEqual(melody,before);
});

test('empty, single-pitch and chromatic input does not claim a key',()=>{
 for(const melody of [[],notes([60,60]),notes(Array.from({length:12},(_,i)=>60+i))]) {
  assert.equal(inferSignature(melody).estimated,false);
 }
});

test('key-aware spelling handles flats and enharmonic octave boundaries without changing sound',()=>{
 assert.deepEqual(spellPitch(70,-2),{letter:6,octave:4,accidental:-1,step:34,name:'B♭4'});
 assert.equal(spellPitch(59,-7).name,'C♭4');
 assert.equal(spellPitch(60,7).name,'B♯3');
 const natural=[0,2,4,5,7,9,11];
 for(let fifths=-7;fifths<=7;fifths++)for(let midi=36;midi<=96;midi++){
  const p=spellPitch(midi,fifths);
  assert.equal((p.octave+1)*12+natural[p.letter]+p.accidental,midi);
 }
});

test('all fifteen signatures have the standard accidental order and number',()=>{
 assert.deepEqual(signature(3).alterations,[1,0,0,1,1,0,0]);
 assert.deepEqual(signature(-3).alterations,[0,0,-1,0,0,-1,-1]);
 for(let n=-7;n<=7;n++)assert.equal(signature(n).alterations.filter(x=>x).length,Math.abs(n));
 assert.throws(()=>signature(8));
});
