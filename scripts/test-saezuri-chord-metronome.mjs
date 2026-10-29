import test from 'node:test';
import assert from 'node:assert/strict';
import {ClickLoop} from '../probe/saezuri/chord-metronome.js';
function fixture(options={}){
 const tracks=[],errors=[],changes=[],audio={ctx:{currentTime:1},mixer:{count:{}}};
 const loop=new ClickLoop({prepareTrack:async()=>audio,warm:async(_ctx,valid)=>valid(),onChange:()=>changes.push({active:loop.active,pending:loop.pending}),onError:e=>errors.push(e),
  makeTransport:(ctx,mixer,onStop)=>{const track={ctx,mixer,onStop,active:false,stops:0,start(notes,settings){this.active=true;this.notes=notes;this.settings=settings;},stop(){this.stops++;this.active=false;}};tracks.push(track);return track;},...options});
 return {loop,tracks,errors,changes,audio};
}
test('the metronome repeats only quarter-note counts on the existing count mixer',async()=>{
 const f=fixture();assert.equal(await f.loop.start(96),true);assert.equal(f.loop.active,true);assert.equal(f.loop.pending,false);const t=f.tracks[0];
 assert.deepEqual(t.notes,[]);assert.equal(t.settings.countSound,true);assert.equal(t.settings.loop,true);assert.equal(t.settings.totalTicks,16);assert.equal(t.settings.tempo,96);assert.equal(t.mixer,f.audio.mixer);assert.equal(t.settings.countStyle,'rim');
 f.loop.stop();assert.equal(t.active,false);assert.equal(f.loop.active,false);assert.equal(f.loop.pending,false);
});
test('stop and a later request cancel obsolete asynchronous audio preparation',async()=>{
 const pending=[],f=fixture({prepareTrack:()=>new Promise(resolve=>pending.push(resolve))});
 const first=f.loop.start(100);f.loop.stop();pending.shift()(f.audio);assert.equal(await first,false);assert.equal(f.tracks.length,0);
 const second=f.loop.start(110),third=f.loop.start(120);pending[1](f.audio);assert.equal(await third,true);pending[0](f.audio);assert.equal(await second,false);assert.equal(f.tracks.length,1);assert.equal(f.tracks[0].settings.tempo,120);f.loop.stop();
});
test('tempo changes replace owned clicks and an old stop callback cannot cancel a new run',async()=>{
 const f=fixture();await f.loop.start(120);const old=f.tracks[0];await f.loop.setTempo(80);assert.equal(old.active,false);assert.equal(f.tracks[1].settings.tempo,80);
 old.onStop('AUDIO_INTERRUPTED');assert.equal(f.loop.active,true);f.tracks[1].onStop('AUDIO_INTERRUPTED');assert.equal(f.loop.active,false);assert.equal(f.errors.length,1);
});
test('invalid tempo, failed preparation and partial start failures leave no running track',async()=>{
 const f=fixture();assert.equal(await f.loop.start(59),false);assert.equal(f.tracks.length,0);assert.equal(f.errors.length,1);
 f.loop.prepareTrack=async()=>{throw Error('unavailable');};assert.equal(await f.loop.start(120),false);assert.equal(f.loop.pending,false);assert.equal(f.loop.active,false);
 const failed=fixture({makeTransport:()=>({active:false,start(){this.active=true;throw Error('partial');},stop(){this.active=false;}})});assert.equal(await failed.loop.start(120),false);assert.equal(failed.loop.active,false);assert.equal(failed.loop.pending,false);assert.equal(failed.errors.length,1);
});
