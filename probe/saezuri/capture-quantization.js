// Quantize the detected intervals without moving established note boundaries.
// A collapsed interval may keep one tick only when its original duration is at
// least half a sixteenth and that tick is free. This is a probe threshold, not
// evidence that every such interval is a real sung note.
export function quantizeSegments(segments, tempo, endTick = 64, adjustments = []) {
  const scale = tempo * 4 / 60;
  let previousEnd = 0;
  const entries = segments.map(segment => {
    const roundedStart = Math.round(segment.start * scale);
    const roundedEnd = Math.round(segment.end * scale);
    const start = Math.max(previousEnd, roundedStart);
    const end = Math.min(endTick, roundedEnd);
    const reserved = start < end ? { start, end } : null;
    if (reserved) previousEnd = end;
    return { segment, roundedStart, roundedEnd, reserved };
  });

  // Reserve all ordinary notes before extending any zero-tick interval. A rescue
  // must never truncate a later note or shift its nearest-grid onset.
  let nextStart = endTick;
  for (let i = entries.length - 1; i >= 0; i--) {
    entries[i].nextStart = nextStart;
    if (entries[i].reserved) nextStart = entries[i].reserved.start;
  }

  const notes = [];
  previousEnd = 0;
  for (const { segment, roundedStart, roundedEnd, reserved, nextStart } of entries) {
    let interval = reserved;
    if (!interval && roundedStart === roundedEnd &&
        (segment.end - segment.start) * scale >= 0.5 - 1e-9 &&
        roundedStart >= previousEnd && roundedStart + 1 <= nextStart &&
        roundedStart + 1 <= endTick) {
      interval = { start: Math.max(0, roundedStart), end: roundedStart + 1 };
      adjustments.push({ start: segment.start, end: segment.end, midi: segment.midi, startTick: interval.start, durationTick: 1, reason: 'retain-short-note' });
    }
    if (!interval) continue;
    notes.push({
      id: `capture-${notes.length}`, startTick: interval.start,
      durationTick: interval.end - interval.start, midi: segment.midi,
      origin: segment.origin, completedRanges: segment.completedRanges || [],
    });
    previousEnd = interval.end;
  }
  return notes;
}
