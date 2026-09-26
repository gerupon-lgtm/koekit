import { analyzeSamples, analyzeFrames, quantizeSegments } from './analyzer.js';
import { filterCaptureSamples } from './capture-support.js';
self.onmessage = ({ data }) => {
  const { samples, sampleRate, tempo, sessionId, options } = data;
  const started = performance.now();
  const filtered = options.recordCount && options.countSound ? filterCaptureSamples(samples, sampleRate) : samples;
  const frames = analyzeSamples(filtered, sampleRate, options);
  const result = analyzeFrames(frames, { endSeconds: samples.length / sampleRate, maxGapSeconds: options.maxGapSeconds, minDetectedRatio: options.minDetectedRatio, smoothingMs: options.smoothingMs ?? 80, noteMode: options.noteMode ?? 'sustain', tempo });
  const notes = quantizeSegments(result.segments, tempo);
  // Transfer only pitch diagnostics. Raw samples die with this worker after response.
  self.postMessage({ sessionId, notes, frames, empty: result.empty || notes.length === 0, ratio: result.ratio, unknownSeconds: result.unknownSeconds, analysisMs: performance.now() - started, sampleRate, samples: samples.length });
};
