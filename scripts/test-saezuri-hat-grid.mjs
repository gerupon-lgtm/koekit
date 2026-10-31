import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {accompanimentEvents,validateAccompaniment} from '../saezuri/music/accompaniment.js';
import {hatAccentOptions} from '../saezuri/music/hat-patterns.js';
import {blankPattern} from '../probe/saezuri/entry-session.js';
import {generateImageAccompaniment} from '../saezuri/music/image-arrangement.js';
const fixtures=[['hat-half-on',[0,8],'beat-1',[0]],['hat-half-off',[4,12],'beat-4',[12]],['hat-quarter-on',[0,4,8,12],'beats-24',[4,12]],['hat-quarter-off',[2,6,10,14],'beats-13',[2,10]],['hat-eighths',[0,2,4,6,8,10,12,14],'beat-3',[8]],['hat-sixteenths',Array.from({length:16},(_,i)=>i),'beats-24',[4,12]],['hat-eighths',[0,2,4,6,8,10,12,14],'beats-1234',[0,4,8,12]],['hat-sixteenths',Array.from({length:16},(_,i)=>i),'beats-1234',[0,4,8,12]]];
test('six independent hat grids and accents play at their exact positions across chord boundaries',()=>{
 for(const [drumPattern,ticks,drumAccent,strong] of fixtures)for(const bars of [1,2,4,8])for(const drums of ['acoustic','electronic']){
  const p={...blankPattern(),bars,accompaniment:{enabled:true,genre:'nursery',rhythm:'whole',progression:'home',drumPattern,drumAccent,sounds:{drums},chords:[{root:2,bass:2,quality:'minor',startTick:4,durationTick:8}]}};
  assert.equal(validateAccompaniment(p.accompaniment,bars),null);const before=JSON.stringify(p),events=accompanimentEvents(p).filter(e=>e.part==='drums');
  assert.deepEqual(events.map(e=>e.startTick),Array.from({length:bars},(_,i)=>ticks.map(t=>i*16+t)).flat());assert.ok(events.every(e=>e.gain===(strong.includes(e.startTick%16)?.06:.008)));
  assert.ok(events.every(e=>e.instrument===(drums==='electronic'?'electro-hat':'hat')));assert.equal(JSON.stringify(p),before);
  p.accompaniment.drumAccent='none';assert.ok(accompanimentEvents(p).filter(e=>e.part==='drums').every(e=>e.gain===.02));
 }
});
test('invalid accent positions and unsupported combinations are rejected',()=>{
 const base={enabled:true,genre:'nursery',rhythm:'whole',progression:'home',drumPattern:'hat-half-on'};
 for(const drumAccent of ['beat-2','beats-24','bad',null,42])assert.equal(validateAccompaniment({...base,drumAccent},1)?.code,'ACCOMPANIMENT_INVALID');
 assert.equal(validateAccompaniment({...base,drumPattern:'auto',drumAccent:'beat-1'},1)?.code,'ACCOMPANIMENT_INVALID');
});
test('separate rhythm/accent survive regeneration and JSON reload and clear only on explicit reset',()=>{
 const p=blankPattern();p.accompaniment=generateImageAccompaniment(p);Object.assign(p.accompaniment,{drumPattern:'hat-sixteenths',drumAccent:'beats-24'});p.accompaniment=generateImageAccompaniment(p);
 const saved=JSON.parse(JSON.stringify(p));assert.equal(validateAccompaniment(saved.accompaniment,4),null);assert.equal(saved.accompaniment.drumAccent,'beats-24');assert.equal(accompanimentEvents(saved).filter(e=>e.part==='drums').length,64);
 saved.accompaniment.sounds={drums:'none'};assert.ok(accompanimentEvents(saved).every(e=>e.part!=='drums'));
 const reset=generateImageAccompaniment(saved,undefined,{resetManual:true});assert.equal(reset.drumPattern,undefined);assert.equal(reset.drumAccent,undefined);
});

test('all previously saved combined hat ids keep the exact published event output',()=>{
 const rows=[];for(const id of ['hat-half-front','hat-half-back','hat-backbeat','hat-backbeat-front','hat-backbeat-back','hat-quarters-first','hat-quarters-third','hat-quarters-front','hat-quarters-back'])for(const bars of [1,2,4,8])for(const drums of ['acoustic','electronic'])rows.push(accompanimentEvents({...blankPattern(),bars,accompaniment:{enabled:true,genre:'nursery',rhythm:'halves',progression:'home',drumPattern:id,sounds:{drums}}}));
 assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),'eb348576200d0ae8024aaab135fef4321da582ec7577a4235eb9d5203108531e');
});


test('every-beat accent is available for dense grids and survives regenerated saved recipes',()=>{
 for(const id of ['hat-eighths','hat-sixteenths']){
  assert.equal(hatAccentOptions(id).find(a=>a.id==='beats-1234')?.label,'毎拍の頭を強く');
  const p=blankPattern();p.accompaniment=generateImageAccompaniment(p);Object.assign(p.accompaniment,{drumPattern:id,drumAccent:'beats-1234'});p.accompaniment=generateImageAccompaniment(p);
  const saved=JSON.parse(JSON.stringify(p));assert.equal(validateAccompaniment(saved.accompaniment,4),null);assert.equal(saved.accompaniment.drumAccent,'beats-1234');
  const hits=accompanimentEvents(saved).filter(e=>e.part==='drums');assert.equal(hits.filter(e=>e.gain===.06).length,16);assert.ok(hits.every(e=>e.gain===(e.startTick%4===0?.06:.008)));
 }
 for(const id of ['auto','none','hat-half-on','hat-half-off','hat-quarter-on','hat-quarter-off'])assert.ok(!hatAccentOptions(id).some(a=>a.id==='beats-1234'));
});
