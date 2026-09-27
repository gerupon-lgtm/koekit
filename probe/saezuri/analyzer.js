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

// Never smooth across silence/unknown. Median suppresses isolated octave errors;
// sustained changes form notes, whose pitch is averaged BEFORE semitone rounding.
function smoothPitches(frames, endSeconds, smoothingMs, tempo, noteMode) {
  const data = frames.map(f => ({ ...f, origin: 'detected' }));
  const onsetCorrections = [];
  if (!smoothingMs) return { data, onsetCorrections };
  const radius = smoothingMs / 2000;
  const hold = Math.min(smoothingMs * 0.00075, 60 / (tempo * 4) * 0.5);
  for (let first = 0; first < data.length;) {
    if (data[first].kind !== 'pitched') { first++; continue; }
    let last = first;
    while (last < data.length && data[last].kind === 'pitched') last++;
    const values = [];
    for (let i = first; i < last; i++) {
      const near = [];
      for (let j = first; j < last; j++) if (Math.abs(data[j].time - data[i].time) <= radius + 1e-9) near.push(data[j].midi);
      // An edge pair can contain one octave glitch: take a third neighbour
      // when available so an even median cannot reject both samples.
      if (near.length < 3 && last-first >= 3) {
        near.length=0;
        const from=Math.min(Math.max(first,i-1),last-3);
        for(let j=from;j<from+3;j++) near.push(data[j].midi);
      }
      near.sort((a,b)=>a-b);
      const median = (near[Math.floor((near.length - 1) / 2)] + near[Math.floor(near.length / 2)]) / 2;
      const inliers = near.filter(value => Math.abs(value - median) < 3);
      values.push(inliers.length ? inliers.reduce((sum,value)=>sum+value,0) / inliers.length : data[i].midi);
    }
    const average = (a,b) => {
      let sum=0,weight=0;
      for(let i=a;i<b;i++) {
        const duration=(data[i+1]?.time ?? endSeconds)-data[i].time;
        sum+=values[i-first]*duration; weight+=duration;
      }
      return sum/weight;
    };
    const apply = (a,b) => { const midi=Math.round(average(a,b)); for(let i=a;i<b;i++) data[i].midi=midi; };
    const sustain = noteMode === 'sustain';
    const settleSeconds = Math.max(0.18, smoothingMs / 500);
    // Segment decisions need a full vibrato-cycle view as well as a hold.
    // Instantaneous rounded pitches reset the hold on every oscillation and
    // can otherwise erase even a long, intentional semitone transition.
    const boundaryValues = sustain ? values.map((_, index) => {
      let sum = 0, weight = 0;
      const time = data[first + index].time, halfWindow = 0.125;
      for (let j = first; j < last; j++) {
        const duration = Math.max(0, Math.min(data[j + 1]?.time ?? endSeconds, time + halfWindow)
          - Math.max(data[j].time, time - halfWindow));
        sum += values[j - first] * duration; weight += duration;
      }
      return sum / weight;
    }) : values;
    let onsetEnd = first + 1;
    while (onsetEnd < last && data[onsetEnd].time - data[first].time < settleSeconds) onsetEnd++;
    const onsetCenter = sustain ? average(first, onsetEnd) : frames[first].midi;
    let start=first,pending=-1,pendingPitch=null;
    for(let i=first+1;i<last;i++) {
      // At a phrase onset, forward-looking smoothing can start at a vibrato
      // crest. Sustain mode averages the onset; detail keeps its raw reference
      // to retain short notes before a full averaging window exists.
      const center = start === first && data[i].time-data[start].time < settleSeconds
        ? onsetCenter : average(start,pending<0?i:pending);
      // Large jumps already exceed the vibrato range. Their boundary must use
      // the short window: the long average invents intermediate pitches and
      // would mix the new note into the preceding note's mean.
      const largeChange = Math.abs(values[i-first]-center) >= 1.5 && Math.abs(boundaryValues[i-first]-center) >= 1.5;
      const pitch = sustain && !largeChange ? boundaryValues[i-first] : values[i-first];
      if(Math.round(pitch)!==Math.round(center)) {
        if(pending<0 || Math.round(pitch)!==pendingPitch) { pending=i; pendingPitch=Math.round(pitch); }
        const end=data[i+1]?.time ?? endSeconds;
        // Humming: allow a vibrato excursion to return before splitting a note.
        // Confirmed changes retain their original onset, not the confirmation time.
        const required = (sustain ? largeChange : Math.abs(pitch-center) >= 0.65) ? hold : settleSeconds;
        if(end-data[pending].time+1e-9>=required) { apply(start,pending);start=pending;pending=-1; }
      } else pending=-1;
    }
    apply(start,last);
    if (sustain) {
      // A short semitone offset at a voiced onset may be the singer settling
      // into the held note. Use its longer stable body as the pitch reference.
      // Stay inside this pitched run: never consume silence or an unknown gap.
      let attackEnd = first + 1;
      while (attackEnd < last && data[attackEnd].midi === data[first].midi) attackEnd++;
      if (attackEnd < last) {
        let stableEnd = attackEnd + 1;
        while (stableEnd < last && data[stableEnd].midi === data[attackEnd].midi) stableEnd++;
        const attackSeconds = data[attackEnd].time - data[first].time;
        const stableSeconds = (data[stableEnd]?.time ?? endSeconds) - data[attackEnd].time;
        const fromMidi = data[first].midi, toMidi = data[attackEnd].midi;
        if (Math.abs(fromMidi-toMidi) === 1 && attackSeconds <= 0.3 && stableSeconds >= Math.max(0.3, attackSeconds * 1.5)) {
          for (let i = first; i < attackEnd; i++) data[i].midi = toMidi;
          onsetCorrections.push({ start: data[first].time, end: data[attackEnd].time, fromMidi, toMidi });
        }
      }
    }
    first=last;
  }
  return { data, onsetCorrections };
}

export function analyzeFrames(frames, { endSeconds, maxGapSeconds = 0.15, minDetectedRatio = 0.1, smoothingMs = 0, tempo = 120, noteMode = 'detail' } = {}) {
  const { data, onsetCorrections } = smoothPitches(frames, endSeconds, smoothingMs, tempo, noteMode);
  let detected = 0, nonSilent = 0;
  for (let i = 0; i < data.length; i++) {
    const span = Math.max(0, Math.min(endSeconds, data[i + 1]?.time ?? endSeconds) - data[i].time);
    if (data[i].kind !== 'silence') nonSilent += span;
    if (data[i].kind === 'pitched') detected += span;
  }
  const ratio = nonSilent ? detected / nonSilent : 0;
  if (!detected || ratio < minDetectedRatio) return { empty: true, ratio, segments: [], unknownSeconds: nonSilent - detected, onsetCorrections: [] };
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
  return { empty: false, ratio, segments, unknownSeconds: nonSilent - detected, onsetCorrections };
}

export function quantizeSegments(segments, tempo, endTick = 64) {
  const scale = tempo * 4 / 60, notes = [];
  for (const segment of segments) {
    const startTick = Math.max(notes.at(-1) ? notes.at(-1).startTick + notes.at(-1).durationTick : 0, Math.round(segment.start * scale));
    // A fragment that rounds to zero has no sixteenth-note slot. Giving every
    // fragment one tick would push subsequent notes away from their sung times.
    const end = Math.min(endTick, Math.round(segment.end * scale));
    if (startTick >= end) continue;
    notes.push({ id: `capture-${notes.length}`, startTick, durationTick: end - startTick, midi: segment.midi, origin: segment.origin, completedRanges: segment.completedRanges || [] });
  }
  return notes;
}
