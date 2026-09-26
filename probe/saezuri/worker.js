import { analyzeSamples, analyzeFrames, quantizeSegments } from './analyzer.js';
self.onmessage = ({ data }) => {
  const { samples, sampleRate, tempo, sessionId, options } = data;
  const started = performance.now(), frames = analyzeSamples(samples, sampleRate, options);
  const result = analyzeFrames(frames, { endSeconds: samples.length / sampleRate, maxGapSeconds: options.maxGapSeconds, minDetectedRatio: options.minDetectedRatio });
  const notes = quantizeSegments(result.segments, tempo);
  // Transfer only pitch diagnostics. Raw samples die with this worker after response.
  self.postMessage({ sessionId, notes, frames, empty: result.empty, ratio: result.ratio, unknownSeconds: result.unknownSeconds, analysisMs: performance.now() - started, sampleRate, samples: samples.length });
};
