import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Emitter } from '../src/util/emitter.js';
import { SpeechSession } from '../jintori/voice.js';

class Adapter extends Emitter {
  starts = []; stops = 0;
  start(words) { this.starts.push(words); }
  stop() { this.stops++; this.emit('end'); }
  dispose() { this.stop(); }
}
test('voice only delivers from the current interval and stops on close', async () => {
  const adapter = new Adapter(), heard = [], states = [];
  const voice = new SpeechSession({ factory: () => adapter, onText: (...a) => heard.push(a), onState: s => states.push(s) });
  await voice.open(['えい'], 1);
  const oldHandler = [...adapter._handlers.get('result')][0];
  adapter.emit('result', 'えい');
  await voice.open(['に'], 2);
  oldHandler('えい'); adapter.emit('result', 'に');
  voice.close(); adapter.emit('result', 'に');
  assert.deepEqual(heard, [['えい', 1], ['に', 2]]);
  assert.equal(states.at(-1), 'idle');
  assert.ok(adapter.stops >= 2);
  voice.dispose();
});
test('synchronous errors retain denied state; a late start cannot reopen after close', async () => {
  const adapter = new Adapter(), states = [];
  adapter.start = () => { adapter.emit('error', 'recognizer-failed'); };
  const voice = new SpeechSession({ factory: () => adapter, onState: s => states.push(s) });
  await voice.open(['えい'], 1);
  assert.equal(states.at(-1), 'denied');
  let resolve;
  adapter.start = () => new Promise(r => { resolve = r; });
  const pending = voice.open(['に'], 2);
  voice.close(); resolve(); await pending;
  assert.equal(states.at(-1), 'idle');
  voice.dispose();
});
test('unexpected session end restarts; explicit close cancels the restart', async () => {
  const adapter = new Adapter();
  const voice = new SpeechSession({ factory: () => adapter, restartMs: 1 });
  await voice.open(['えい'], 1);
  adapter.emit('end');
  await new Promise(r => setTimeout(r, 15));
  assert.equal(adapter.starts.length, 2);
  adapter.emit('end'); voice.close();
  await new Promise(r => setTimeout(r, 15));
  assert.equal(adapter.starts.length, 2);
  voice.dispose();
});
