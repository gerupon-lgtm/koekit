import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCommand, grammarFor } from '../jintori/commands.js';

test('verified coordinate readings accept both orders; partial coordinates never inherit a column', () => {
  for (const word of ['A1', '1A', 'えい いち', 'いち えー', 'エエ イチ']) {
    assert.deepEqual(parseCommand(word, 'human', 8), { type: 'cell', cell: 0 });
  }
  assert.deepEqual(parseCommand('えっち はち', 'human', 8), { type: 'cell', cell: 63 });
  for (const word of ['いち', 'えい', 'えいち はち', 'A1 雑音', 'ほぞん', 'みぎ']) {
    assert.equal(parseCommand(word, 'human', 8), null, word);
  }
  assert.deepEqual(parseCommand('H8', 'human', 4), { type: 'invalidCell' });
});
test('a coordinate plus confirmation only previews; phase-specific choices cannot become coordinates', () => {
  assert.deepEqual(parseCommand('えい いち オッケー', 'human', 8), { type: 'cell', cell: 0 });
  assert.deepEqual(parseCommand('2 オッケー', 'direction', 8), { type: 'choice', number: 2 });
  assert.deepEqual(parseCommand('に', 'direction', 8), { type: 'choice', number: 2 });
  assert.equal(parseCommand('に', 'human', 8), null);
  assert.equal(parseCommand('A1', 'cpu', 8), null);
  assert.equal(parseCommand('オッケー', 'cpu', 8), null);
});
test('color setup and one-move item selection have distinct vocabularies', () => {
  assert.deepEqual(parseCommand('あお', 'setup', 8), { type: 'color', color: 6 });
  assert.deepEqual(parseCommand('きょうか', 'human', 6), { type: 'item', item: 'enhanced' });
  assert.deepEqual(parseCommand('さいきょう', 'human', 8), { type: 'item', item: 'strongest' });
  assert.deepEqual(parseCommand('もどす', 'direction', 8), { type: 'undo' });
  assert.equal(parseCommand('あお', 'human', 8), null);
  assert.equal(parseCommand('きょうか', 'human', 4), null);
  assert.equal(parseCommand('さいきょう', 'setup', 8), null);
  assert.deepEqual(parseCommand('スタート', 'setup', 8), { type: 'start' });
  assert.deepEqual(parseCommand('ストップ', 'dice', 8), { type: 'stop' });
});
test('grammar omits painting commands and non-available items; silent phases have no grammar', () => {
  const words = grammarFor('human', 4);
  assert.ok(words.includes('えい'));
  assert.ok(words.includes('オッケー'));
  assert.ok(!words.includes('ほぞん'));
  assert.ok(!words.includes('えっち'));
  assert.ok(!words.includes('きょうか'));
  assert.ok(grammarFor('direction', 8).includes('に'));
  assert.ok(grammarFor('setup', 8).includes('あお'));
  assert.deepEqual(grammarFor('cpu', 8), []);
  assert.deepEqual(grammarFor('animate', 8), []);
});

test('parser also rejects items omitted from the current input interval', () => {
  assert.equal(parseCommand('きょうか', 'human', 6, []), null);
  assert.equal(parseCommand('さいきょう', 'direction', 8, ['enhanced']), null);
});
