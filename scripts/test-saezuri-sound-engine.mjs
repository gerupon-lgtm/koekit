import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSoundEngine,chordAuditionEngine} from '../probe/saezuri/sound-engine.js';

test('normal and unrecognized creation URLs use the adopted sound',()=>{
  for(const value of [null,undefined,'','unknown','LIGHT'])assert.equal(resolveSoundEngine(value),'light');
});
test('comparison links keep an explicitly selected engine',()=>{
  for(const engine of ['light','simple','classic'])assert.equal(resolveSoundEngine(engine),engine);
});
test('only light piano chord auditions use the single-wave alternative',()=>{
 for(const instrument of ['piano','fm-piano']){assert.equal(chordAuditionEngine('light',instrument),'simple');assert.equal(chordAuditionEngine('light',instrument,'light'),'light');}
 for(const instrument of ['wood','soft','synth-bass','strings','brass','lead'])assert.equal(chordAuditionEngine('light',instrument),'light');
 for(const engine of ['simple','classic'])assert.equal(chordAuditionEngine(engine,'piano'),engine);
});
