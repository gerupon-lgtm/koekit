import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFrames, quantizeSegments } from '../probe/saezuri/analyzer.js';

const hop = .02;
function framesWithGap({ kind = 'unknown', gapEnergy = .015, beforeEnergy = .1, afterEnergy = .1, energy = true } = {}) {
  return Array.from({length:50}, (_, i) => {
    const time = i * hop, gap = i >= 20 && i < 24;
    return { time, kind: gap ? kind : 'pitched', midi: 55, confidence: gap ? 0 : .98,
      ...(energy ? { rms: .1, timingRms: gap ? gapEnergy : i < 20 ? beforeEnergy : afterEnergy } : {}) };
  });
}
const analyze = frames => analyzeFrames(frames, { endSeconds: 1, tempo: 120, smoothingMs: 120, noteMode: 'sustain', maxGapSeconds: .1 });

test('an energy valley and new attack keep repeated same-pitch notes separate inside the gap limit', () => {
  const result = analyze(framesWithGap());
  assert.equal(result.segments.length, 2);
  assert.deepEqual(result.segments.map(n => n.origin), ['detected', 'detected']);
  assert.equal(result.segments[0].end, .4);
  assert.equal(result.segments[1].start, .48);
  assert.equal(result.gapDecisions[0].reason, 'energy-reattack');
});

test('steady voiced unknown frames still bridge the same held pitch', () => {
  const result = analyze(framesWithGap({ gapEnergy:.1 }));
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].origin, 'completed');
  assert.equal(result.segments[0].completedRanges.length, 4);
});

test('a falling level without a new attack is not mistaken for rearticulation', () => {
  assert.equal(analyze(framesWithGap({gapEnergy:.02,afterEnergy:.025})).segments.length, 1);
});

test('scale-relative reattack detection works at a quieter but voiced level', () => {
  assert.equal(analyze(framesWithGap({beforeEnergy:.04,afterEnergy:.04,gapEnergy:.009})).segments.length, 2);
});

test('missing energy metadata keeps the prior conservative same-pitch gap behavior', () => {
  assert.equal(analyze(framesWithGap({energy:false})).segments.length, 1);
});

test('true silence is never completed even when short', () => {
  const result = analyze(framesWithGap({kind:'silence',gapEnergy:0}));
  assert.equal(result.segments.length, 2);
  assert.ok(result.segments.every(n => !n.completedRanges.length));
});

test('eight articulated quarters keep eight attacks even with the former 300ms gap setting', () => {
  const frames = Array.from({length:200}, (_,i) => ({time:i*hop, kind:i%25>=18?'unknown':'pitched',
    midi:55, confidence:i%25>=18?0:.98, timingRms:i%25>=18?.012:.1, rms:.1}));
  const result=analyzeFrames(frames,{endSeconds:4,tempo:120,smoothingMs:120,noteMode:'sustain',maxGapSeconds:.3});
  const notes=quantizeSegments(result.segments,120);
  assert.equal(notes.length,8);
  assert.deepEqual(notes.map(n=>n.startTick),Array.from({length:8},(_,i)=>i*4));
});
