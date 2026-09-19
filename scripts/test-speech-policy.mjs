import assert from 'node:assert/strict';
import { publicMethod } from '../src/speech/public-method.js';
import { createSpeechInput, METHODS } from '../src/speech/index.js';
for (const value of ['webspeech', 'invalid', '', null, undefined]) assert.equal(publicMethod(value), METHODS.VOSK);
assert.equal(publicMethod('webspeech-local'), METHODS.WEBSPEECH_LOCAL);
assert.equal(publicMethod('vosk'), METHODS.VOSK);
assert.throws(() => createSpeechInput(METHODS.WEBSPEECH), /公開/);
assert.equal(createSpeechInput(METHODS.VOSK).name, 'vosk');
// ローカル属性非対応でもJSの任意プロパティ追加だけで開始しない。
let starts = 0;
class UnsupportedRecognition { start() { starts++; } }
globalThis.window = { SpeechRecognition: UnsupportedRecognition };
const { WebSpeechAdapter } = await import('../src/speech/webspeech.js?unsupported-policy-test');
const local = new WebSpeechAdapter({ local: true });
const errors = []; local.on('error', e => errors.push(e)); local.start([]);
assert.equal(starts, 0); assert.deepEqual(errors, ['not-supported']);
class SupportedRecognition { constructor() { this.processLocally = false; } start() { assert.equal(this.processLocally, true); starts++; } stop() {} }
globalThis.window.SpeechRecognition = SupportedRecognition;
const supported = await import('../src/speech/webspeech.js?supported-policy-test');
const safe = new supported.WebSpeechAdapter({ local: true }); safe.start([]); safe.stop();
assert.equal(starts, 1);
delete globalThis.window;
console.log('public speech policy: passed');
