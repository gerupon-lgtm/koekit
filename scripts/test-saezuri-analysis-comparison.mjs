import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFrames, quantizeSegments } from '../probe/saezuri/analyzer.js';
import { buildAnalysisComparison, decodePitchTrace } from '../probe/saezuri/analysis-comparison.js';

const options = { endSeconds: 2, tempo: 120, noteMode: 'sustain', smoothingMs: 80, maxGapSeconds: .1, minDetectedRatio: .1 };
const frames = Array.from({ length: 94 }, (_, i) => ({
  time: i * 1024 / 48000, kind: 'pitched', midi: 54 + .85 * Math.sin(2 * Math.PI * 5 * i * 1024 / 48000),
  rms: .143210987654321, timingRms: .141234567890123, confidence: .987654321098765,
}));
function primaryFor(input, settings) {
  const result = analyzeFrames(input, settings), quantizationAdjustments = [];
  const notes = quantizeSegments(result.segments, settings.tempo, 64, quantizationAdjustments);
  return {result, notes, quantizationAdjustments};
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('current uses the supplied primary while alternatives independently analyze the same frames', () => {
  const primary = primaryFor(frames, options);
  const comparison = buildAnalysisComparison(frames, options, primary);
  assert.equal(comparison.input, 'same-pitch-frames');
  assert.deepEqual(comparison.noteColumns, ['startTick','durationTick','midi']);
  assert.deepEqual(comparison.variants.map(v => [v.mode,v.noteMode,v.smoothingMs]),
    [['current','sustain',80],['detail','detail',80],['unsmoothed','detail',0]]);
  assert.deepEqual(comparison.variants[0].notes, primary.notes.map(n => [n.startTick,n.durationTick,n.midi]));
  assert.equal(comparison.variants[0].notes.length, 1);
  assert.ok(comparison.variants[2].notes.length > 1);
  for (const variant of comparison.variants.slice(1)) {
    const expected = primaryFor(frames, {...options,noteMode:variant.noteMode,smoothingMs:variant.smoothingMs});
    assert.deepEqual(variant.notes, expected.notes.map(n => [n.startTick,n.durationTick,n.midi]));
    assert.equal(variant.segmentCount, expected.result.segments.length);
  }
});

test('JSON-lines trace retains full-precision numbers, sparse fields, recovery and energy metadata', () => {
  const input = [
    {time:0,kind:'silence',rms:0,timingRms:0,confidence:0},
    {time:1024/44100,kind:'unknown',rms:.020123456789012345,timingRms:.008987654321012345,confidence:0},
    {time:2048/44100,kind:'pitched',midi:54.12345678901234,frequency:185.1234567890123,rms:.07,timingRms:.08,
      confidence:.923456789012345,pitchSource:'short-window',breakBefore:true,origin:'detected',originalKind:'unknown'},
    {time:3072/44100,kind:'pitched',midi:54.12345678901234,rms:.07,breakBefore:false},
  ];
  const settings = {...options,endSeconds:.2};
  const trace = buildAnalysisComparison(input, settings, primaryFor(input, settings)).pitchTrace;
  assert.equal(typeof trace.rows, 'string');
  assert.equal(trace.rows.split('\n').length, input.length);
  assert.ok(trace.rows.split('\n').every(row => Array.isArray(JSON.parse(row))));
  assert.deepEqual(decodePitchTrace(trace), input);
});

test('a serialized report alone can replay all three comparisons exactly', () => {
  const original = buildAnalysisComparison(frames, options, primaryFor(frames, options));
  const report = JSON.parse(JSON.stringify(original));
  const replayFrames = decodePitchTrace(report.pitchTrace);
  const replay = buildAnalysisComparison(replayFrames, report.sourceOptions, primaryFor(replayFrames, report.sourceOptions));
  assert.deepEqual(replay, original);
});

test('frozen inputs and primary remain unchanged; diagnostics are not aliased', () => {
  const input = freeze(structuredClone(frames)), settings = freeze({...options});
  const primary = primaryFor(input, settings);
  primary.result.gapDecisions = [{start:.25,end:.29,action:'complete',reason:'same-pitch-gap'}];
  primary.result.onsetCorrections = [{start:0,end:.1,fromMidi:55,toMidi:54}];
  primary.quantizationAdjustments = [{start:.08,end:.16,midi:54,startTick:1,durationTick:1,reason:'retain-short-note'}];
  const before = structuredClone(primary);
  freeze(primary);
  const comparison = buildAnalysisComparison(input, settings, primary);
  comparison.variants[0].notes[0][2] = 90;
  comparison.variants[0].gapDecisions[0].action = 'separate';
  comparison.variants[0].onsetCorrections[0].toMidi = 90;
  comparison.variants[0].quantizationAdjustments[0].midi = 90;
  assert.deepEqual(primary, before);
  assert.deepEqual(input, frames);
});

test('detail and smoothing-off current settings keep their explicit labels and equal applicable alternatives', () => {
  for (const settings of [{...options,noteMode:'detail'}, {...options,smoothingMs:0}]) {
    const result = buildAnalysisComparison(frames, settings, primaryFor(frames, settings));
    assert.equal(result.variants[0].mode, 'current');
    const counterpart = settings.smoothingMs === 0 ? result.variants[2] : result.variants[1];
    assert.deepEqual(result.variants[0].notes, counterpart.notes);
    assert.equal(result.variants[0].smoothingMs, settings.smoothingMs);
  }
});

test('empty status reflects quantized notes, including a detected fragment with no usable tick', () => {
  const input = [{time:0,kind:'pitched',midi:60},{time:.02,kind:'silence',rms:0}];
  const settings = {...options,endSeconds:.2};
  const primary = primaryFor(input, settings);
  assert.equal(primary.result.empty, false);
  assert.equal(primary.notes.length, 0);
  for (const variant of buildAnalysisComparison(input, settings, primary).variants) {
    assert.equal(variant.empty, true);
    assert.equal(variant.segmentCount, 1);
    assert.deepEqual(variant.notes, []);
  }
  const empty = buildAnalysisComparison([], settings, primaryFor([], settings));
  assert.deepEqual(decodePitchTrace(empty.pitchTrace), []);
  assert.ok(empty.variants.every(v => v.empty));
});

test('gap and rescued-note decisions are reported and reproducible for every variant', () => {
  const input = [
    {time:0,kind:'silence',rms:0},
    {time:.08,kind:'pitched',midi:60,rms:.1,timingRms:.1},
    {time:.16,kind:'silence',rms:0},
    {time:.5,kind:'pitched',midi:60,rms:.1,timingRms:.1},
    {time:.8,kind:'unknown',rms:.1,timingRms:.1},
    {time:.82,kind:'pitched',midi:60,rms:.1,timingRms:.1},
  ];
  const settings = {...options,endSeconds:1,smoothingMs:0};
  const comparison = buildAnalysisComparison(input, settings, primaryFor(input, settings));
  for (const variant of comparison.variants) {
    assert.equal(variant.quantizationAdjustments.length, 1);
    assert.equal(variant.quantizationAdjustments[0].reason, 'retain-short-note');
    assert.equal(variant.gapDecisions.length, 1);
    assert.equal(variant.gapDecisions[0].action, 'complete');
  }
  const recovered = decodePitchTrace(comparison.pitchTrace);
  assert.deepEqual(buildAnalysisComparison(recovered, settings, primaryFor(recovered, settings)), comparison);
});

test('trace and source settings exclude waveforms, device identifiers and unrelated properties', () => {
  const input = frames.map(frame => ({...frame,deviceId:'do-not-export',groupId:'private',samples:new Float32Array([.1,.2])}));
  const settings = {...options,deviceId:'private',samples:[.3],countVolume:2};
  const comparison = buildAnalysisComparison(input, settings, primaryFor(input, options));
  const report = JSON.stringify(comparison);
  for (const property of ['deviceId','groupId','samples','countVolume','do-not-export','private']) assert.ok(!report.includes(property));
  assert.deepEqual(decodePitchTrace(comparison.pitchTrace), frames);
  assert.deepEqual(comparison.sourceOptions, options);
});
