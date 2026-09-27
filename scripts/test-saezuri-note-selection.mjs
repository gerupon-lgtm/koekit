import test from 'node:test';
import assert from 'node:assert/strict';
import {orderedNotes,selectionTarget} from '../probe/saezuri/note-selection.js';
import {parseEditCommand,EDIT_WORDS} from '../probe/saezuri/edit-voice.js';
const notes=Array.from({length:16},(_,i)=>({id:`n${i+1}`,startTick:i*4,durationTick:4,midi:60}));
test('numbered selection jumps directly by musical order without mutating notes',()=>{
 const reversed=notes.toReversed();assert.equal(selectionTarget(reversed,'n1','select:10'),'n10');
 assert.equal(reversed[0].id,'n16');assert.equal(orderedNotes(reversed)[0].id,'n1');
 assert.equal(selectionTarget(notes,'n10','first'),'n1');assert.equal(selectionTarget(notes,'n10','last'),'n16');
 assert.equal(selectionTarget(notes,'n1','previous'),'n1');assert.equal(selectionTarget(notes,'n16','next'),'n16');
 assert.equal(selectionTarget(notes,'n10','select:17'),null);assert.equal(selectionTarget([],'n1','first'),null);
});
test('numbers accept exact kana/kanji/numeric words but not unrelated sentences',()=>{
 for(const text of ['10番','１０番目','十 番','じゅうばん','ジュウバンメ']) assert.equal(parseEditCommand(text),'select:10');
 for(const text of ['二十一番目','にじゅういちばん']) assert.equal(parseEditCommand(text),'select:21');
 assert.equal(parseEditCommand('ろくじゅうよんばん'),'select:64');
 for(const text of ['10','0番','65番','10番くらい']) assert.equal(parseEditCommand(text),null);
  assert.equal(parseEditCommand('さいしょ'),'first');assert.equal(parseEditCommand('最後'),'last');
  assert.ok(EDIT_WORDS.includes('十 番'));assert.ok(EDIT_WORDS.includes('二 十 一 番 目'));
  assert.equal(EDIT_WORDS.includes('10番'),false);
});
