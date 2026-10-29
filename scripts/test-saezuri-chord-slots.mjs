import test from 'node:test';
import assert from 'node:assert/strict';
import {CHORD_SLOT_COUNT,readChordSlots,writeChordSlots} from '../probe/saezuri/chord-slots.js';
const chord={root:6,quality:'m7♭5',bass:1};
const memory=()=>{let value=null;return {getItem:()=>value,setItem:(_key,next)=>{value=next;}};};

test('personal slots preserve positions, chromatic/slash chords and holes on reload',()=>{
 const storage=memory(),slots=readChordSlots(storage);assert.equal(slots.length,CHORD_SLOT_COUNT);
 slots[0]={root:2,quality:'minor',bass:2};slots[4]={...chord,startTick:48,manual:true};
 const before=structuredClone(slots);assert.equal(writeChordSlots(slots,storage),true);assert.deepEqual(slots,before);
 const restored=readChordSlots(storage);assert.deepEqual(restored[4],chord);assert.equal(restored[1],null);
 restored[0]=null;writeChordSlots(restored,storage);assert.equal(readChordSlots(storage)[0],null);assert.deepEqual(readChordSlots(storage)[4],chord);
});
test('invalid or oversized stored values never become chord candidates',()=>{
 const storage=memory();
 for(const value of ['broken','null','{}','42']){storage.setItem('',value);assert.deepEqual(readChordSlots(storage),Array(CHORD_SLOT_COUNT).fill(null));}
 const invalid=[{root:12,quality:'major',bass:0},{root:0,quality:'toString',bass:0},{root:0,quality:'major',bass:-1},{root:'0',quality:'major',bass:0}];
 storage.setItem('',JSON.stringify([...invalid,chord,...Array(20).fill(chord)]));const restored=readChordSlots(storage);
 assert.equal(restored.length,CHORD_SLOT_COUNT);assert.ok(restored.slice(0,4).every(c=>c===null));assert.deepEqual(restored[4],chord);
});
test('blocked storage has a safe empty read and a detectable failed write',()=>{
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};
 assert.deepEqual(readChordSlots(blocked),Array(CHORD_SLOT_COUNT).fill(null));assert.equal(writeChordSlots([chord],blocked),false);
});
