import test from 'node:test';
import assert from 'node:assert/strict';
import { CHORD_INTERVALS, GENRES, chordTones, validateCatalog } from '../saezuri/music/catalog.js';

test('all thirteen chord types have the specified intervals', () => {
  const expected = {major:[0,4,7],minor:[0,3,7],'7':[0,4,7,10],maj7:[0,4,7,11],m7:[0,3,7,10],sus4:[0,5,7],dim:[0,3,6],aug:[0,4,8],'6':[0,4,7,9],m6:[0,3,7,9],add9:[0,4,7,14],'m(add9)':[0,3,7,14],'m7♭5':[0,3,6,10]};
  assert.deepEqual(CHORD_INTERVALS,expected);
  assert.deepEqual(GENRES.map(genre=>genre.label),['どうよう','ポップ','バラード','ロック']);
  for (const [quality, intervals] of Object.entries(expected)) {
    assert.deepEqual(chordTones({root:0,quality,bass:0}).notes, intervals.map(n=>60+n));
  }
});
test('add9 is not a ninth chord with a seventh; slash bass stays independent', () => {
  assert.deepEqual(chordTones({root:0,quality:'add9',bass:5}),{notes:[60,64,67,74],bass:41});
  assert.deepEqual(chordTones({root:11,quality:'m(add9)',bass:6}),{notes:[71,74,78,85],bass:42});
});
test('malformed or unknown harmony is rejected rather than normalized', () => {
  for (const chord of [null,{root:12,quality:'major',bass:0},{root:0,quality:'9',bass:0},{root:0,quality:'major',bass:-1},{root:0.5,quality:'major',bass:0}]) {
    assert.equal(chordTones(chord).code,'CHORD_INVALID');
  }
});
test('catalog rejects duplicate ids, invalid keys, rhythm lengths and events beyond a pattern', () => {
  const catalog = {version:1, progressions:[{id:'test',key:{tonicPitchClass:0,mode:'major'},chords:[{root:0,quality:'major',bass:0}]}], rhythms:[{id:'test',bars:4,events:[{startTick:0,durationTick:4}]}]};
  assert.equal(validateCatalog(catalog),null);
  for (const modify of [
    value=>value.progressions.push(structuredClone(value.progressions[0])),
    value=>value.progressions[0].key.mode='unknown',
    value=>value.rhythms[0].events[0].durationTick=65,
    value=>value.rhythms[0].bars=3,
    value=>value.version=0,
  ]) { const value=structuredClone(catalog);modify(value);assert.ok(validateCatalog(value)?.code); }
});
