import { analyzeSamples, analyzeFrames, quantizeSegments } from './analyzer.js';
import { filterCaptureSamples } from './capture-support.js';
import { measureCountDelay, selectCaptureWindow } from './acoustic-sync.js';
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
  const result = analyzeFrames(frames, { endSeconds: samples.length / sampleRate, maxGapSeconds: options.maxGapSeconds, minDetectedRatio: options.minDetectedRatio, smoothingMs: options.smoothingMs ?? 80, noteMode: options.noteMode ?? 'sustain', tempo });
  const quantizationAdjustments = [];
  const notes = quantizeSegments(result.segments, tempo, 64, quantizationAdjustments);
  const analysisDiagnostics = { shortWindowFrames: frames.filter(f=>f.pitchSource==='short-window').length, gapDecisions: result.gapDecisions, quantizationAdjustments };
  // Transfer only pitch diagnostics. Raw samples die with this worker after response.
  self.postMessage({ sessionId, notes, frames, unquantizedNotes:result.segments, empty: result.empty || notes.length === 0, ratio: result.ratio, unknownSeconds: result.unknownSeconds, onsetCorrections: result.onsetCorrections, analysisDiagnostics, analysisMs: performance.now() - started, sampleRate, samples: samples.length, acousticTiming, timing });
};
