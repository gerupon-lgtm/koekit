import test from 'node:test';
import assert from 'node:assert/strict';
import { readCaptureReport } from '../probe/saezuri/capture-report.js';
import { analyzeFrames, quantizeSegments } from '../probe/saezuri/analyzer.js';
import { buildAnalysisComparison } from '../probe/saezuri/analysis-comparison.js';

test('manual diagnostics reopen the confirmed 8-bar melody and accompaniment, never the draft',()=>{
 const pattern={source:'manual',bars:8,gridStep:2,key:{tonicPitchClass:9,mode:'minor'},notes:[{id:'a',midi:60,startTick:100,durationTick:8}],accompaniment:{enabled:true,genre:'rock',rhythm:'quarters',progression:'pop'}};
 const report={capture:null,captureCandidate:pattern,compositionOptions:{tempo:140},captureEditing:{editCandidate:{notes:[]}}};
 const imported=readCaptureReport(JSON.stringify(report));assert.deepEqual(imported.pattern,pattern);assert.equal(imported.options.tempo,140);
 for(const bad of [{...pattern,bars:5},{...pattern,gridStep:1},{...pattern,key:{mode:'major',tonicPitchClass:1}},{...pattern,accompaniment:{enabled:true}}]) assert.throws(()=>readCaptureReport(JSON.stringify({...report,captureCandidate:bad})),/通常作成/);
 assert.throws(()=>readCaptureReport(JSON.stringify({...report,compositionOptions:null})),/通常作成/);
});

function fixture() {
  const frames = Array.from({ length: 400 }, (_, i) => ({ time: i * .02, kind: 'pitched', midi: i % 25 < 12 ? 55 : 56, rms: .1 }));
  const options = { tempo: 120, endSeconds: 8, smoothingMs: 120, noteMode: 'sustain', maxGapSeconds: .1, minDetectedRatio: .5 };
  const result = analyzeFrames(frames, options), notes = quantizeSegments(result.segments, options.tempo);
  const capture = { notes, frames: { count: 400, pitched: 400, unknown: 0 }, samples: 384000, sampleRate: 48000,
    analysisComparison: buildAnalysisComparison(frames, options, { result, notes, quantizationAdjustments: [] }) };
  return { report: { prototype: 'ML-T01-v12', timestamp: 'test', conditions: 'fixture', captureOptions: options, capture }, frames };
}

test('copied diagnostics restore exact numerical frames and leave manual candidates separate', () => {
  const { report, frames } = fixture();
  report.captureCandidate = { bars: 4, gridStep: 1, notes: [] };
  const imported = readCaptureReport(JSON.stringify(report));
  assert.deepEqual(imported.result.frames, frames);
  assert.deepEqual(imported.result.notes, report.capture.notes);
  assert.deepEqual(imported.result.analysisComparison, report.capture.analysisComparison);
  assert.deepEqual(imported.importedFrom.frameSummary, report.capture.frames);
  assert.equal(imported.importedFrom.prototype, 'ML-T01-v12');
  assert.deepEqual(imported.options, report.captureOptions);
});

test('older diagnostics can reopen the original notes without claiming to restore pitch frames', () => {
  const { report } = fixture();
  delete report.capture.analysisComparison;
  const imported = readCaptureReport(JSON.stringify(report));
  assert.deepEqual(imported.result.frames, []);
  assert.deepEqual(imported.result.notes, report.capture.notes);
  assert.equal(imported.importedFrom.frameSummary.count, 400);
});

test('invalid JSON, overlap, out-of-range pitch and invalid tempo are refused before changing UI state', () => {
  assert.throws(() => readCaptureReport('partial {'), /JSON/);
  assert.throws(() => readCaptureReport('null'), /4小節/);
  for (const mutate of [
    r => { r.captureOptions.tempo = 0; },
    r => { r.capture.notes = [{ id: 'x', midi: 128, startTick: 0, durationTick: 1 }]; },
    r => { r.capture.notes = [{ id: 'x', midi: 60, startTick: 0, durationTick: 4 }, { id: 'y', midi: 61, startTick: 3, durationTick: 2 }]; },
    r => { r.capture.notes[0].id = {}; },
  ]) {
    const { report } = fixture(); mutate(report);
    assert.throws(() => readCaptureReport(JSON.stringify(report)), /4小節/);
  }
});

test('broken comparison settings and unordered or non-numerical frames are rejected', () => {
  for (const mutate of [
    c => { delete c.sourceOptions; },
    c => { c.variants = null; },
    c => { c.sourceOptions.endSeconds = 999999; },
    c => { c.sourceOptions.tempo = 180; },
    c => { c.pitchTrace.rows = '{broken'; },
    c => { c.pitchTrace.rows = c.pitchTrace.rows.split('\n').reverse().join('\n'); },
    c => { const rows = c.pitchTrace.rows.split('\n'), row = JSON.parse(rows[0]); row[2] = '55'; rows[0] = JSON.stringify(row); c.pitchTrace.rows = rows.join('\n'); },
  ]) {
    const { report } = fixture(); mutate(report.capture.analysisComparison);
    assert.throws(() => readCaptureReport(JSON.stringify(report)), /読み込めません/);
  }
});
