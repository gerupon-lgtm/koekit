import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSamples, analyzeFrames, quantizeSegments } from '../probe/saezuri/analyzer.js';

function fixture(sampleRate, midi, spans, seconds = 2) {
  const hz = 440 * 2 ** ((midi - 69) / 12);
  return Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, i) => {
    const time = i / sampleRate;
    return spans.some(([start, end]) => time >= start && time < end) ? 0.2 * Math.sin(2 * Math.PI * hz * time) : 0;
  });
}

test('legacy window start reproduces early onset as comparison control', () => {
  const frames = analyzeSamples(fixture(48000, 60, [[0.5, 1.5]]), 48000, { boundaryMode: 'window-start' });
  const result = analyzeFrames(frames, { endSeconds: 2 });
  assert.equal(quantizeSegments(result.segments, 180)[0].startTick, 5);
});
for (const sampleRate of [44100, 48000]) for (const midi of [48, 60, 84]) {
  test(`short energy intervals keep C${midi} onset and release within one hop at ${sampleRate}`, () => {
    const frames = analyzeSamples(fixture(sampleRate, midi, [[0.5, 1.5]]), sampleRate, { boundaryMode: 'energy-gated' });
    const result = analyzeFrames(frames, { endSeconds: 2 });
    assert.equal(result.segments.length, 1);
    const segment = result.segments[0];
    assert.equal(segment.midi, midi);
    assert.ok(Math.abs(segment.start - 0.5) <= 1024 / sampleRate, `early start ${segment.start}`);
    assert.ok(Math.abs(segment.end - 1.5) <= 1024 / sampleRate, `late end ${segment.end}`);
    const notes = quantizeSegments(result.segments, 180);
    assert.equal(notes[0].startTick, 6);
    assert.equal(notes[0].durationTick, 12);
  });
}
test('short low notes separated by a sixteenth rest stay separate', () => {
  const frames = analyzeSamples(fixture(48000, 48, [[0.5, 7/12], [2/3, 0.75]]), 48000, {boundaryMode: 'energy-gated'});
  const result = analyzeFrames(frames, {endSeconds:2});
  assert.equal(result.segments.length, 2);
  const notes = quantizeSegments(result.segments, 180);
  assert.deepEqual(notes.map(n => [n.startTick,n.durationTick,n.midi]), [[6,1,48],[8,1,48]]);
});
test('silence is never filled in energy-gated mode', () => {
  const frames = analyzeSamples(new Float32Array(96000), 48000, {boundaryMode:'energy-gated'});
  assert.ok(frames.every(f => f.kind === 'silence'));
  assert.equal(analyzeFrames(frames, {endSeconds:2}).empty, true);
});
for (const sampleRate of [44100,48000]) {
  test(`short pitch window retains C4-G4 and genuine C3 changes at ${sampleRate}`, () => {
    for (const pitches of [[60,67], [48,60], [60,48]]) {
      const samples = Float32Array.from({length:sampleRate*2},(_,i)=>{
        const time=i/sampleRate;
        if(time<0.5||time>=1.5)return 0;
        const midi=time<1?pitches[0]:pitches[1];
        return 0.2*Math.sin(2*Math.PI*440*2**((midi-69)/12)*time);
      });
      const frames=analyzeSamples(samples,sampleRate,{windowSize:1024,boundaryMode:'energy-gated'});
      const notes=quantizeSegments(analyzeFrames(frames,{endSeconds:2}).segments,180);
      assert.deepEqual(notes.map(n=>[n.startTick,n.durationTick,n.midi]),[[6,6,pitches[0]],[12,6,pitches[1]]]);
    }
  });
}
