// ML-T01 experimental normalized difference detector. Thresholds are NOT accepted product defaults.
export function analyzeSamples(samples, sampleRate, { windowSize = 4096, hop = 1024, boundaryMode = 'energy-gated', ...options } = {}) {
  if (!Number.isInteger(hop) || hop < 1 || !Number.isInteger(windowSize) || windowSize < hop || !['energy-gated', 'window-start'].includes(boundaryMode)) throw new Error('ANALYSIS_OPTIONS');
  const frames = [];
  for (let offset = 0; offset < samples.length; offset += hop) {
    const window = samples.subarray(offset, Math.min(offset + windowSize, samples.length));
    if (window.length < hop) break;
    // Timing interval and pitch window have different purposes. Future samples
    // can establish periodicity, but must never invent energy in a silent hop.
    const timingRms = rmsOf(window.subarray(0, hop));
    const result = boundaryMode === 'energy-gated' && timingRms < (options.rmsFloor ?? 0.008)
      ? { kind: 'silence', rms: timingRms, confidence: 0 }
      : detectPitch(window, sampleRate, options);
    frames.push({ time: offset / sampleRate, ...result, timingRms });
  }
  return frames;
}

function rmsOf(samples) {
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  let energy = 0;
  for (const value of samples) energy += (value - mean) ** 2;
  return Math.sqrt(energy / samples.length);
}

export function detectPitch(samples, sampleRate, { rmsFloor = 0.008, threshold = 0.15, minHz = 65, maxHz = 2200 } = {}) {
  const rms = rmsOf(samples);
  if (rms < rmsFloor) return { kind: 'silence', rms, confidence: 0 };
  const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(samples.length / 2));
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const difference = new Float64Array(maxLag + 1);
  const count = samples.length - maxLag;
  let sum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let delta = 0;
    for (let i = 0; i < count; i++) delta += (samples[i] - samples[i + lag]) ** 2;
    sum += delta;
    difference[lag] = sum ? delta * lag / sum : 1;
  }
  for (let lag = minLag; lag < maxLag; lag++) {
    if (difference[lag] >= threshold) continue;
    while (lag + 1 <= maxLag && difference[lag + 1] < difference[lag]) lag++;
    const left = difference[lag - 1], center = difference[lag], right = difference[lag + 1] ?? center;
    const denominator = left - 2 * center + right;
    const refined = lag + (denominator ? Math.max(-0.5, Math.min(0.5, (left - right) / (2 * denominator))) : 0);
    const frequency = sampleRate / refined;
    return { kind: 'pitched', rms, frequency, midi: 69 + 12 * Math.log2(frequency / 440), confidence: 1 - center };
  }
  // Energy without reliable periodicity is not automatically speech; never bridge silence.
  return { kind: 'unknown', rms, confidence: 0 };
}

export function analyzeFrames(frames, { endSeconds, maxGapSeconds = 0.15, minDetectedRatio = 0.1 } = {}) {
  const data = frames.map(f => ({ ...f, origin: 'detected' }));
  let detected = 0, nonSilent = 0;
  for (let i = 0; i < data.length; i++) {
    const span = Math.max(0, Math.min(endSeconds, data[i + 1]?.time ?? endSeconds) - data[i].time);
    if (data[i].kind !== 'silence') nonSilent += span;
    if (data[i].kind === 'pitched') detected += span;
  }
  const ratio = nonSilent ? detected / nonSilent : 0;
  if (!detected || ratio < minDetectedRatio) return { empty: true, ratio, segments: [], unknownSeconds: nonSilent - detected };
  for (let i = 0; i < data.length; i++) {
    if (data[i].kind !== 'unknown') continue;
    const start = i;
    while (i < data.length && data[i].kind === 'unknown') i++;
    const before = data[start - 1], after = data[i];
    // Conservative comparison candidate: same pitch on BOTH sides, short gap only.
    if (before?.kind === 'pitched' && after?.kind === 'pitched' && Math.round(before.midi) === Math.round(after.midi) && after.time - data[start].time <= maxGapSeconds) {
      for (let j = start; j < i; j++) data[j] = { ...data[j], kind: 'pitched', midi: Math.round(before.midi), origin: 'completed' };
    }
  }
  const segments = [];
  data.forEach((frame, i) => {
    const end = Math.min(endSeconds, data[i + 1]?.time ?? endSeconds);
    if (frame.kind !== 'pitched' || end <= frame.time) return;
    const midi = Math.round(frame.midi), previous = segments.at(-1);
    if (previous && previous.midi === midi && Math.abs(previous.end - frame.time) < 1e-6) {
      previous.end = end;
      if (frame.origin === 'completed') {
        previous.origin = 'completed';
        previous.completedRanges.push({ start: frame.time, end });
      }
    } else segments.push({ start: frame.time, end, midi, origin: frame.origin, completedRanges: frame.origin === 'completed' ? [{ start: frame.time, end }] : [] });
  });
  return { empty: false, ratio, segments, unknownSeconds: nonSilent - detected };
}

export function quantizeSegments(segments, tempo, endTick = 64) {
  const scale = tempo * 4 / 60, notes = [];
  for (const segment of segments) {
    const startTick = Math.max(notes.at(-1) ? notes.at(-1).startTick + notes.at(-1).durationTick : 0, Math.round(segment.start * scale));
    const end = Math.min(endTick, Math.max(startTick + 1, Math.round(segment.end * scale)));
    if (startTick >= end) continue;
    notes.push({ id: `capture-${notes.length}`, startTick, durationTick: end - startTick, midi: segment.midi, origin: segment.origin, completedRanges: segment.completedRanges || [] });
  }
  return notes;
}
