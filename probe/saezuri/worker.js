import { analyzeSamples, analyzeFrames, quantizeSegments } from './analyzer.js?v=v0.1.0-20261002022700-637b77f';
import { filterCaptureSamples } from './capture-support.js?v=v0.1.0-20261002022700-637b77f';
import { measureCountDelay, selectCaptureWindow } from './acoustic-sync.js?v=v0.1.0-20261002022700-637b77f';
import { buildAnalysisComparison } from './analysis-comparison.js?v=v0.1.0-20261002022700-637b77f';
self.onmessage = ({ data }) => {
  const { sampleRate, tempo, sessionId, options } = data;
  let samples=data.samples, timing=data.timing;
  const started = performance.now();
  let acousticTiming={status:'off',reason:options.acousticSync?'count-disabled':'disabled'};
  if(data.acousticSync && timing){
    const rawStart=timing.captureStartFrame/sampleRate;
    acousticTiming=measureCountDelay({samples,sampleRate,timing,rawStart});
    const window=selectCaptureWindow({sampleRate,timing,rawStart,tempo,measurement:acousticTiming,manualMs:options.manualMs||0});
    if(window.offset<0 || window.offset+window.length>samples.length)throw new Error('CAPTURE_SYNC_RANGE');
    acousticTiming={...acousticTiming,source:window.source,estimatedCorrectionSeconds:timing.correctionSeconds,appliedCorrectionSeconds:window.correctionSeconds,
      adjustmentTicks:(window.correctionSeconds-timing.correctionSeconds)*tempo*4/60,measurementMs:performance.now()-started};
    timing={...timing,startFrame:window.startFrame,endFrame:window.startFrame+window.length,correctionSeconds:window.correctionSeconds};
    samples=samples.subarray(window.offset,window.offset+window.length);
  }
  const filtered = options.recordCount && options.countSound ? filterCaptureSamples(samples, sampleRate) : samples;
  const frames = analyzeSamples(filtered, sampleRate, options);
  const totalTicks=(options.loop?.bars??4)*16;
  const analysisOptions = { endSeconds: samples.length / sampleRate, maxGapSeconds: options.maxGapSeconds ?? 0.1, minDetectedRatio: options.minDetectedRatio ?? 0.1, smoothingMs: options.smoothingMs ?? 80, noteMode: options.noteMode ?? 'sustain', tempo,totalTicks };
  const result = analyzeFrames(frames, analysisOptions);
  const quantizationAdjustments = [];
  const notes = quantizeSegments(result.segments, tempo, totalTicks, quantizationAdjustments);
  const analysisDiagnostics = { shortWindowFrames: frames.filter(f=>f.pitchSource==='short-window').length, gapDecisions: result.gapDecisions, quantizationAdjustments };
  const comparisonStarted = performance.now();
  const analysisComparison = buildAnalysisComparison(frames, analysisOptions, { result, notes, quantizationAdjustments });
  const comparisonMs = performance.now() - comparisonStarted;
  // Transfer only pitch diagnostics. Raw samples die with this worker after response.
  self.postMessage({ sessionId, notes, frames, unquantizedNotes:result.segments, empty: result.empty || notes.length === 0, ratio: result.ratio, unknownSeconds: result.unknownSeconds, onsetCorrections: result.onsetCorrections, analysisDiagnostics, analysisComparison, comparisonMs, analysisMs: performance.now() - started, sampleRate, samples: samples.length, acousticTiming, timing });
};
