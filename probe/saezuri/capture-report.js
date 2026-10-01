import { validateNotes } from '../../saezuri/document.js';
import { decodePitchTrace } from './analysis-comparison.js';
import {validateAccompaniment} from '../../saezuri/music/accompaniment.js';

// Reopen numerical diagnostics locally. This never requests a microphone or
// restores a waveform. Manual candidates are separate from the original input.
export function readCaptureReport(text) {
  if (typeof text !== 'string' || text.length > 2000000) throw new Error('記録のサイズが大きすぎます。');
  let report;
  try { report = JSON.parse(text); } catch { throw new Error('JSON全体を貼り付けてください。'); }
  if(['manual','tap'].includes(report?.captureCandidate?.source) && !report.capture) {
    const pattern=report.captureCandidate,tempo=report.compositionOptions?.tempo;
    if(validateNotes(pattern)||pattern.gridStep!==(pattern.source==='tap'?1:2)||pattern.notes.length>pattern.bars*16||pattern.notes.some(n=>typeof n.id!=='string')||
       !Number.isFinite(tempo)||tempo<60||tempo>180||
       !((pattern.source==='tap'&&!pattern.key)||(pattern.key?.tonicPitchClass===0&&pattern.key?.mode==='major')||(pattern.key?.tonicPitchClass===9&&pattern.key?.mode==='minor'))||
       (pattern.accompaniment && validateAccompaniment(pattern.accompaniment))) throw new Error('通常作成の記録を読み込めません。');
    return {pattern:structuredClone(pattern),options:{tempo},importedFrom:{prototype:report.prototype,timestamp:report.timestamp,conditions:report.conditions}};
  }
  const capture = report?.capture, options = report?.captureOptions;
  const bars=capture?.bars??4;
  if (!capture || !options || !Number.isFinite(options.tempo) || options.tempo < 60 || options.tempo > 180 ||
      !Array.isArray(capture.notes) || capture.notes.length > bars*16 ||
      capture.notes.some(note => typeof note?.id !== 'string') ||
      validateNotes({ bars, gridStep: 1, notes: capture.notes })) {
    throw new Error('4小節／8小節の取り込み記録を読み込めません。元の記録を確認してください。');
  }
  let frames = [];
  if (capture.analysisComparison) {
    const comparison = capture.analysisComparison, settings = comparison.sourceOptions;
    if (!settings || !Array.isArray(comparison.variants) || comparison.variants.length !== 3 ||
        comparison.variants.some(variant => !['current', 'detail', 'unsmoothed'].includes(variant?.mode) || !Array.isArray(variant.notes)) ||
        settings.tempo !== options.tempo || !Number.isFinite(settings.endSeconds) ||
        Math.abs(settings.endSeconds - bars*240 / options.tempo) > .01 ||
        ![0, 80, 120].includes(settings.smoothingMs) ||
        !Number.isFinite(settings.maxGapSeconds) || settings.maxGapSeconds < 0 || settings.maxGapSeconds > .5 ||
        !Number.isFinite(settings.minDetectedRatio) || settings.minDetectedRatio < 0 || settings.minDetectedRatio > 1) {
      throw new Error('比較条件を読み込めません。元の記録を確認してください。');
    }
    try { frames = decodePitchTrace(comparison.pitchTrace); } catch { throw new Error('音程推移を読み込めません。元の記録を確認してください。'); }
    if (frames.length > bars*1250 || frames.some((frame, i) =>
      !Number.isFinite(frame.time) || frame.time < 0 || frame.time > settings.endSeconds ||
      (i > 0 && frame.time <= frames[i - 1].time) ||
      !['pitched', 'silence', 'unknown'].includes(frame.kind) ||
      (frame.kind === 'pitched' && (!Number.isFinite(frame.midi) || frame.midi < 0 || frame.midi > 127)) ||
      ['rms', 'timingRms', 'confidence', 'frequency'].some(key => frame[key] !== undefined && !Number.isFinite(frame[key])))) {
      throw new Error('音程推移の値を読み込めません。元の記録を確認してください。');
    }
  }
  return {
    result: { ...structuredClone(capture), frames },
    options: structuredClone(options),
    importedFrom: { prototype: report.prototype, timestamp: report.timestamp, conditions: report.conditions,
      frameSummary: Array.isArray(capture.frames) ? undefined : capture.frames },
  };
}
