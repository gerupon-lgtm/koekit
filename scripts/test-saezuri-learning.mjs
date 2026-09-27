import {test} from 'node:test';
import assert from 'node:assert/strict';
import {practicePhrases,practicePhrase,tutorialGuide} from '../probe/saezuri/learning-data.js';
import {validateNotes} from '../saezuri/document.js';
import {accompanimentEvents} from '../saezuri/music/accompaniment.js';
test('every editable practice phrase is valid and has bounded accompaniment',()=>{
 const phrases=practicePhrases();assert.equal(phrases.length,4);assert.equal(new Set(phrases.map(p=>p.id)).size,4);
 for(const p of phrases){assert.equal(validateNotes(p.pattern),null);p.pattern.accompaniment.enabled=true;const backing=accompanimentEvents(p.pattern);assert.ok(backing.length>0);assert.ok(backing.every(n=>n.startTick>=0&&n.startTick+n.durationTick<=64));}
});
test('editing a copy or list never changes the original phrase',()=>{
 const first=practicePhrase('walk');first.pattern.notes[0].midi=72;first.pattern.accompaniment.enabled=true;
 const list=practicePhrases();list[0].pattern.notes.splice(0);
 assert.equal(practicePhrase('walk').pattern.notes.length,7);assert.equal(practicePhrase('walk').pattern.notes[0].midi,60);assert.equal(practicePhrase('walk').pattern.accompaniment.enabled,false);assert.equal(practicePhrase('missing'),null);
});

test('tutorial permits correction after notes are deleted without losing the editor',()=>{
 const notes=[{id:'a',midi:60,startTick:0,durationTick:4},{id:'b',midi:64,startTick:4,durationTick:4}];
 for(const remaining of [[],[notes[1]]])assert.equal(tutorialGuide({pattern:{notes},previewPattern:{notes:remaining}},true).target,'#capture-edit-undo');
});
