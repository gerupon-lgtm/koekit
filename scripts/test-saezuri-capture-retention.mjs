import test from 'node:test';
import assert from 'node:assert/strict';
const retention=await import('../probe/saezuri/capture-retention.js').catch(()=>({}));

test('confirmation can drop pitch diagnostics without changing notes, timing or the original result',()=>{
 assert.equal(typeof retention.releaseCaptureDetails,'function');
 const capture={notes:[{id:'a',midi:60,startTick:0,durationTick:8}],bars:4,samples:384000,sampleRate:48000,
  timing:{startFrame:100,endFrame:384100},inputSettings:{sampleRate:48000},acousticTiming:{status:'off'},
  frames:[{time:0,kind:'pitched',midi:60}],unquantizedNotes:[{start:0,end:1,midi:60}],onsetCorrections:[{from:59,to:60}],
  analysisDiagnostics:{gapDecisions:[{start:0,end:.1}]},analysisComparison:{pitchTrace:{rows:'large numerical trace'}}};
 const original=structuredClone(capture),compact=retention.releaseCaptureDetails(capture);
 assert.deepEqual(capture,original,'uploaded/captured source must not be mutated');
 assert.deepEqual(compact,{notes:capture.notes,bars:4,samples:384000,sampleRate:48000,timing:capture.timing,inputSettings:capture.inputSettings,acousticTiming:capture.acousticTiming,frames:{count:1,pitched:1,unknown:0},detailsReleased:true});
 assert.equal(compact.notes,capture.notes,'retain the notes rather than rebuilding them');
});

test('release is repeatable, preserves coarse imported counts and ignores a forged released marker',()=>{
 const original={notes:[],frames:[],samples:384000,sampleRate:48000};
 const compact=retention.releaseCaptureDetails(original,{count:400,pitched:300,unknown:20});
 assert.deepEqual(compact.frames,{count:400,pitched:300,unknown:20});
 assert.deepEqual(retention.releaseCaptureDetails(compact),compact);
 const forged={...compact,frames:[{kind:'unknown',time:0}],analysisComparison:{pitchTrace:'still here'}};
 const cleaned=retention.releaseCaptureDetails(forged);
 assert.equal(cleaned.analysisComparison,undefined);assert.deepEqual(cleaned.frames,{count:1,pitched:0,unknown:1});
 assert.equal(retention.releaseCaptureDetails(null),null);assert.equal(retention.releaseCaptureDetails(undefined),undefined);
});
