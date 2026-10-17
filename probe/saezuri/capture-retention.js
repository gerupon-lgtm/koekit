// Keep coarse recording metadata and notes, never individual pitch frames or
// alternative analyses after normal-screen confirmation. Do not mutate input.
export function releaseCaptureDetails(capture, fallbackFrames) {
 if(!capture)return capture;
 const {frames,unquantizedNotes,onsetCorrections,analysisDiagnostics,analysisComparison,...summary}=capture;
 const counts=Array.isArray(frames)&&frames.length
  ? {count:frames.length,pitched:frames.filter(frame=>frame.kind==='pitched').length,unknown:frames.filter(frame=>frame.kind==='unknown').length}
  : Array.isArray(frames)?fallbackFrames:frames;
 return {...summary,frames:{count:counts?.count??0,pitched:counts?.pitched??0,unknown:counts?.unknown??0},detailsReleased:true};
}
