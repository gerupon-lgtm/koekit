import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSoundEngine} from '../probe/saezuri/sound-engine.js';

test('normal and unrecognized creation URLs use the adopted sound',()=>{
  for(const value of [null,undefined,'','unknown','LIGHT'])assert.equal(resolveSoundEngine(value),'light');
});
test('comparison links keep an explicitly selected engine',()=>{
  for(const engine of ['light','simple','classic'])assert.equal(resolveSoundEngine(engine),engine);
});
