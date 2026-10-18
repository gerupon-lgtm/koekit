import test from 'node:test';
import assert from 'node:assert/strict';
import {lessonGuide} from '../probe/saezuri/tutorial-guide.js';
import {tutorialPattern} from '../probe/saezuri/tutorial-data.js';
const full=tutorialPattern(),make=(count,changes={})=>{const pattern={...structuredClone(full),accompaniment:{enabled:false},notes:structuredClone(full.notes.slice(0,count))};return {pattern,previewPattern:structuredClone(pattern),pending:false,entry:null,cursor:pattern.notes.at(-1)?pattern.notes.at(-1).startTick+pattern.notes.at(-1).durationTick:0,selectedNoteId:pattern.notes.at(-1)?.id,hasRest:false,inputDuration:4,...changes};};
test('intro and stages wait for explicit hearing and next',()=>{
 assert.equal(lessonGuide(make(0),{stage:0}).kind,'model');
 assert.equal(lessonGuide(make(0),{stage:0,modelHeard:true}).done,true);
 for(const [stage,count] of [[2,4],[3,7],[4,12],[5,12],[6,15]]){
  const e=make(count,{hasRest:true});if(stage===4)e.pattern.notes[11].durationTick=e.previewPattern.notes[11].durationTick=2;
  assert.equal(lessonGuide(e,{stage,modelHeard:true}).kind,'listen');
  assert.equal(lessonGuide(e,{stage,modelHeard:true,heard:true}).done,true);
 }
});
test('input requires the selected length and separate confirmation',()=>{
 const e=make(2);assert.equal(lessonGuide(e,{stage:2,modelHeard:true}).kind,'length');
 e.inputDuration=2;assert.equal(lessonGuide(e,{stage:2,modelHeard:true}).expected.midi,67);
 e.entry={input:{midi:67,durationTick:2},proposal:{}};e.pending=true;e.previewPattern.notes.push({...full.notes[2]});
 assert.equal(lessonGuide(e,{stage:2,modelHeard:true}).kind,'confirm');
 e.entry.input.midi=69;assert.equal(lessonGuide(e,{stage:2,modelHeard:true}).kind,'recover');
});
test('second bar and tied note use length candidates without losing the cursor',()=>{
 const e=make(7);e.pattern.notes[6].durationTick=e.previewPattern.notes[6].durationTick=4;
 assert.equal(lessonGuide(e,{stage:3,modelHeard:true}).kind,'edit-length');
 e.previewPattern.notes[6].durationTick=8;e.pending=true;
 assert.equal(lessonGuide(e,{stage:3,modelHeard:true}).kind,'listen');
 assert.equal(lessonGuide(e,{stage:3,modelHeard:true,heard:true}).kind,'confirm');
 const tie=make(12);tie.pattern.notes[11].durationTick=tie.previewPattern.notes[11].durationTick=2;
 assert.equal(lessonGuide(tie,{stage:5,modelHeard:true}).durationTick,4);
});
test('rest is a confirmed operation and wrong edits never auto overwrite',()=>{
 const e=make(8,{cursor:36});assert.equal(lessonGuide(e,{stage:4,modelHeard:true}).expected.midi,null);
 e.entry={input:{midi:null,durationTick:2},proposal:{}};e.pending=true;
 assert.equal(lessonGuide(e,{stage:4,modelHeard:true}).kind,'confirm');
 e.entry=null;e.pending=false;e.cursor=38;e.hasRest=true;
 assert.equal(lessonGuide(e,{stage:4,modelHeard:true}).expected.midi,67);
 e.pattern.notes[0].midi=60;e.previewPattern.notes[0].midi=60;
 assert.equal(lessonGuide(e,{stage:4,modelHeard:true}).kind,'recover');
});
test('backing is staged, heard and confirmed before final completion',()=>{
 const e=make(15,{hasRest:true});assert.equal(lessonGuide(e,{stage:7}).kind,'backing');
 e.previewPattern.accompaniment=tutorialPattern({backing:true}).accompaniment;e.pending=true;
 assert.equal(lessonGuide(e,{stage:7}).kind,'listen');
 assert.equal(lessonGuide(e,{stage:7,heard:true}).kind,'confirm');
 e.pattern.accompaniment=structuredClone(e.previewPattern.accompaniment);e.pending=false;
 assert.equal(lessonGuide(e,{stage:7,heard:true}).done,true);
});

test('Undo recovery can be explicitly confirmed before continuing',()=>{
 const e=make(3);e.pattern.notes[2].midi=69;e.previewPattern.notes.pop();e.pending=true;e.cursor=8;
 assert.equal(lessonGuide(e,{stage:2,modelHeard:true}).kind,'confirm');
});

test('selection instruction names the actual note and identifies the target independently of current selection',()=>{
 const editor=make(2);editor.pattern.notes[0].midi=editor.previewPattern.notes[0].midi=60;
 const guide=lessonGuide(editor,{stage:1,heardOriginal:true});
 assert.equal(guide.kind,'select');assert.match(guide.action,/1ばんの「ド」/);
 assert.equal(guide.noteId,editor.pattern.notes[0].id);
 assert.notEqual(guide.noteId,editor.selectedNoteId);
});
