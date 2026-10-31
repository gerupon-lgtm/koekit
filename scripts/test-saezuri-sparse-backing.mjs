import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {accompanimentEvents,validateAccompaniment,accompanimentSounds} from '../saezuri/music/accompaniment.js';
import {generateImageAccompaniment,IMAGE_SPEEDS,IMAGE_MOODS,imagePatternCount} from '../saezuri/music/image-arrangement.js';
import {blankPattern} from '../probe/saezuri/entry-session.js';
import {openEditSession,stageEdit,cancelEditSession,confirmEditSession,undoEditSession} from '../probe/saezuri/edit-session.js';
const pattern=(rhythm='whole',drumPattern)=>({...blankPattern(),accompaniment:{enabled:true,genre:'nursery',rhythm,progression:'home',...(drumPattern?{drumPattern}:{})}});

test('whole and half notes sustain both harmony and bass in every genre and 4/8-bar part',()=>{
 for(const genre of ['nursery','pop','ballad','rock'])for(const bars of [4,8])for(const [rhythm,length] of [['whole',16],['halves',8]]){
  const p=pattern(rhythm);p.bars=bars;p.accompaniment.genre=genre;
  const before=structuredClone(p),events=accompanimentEvents(p);
  assert.ok(events.length);assert.ok(events.every(e=>e.part!=='drums'));
  for(const part of ['chord','bass']){
   const notes=events.filter(e=>e.part===part);
   assert.equal(new Set(notes.map(e=>e.startTick)).size,bars*16/length);
   assert.ok(notes.every(e=>e.startTick%length===0&&e.durationTick===length));
  }
  assert.deepEqual(p,before);
 }
});
test('half-note hats use only global beats 1 and 3, with opposite accents',()=>{
 for(const rhythm of ['whole','halves','quarters','offbeat','arpeggio','tutorial'])for(const sound of ['acoustic','electronic']){
  const front=pattern(rhythm,'hat-half-front');front.accompaniment.sounds={drums:sound};
  const back=structuredClone(front);back.accompaniment.drumPattern='hat-half-back';
  const a=accompanimentEvents(front).filter(e=>e.part==='drums'),b=accompanimentEvents(back).filter(e=>e.part==='drums');
  assert.equal(a.length,8);assert.deepEqual(a.map(e=>e.startTick),[0,8,16,24,32,40,48,56]);
  assert.ok(a.every(e=>e.instrument===(sound==='electronic'?'electro-hat':'hat')&&e.midi===42));
  assert.ok(a[0].gain>a[1].gain);assert.ok(b[0].gain<b[1].gain);
  assert.equal(a[0].gain,b[1].gain);assert.equal(a[1].gain,b[0].gain);
 }
});
test('chord changes stop held notes but cannot restart the hat beat',()=>{
 const p=pattern('halves','hat-half-front');p.accompaniment.chords=[{startTick:6,durationTick:6,root:2,bass:2,quality:'minor'}];
 const events=accompanimentEvents(p);
 assert.deepEqual(events.filter(e=>e.part==='drums').map(e=>e.startTick),[0,8,16,24,32,40,48,56]);
 assert.deepEqual(events.filter(e=>e.part==='bass'&&e.startTick<16).map(e=>[e.startTick,e.durationTick]),[[0,6],[6,2],[8,4],[12,4]]);
});
test('none removes drums only, and explicit drum sound none always wins',()=>{
 for(const rhythm of ['whole','halves','quarters','tutorial']){
  const p=pattern(rhythm,'none'),a=accompanimentEvents(p);
  assert.ok(a.some(e=>e.part==='chord'));assert.ok(a.every(e=>e.part!=='drums'));
  p.accompaniment.drumPattern='hat-half-front';p.accompaniment.sounds={chord:'strings',bass:'sine',drums:'none'};
  const b=accompanimentEvents(p);assert.ok(b.length);assert.ok(b.every(e=>e.part!=='drums'));
  assert.deepEqual(accompanimentSounds(p.accompaniment),{chord:'strings',bass:'sine',drums:'none'});
 }
});
test('image regeneration retains manual held rhythm and drums, reset restores the image recipe',()=>{
 const p=pattern();p.accompaniment=generateImageAccompaniment(p);
 p.accompaniment.rhythm='halves';p.accompaniment.drumPattern='hat-half-back';p.accompaniment.manualSettings={rhythm:true};p.accompaniment.sounds={chord:'strings'};
 for(let i=0;i<10;i++){
  p.accompaniment=generateImageAccompaniment(p);assert.equal(validateAccompaniment(p.accompaniment,4),null);
  const saved=JSON.parse(JSON.stringify(p)),events=accompanimentEvents(saved);
  assert.ok(events.filter(e=>e.part==='chord').every(e=>e.durationTick===8&&e.instrument==='strings'));
  assert.equal(events.filter(e=>e.part==='drums').length,8);
 }
 p.accompaniment=generateImageAccompaniment(p,undefined,{resetManual:true});
 assert.equal(p.accompaniment.drumPattern,undefined);assert.notEqual(p.accompaniment.rhythm,'halves');
});
test('percussion values validate while old records without the field remain valid',()=>{
 for(const id of [undefined,'auto','none','hat-half-front','hat-half-back'])assert.equal(validateAccompaniment(pattern('quarters',id).accompaniment,4),null);
 for(const id of ['bad',null,42,{}])assert.equal(validateAccompaniment({...pattern().accompaniment,drumPattern:id},4)?.code,'ACCOMPANIMENT_INVALID');
});

test('existing presets and every saved image recipe keep their original event output',()=>{
 const all=[];for(const genre of ['nursery','pop','ballad','rock'])for(const rhythm of ['quarters','offbeat','arpeggio','tutorial'])all.push(accompanimentEvents({...blankPattern(),accompaniment:{enabled:true,genre,rhythm,progression:'home'}}));
 for(const type of ['nursery','pop','ballad','rock'])for(const [speed] of IMAGE_SPEEDS)for(const [mood] of IMAGE_MOODS){const p=blankPattern();for(let i=0;i<imagePatternCount(type);i++){p.accompaniment=generateImageAccompaniment(p,{type,speed,mood});all.push(accompanimentEvents(p));}}
 assert.equal(createHash('sha256').update(JSON.stringify(all)).digest('hex'),'f8042945ab29265ba634163a39e98241d4632c40678d557f01f3e021d8cf3a87');
});

test('new backing fields follow candidate, cancel, confirmation and Undo without changing the source',()=>{
 const original=pattern('quarters'),session=openEditSession(original),value=pattern('halves','hat-half-back').accompaniment;
 const pending=stageEdit(session,{type:'accompaniment',value});assert.deepEqual(pending.confirmed,original);
 assert.deepEqual(cancelEditSession(pending).working.pattern,original);
 assert.deepEqual(confirmEditSession(pending).confirmed.accompaniment,value);
 assert.deepEqual(undoEditSession(pending).working.pattern,original);assert.deepEqual(session.confirmed,original);
});
