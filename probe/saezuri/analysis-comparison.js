import { analyzeFrames, quantizeSegments } from './analyzer.js?v=v0.1.0-20261002022700-637b77f';

// These are alternatives on the SAME detected pitch frames, not new recordings
// or a prediction of the correct melody. Real-voice accuracy remains unverified.
// Keep the trace sufficient for analyzeFrames without exporting audio samples,
// identifiers, or arbitrary properties attached to the input frames.
const TRACE_COLUMNS = [
  'time', 'kind', 'midi', 'rms', 'timingRms', 'confidence', 'frequency',
  'pitchSource', 'breakBefore', 'origin', 'originalKind',
];

function encodePitchTrace(frames) {
  return {
    columns: [...TRACE_COLUMNS],
    // JSON preserves the full finite JS number value. Null cells represent
    // absent optional fields; JSON Lines prevents the outer pretty report
    // from expanding every frame into a multi-line object.
    rows: frames.map(frame => JSON.stringify(TRACE_COLUMNS.map(column => frame[column] ?? null))).join('\n'),
  };
}

export function decodePitchTrace(trace) {
  if (!Array.isArray(trace?.columns) || typeof trace.rows !== 'string' ||
      new Set(trace.columns).size !== trace.columns.length ||
      trace.columns.some(column => !TRACE_COLUMNS.includes(column))) throw new Error('PITCH_TRACE_FORMAT');
  if (!trace.rows) return [];
  return trace.rows.split('\n').map(line => {
    const values = JSON.parse(line);
    if (!Array.isArray(values) || values.length !== trace.columns.length) throw new Error('PITCH_TRACE_FORMAT');
    const frame = {};
    values.forEach((value, i) => { if (value !== null) frame[trace.columns[i]] = value; });
    return frame;
  });
}

function variant(mode, settings, primary) {
  const { result, notes, quantizationAdjustments } = primary;
  return {
    mode,
    noteMode: settings.noteMode,
    smoothingMs: settings.smoothingMs,
    empty: result.empty || notes.length === 0,
    segmentCount: result.segments.length,
    notes: notes.map(note => [note.startTick, note.durationTick, note.midi]),
    onsetCorrections: structuredClone(result.onsetCorrections ?? []),
    gapDecisions: structuredClone(result.gapDecisions ?? []),
    quantizationAdjustments: structuredClone(quantizationAdjustments ?? []),
  };
}

export function buildAnalysisComparison(frames, options, primary) {
  // Match the worker's defaults, and retain only settings consumed by this
  // stage. Capture, device and acoustic-alignment settings are intentionally
  // outside this comparison because the detected frames are already fixed.
  const sourceOptions = {
    endSeconds: options.endSeconds,
    tempo: options.tempo ?? 120,
    noteMode: options.noteMode ?? 'sustain',
    smoothingMs: options.smoothingMs ?? 80,
    maxGapSeconds: options.maxGapSeconds ?? .10,
    minDetectedRatio: options.minDetectedRatio ?? .1,
    ...(options.totalTicks&&options.totalTicks!==64?{totalTicks:options.totalTicks}:{}),
  };
  const variants = [variant('current', sourceOptions, primary)];
  for (const [mode, smoothingMs] of [['detail', sourceOptions.smoothingMs], ['unsmoothed', 0]]) {
    const settings = {...sourceOptions, noteMode: 'detail', smoothingMs};
    const result = analyzeFrames(frames, settings), quantizationAdjustments = [];
    const notes = quantizeSegments(result.segments, settings.tempo, settings.totalTicks??64, quantizationAdjustments);
    variants.push(variant(mode, settings, {result, notes, quantizationAdjustments}));
  }
  return {
    input: 'same-pitch-frames',
    sourceOptions,
    noteColumns: ['startTick', 'durationTick', 'midi'],
    variants,
    pitchTrace: encodePitchTrace(frames),
  };
}
