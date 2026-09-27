import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFrames, analyzeSamples, quantizeSegments } from '../probe/saezuri/analyzer.js';
import { smoothPitches } from '../probe/saezuri/pitch-smoothing.js';

const hop = 1024 / 48000;

test('smoothing honors reattack boundaries and retains diagnostic frame metadata', () => {
  const frames = Array.from({length: 40}, (_, i) => ({time:i * hop, kind:'pitched', midi:i < 10 ? 55 : 54,
    ...(i === 10 ? {breakBefore:true, pitchSource:'short-window', originalKind:'unknown', origin:'detected'} : {})}));
  const result = smoothPitches(frames, 40 * hop, 120, 120, 'sustain');
  assert.equal(result.data[0].midi, 55);
  assert.equal(result.data[10].midi, 54);
  assert.equal(result.data[10].breakBefore, true);
  assert.equal(result.data[10].pitchSource, 'short-window');
  assert.equal(result.data[10].originalKind, 'unknown');
  assert.deepEqual(result.onsetCorrections, []);
});
for (const tempo of [60, 120, 180]) for (const smoothingMs of [80, 120]) {
  test(`sustain preserves 32 stable semitone eighths at ${tempo} BPM / ${smoothingMs} ms`, () => {
    const eighth = 30 / tempo, endSeconds = 32 * eighth;
    for (const alternateTimeFormula of [false, true]) {
      const frames = Array.from({ length: Math.ceil(endSeconds / hop) }, (_, i) => {
        const time = alternateTimeFormula ? i * 1024 / 48000 : i * hop;
        return { time, kind: 'pitched', midi: 55 + Math.floor(time / eighth) % 2, confidence: .99 };
      });
      const result = analyzeFrames(frames, { endSeconds, smoothingMs, tempo, noteMode: 'sustain' });
      assert.deepEqual(quantizeSegments(result.segments, tempo).map(n => [n.startTick, n.durationTick, n.midi]),
        Array.from({ length: 32 }, (_, i) => [i * 2, 2, 55 + i % 2]));
    }
  });
}

test('stable local boundaries are found away from beat positions without inserting an onset', () => {
  const endSeconds = 2.08;
  const frames = Array.from({ length: Math.ceil(endSeconds / hop) }, (_, i) => {
    const time = i * hop;
    return { time, kind: time < .08 ? 'silence' : 'pitched', midi: 55 + Math.floor((time - .08) / .25) % 2 };
  });
  const result = analyzeFrames(frames, { endSeconds, smoothingMs: 120, tempo: 120, noteMode: 'sustain' });
  assert.deepEqual(result.segments.map(s => s.midi), [55,56,55,56,55,56,55,56]);
  result.segments.forEach((segment, i) => assert.ok(Math.abs(segment.start - (.08 + i * .25)) <= hop + 1e-8));
});

test('tempo-bounded plateau checks do not split smooth vibrato at any supported comparison tempo', () => {
  for (const tempo of [60,120,180]) for (const smoothingMs of [80,120]) {
    for (const hz of [4,5,6]) for (const phase of [0,1.1,2.4]) for (const amplitude of [.65,.85]) {
      const frames = Array.from({ length: Math.floor(2 / hop) }, (_, i) => ({
        time: i * hop, kind: 'pitched', midi: 54.2 + amplitude * Math.sin(2 * Math.PI * hz * i * hop + phase),
      }));
      const result = analyzeFrames(frames, { endSeconds: 2, smoothingMs, tempo, noteMode: 'sustain' });
      assert.deepEqual(result.segments.map(s => [s.start,s.end,s.midi]), [[0,2,54]],
        JSON.stringify({tempo,smoothingMs,hz,phase,amplitude}));
    }
  }
});

for (const sampleRate of [44100,48000]) test(`small vibrato near semitone rounding boundaries stays one tone at ${sampleRate} Hz`, () => {
  const frameStep = 1024 / sampleRate;
  for (const tempo of [60,120,180]) for (const smoothingMs of [80,120]) {
    for (const amplitude of [.25,.36,.45]) for (const offset of [-.35,.35]) for (const phase of [0,1.1,2.4]) {
      const frames = Array.from({length:Math.floor(2 / frameStep)}, (_,i) => ({
        time:i * frameStep, kind:'pitched', midi:54 + offset + amplitude * Math.sin(2 * Math.PI * 4 * i * frameStep + phase),
      }));
      const result = analyzeFrames(frames, {endSeconds:2,smoothingMs,tempo,noteMode:'sustain'});
      assert.deepEqual(result.segments.map(s => [s.start,s.end,s.midi]), [[0,2,54]],
        JSON.stringify({sampleRate,tempo,smoothingMs,amplitude,offset,phase}));
    }
  }
});

for (const sampleRate of [44100,48000]) for (const tempo of [120,180]) test(`phase-continuous sung semitone eighths retain their pitch and timing at ${tempo} BPM / ${sampleRate} Hz`, () => {
  const eighth = 30 / tempo, endSeconds = 8 * eighth;
  let phase = 0;
  const samples = Float32Array.from({ length: Math.round(sampleRate * endSeconds) }, (_, i) => {
    const midi = 55 + Math.floor(i / sampleRate / eighth) % 2;
    phase += 2 * Math.PI * 440 * 2 ** ((midi - 69) / 12) / sampleRate;
    return .2 * Math.sin(phase) + .05 * Math.sin(phase * 2);
  });
  const frames = analyzeSamples(samples, sampleRate);
  for (const smoothingMs of [80,120]) {
    const result = analyzeFrames(frames, { endSeconds, smoothingMs, tempo, noteMode: 'sustain' });
    assert.deepEqual(quantizeSegments(result.segments, tempo).map(n => [n.startTick,n.durationTick,n.midi]),
      Array.from({length:8}, (_,i) => [i * 2,2,55 + i % 2]));
  }
});
