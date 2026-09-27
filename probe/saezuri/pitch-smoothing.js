// A flat pitch body is different evidence from a rounded vibrato crest. Find
// these bodies before temporal pitch averaging; a long smoothing window must
// not remove a short but stable note. Tempo limits the observation duration,
// never the boundary position or pitch.
function plateauBoundaries(data, pitches, first, last, endSeconds, tempo) {
  const observation = Math.min(0.10, 30 / tempo * 0.40);
  const plateaus = [];
  for (let from = first; from < last; from++) {
    let to = from, low = Infinity, high = -Infinity, sum = 0, weight = 0;
    while (to < last) {
      const value = pitches[to - first];
      low = Math.min(low, value); high = Math.max(high, value);
      const duration = (data[to + 1]?.time ?? endSeconds) - data[to].time;
      sum += value * duration; weight += duration; to++;
      if (data[to - 1].time - data[from].time + 1e-9 >= observation) break;
    }
    // Require observed samples spanning the whole interval. The final frame's
    // nominal duration is not additional evidence that its pitch stayed flat.
    // A narrow range also rejects the locally slow crest/trough of a small
    // vibrato that happens to cross a semitone rounding boundary.
    if (data[to - 1].time - data[from].time + 1e-9 < observation || high - low > 0.10) continue;
    const pitch = sum / weight, previous = plateaus.at(-1);
    if (previous && from < previous.to && Math.abs(pitch - previous.pitch) < 0.25) {
      previous.to = to;
    } else plateaus.push({ from, to, pitch });
  }
  const boundaries = [];
  for (let i = 1; i < plateaus.length; i++) {
    const before = plateaus[i - 1], after = plateaus[i];
    if (Math.abs(after.pitch - before.pitch) < 0.55 || Math.round(after.pitch) === Math.round(before.pitch)) continue;
    // Unobserved/unstable stretches use the vibrato-aware path below instead.
    if (data[after.from].time - (data[before.to]?.time ?? endSeconds) > 0.20) continue;
    const midpoint = (before.pitch + after.pitch) / 2;
    const direction = Math.sign(after.pitch - before.pitch);
    let boundary = Math.floor((before.from + before.to - 1) / 2) + 1;
    const limit = Math.floor((after.from + after.to - 1) / 2);
    while (boundary < limit && (pitches[boundary - first] - midpoint) * direction < 0) boundary++;
    if (boundary > first && boundary < last) boundaries.push(boundary);
  }
  return boundaries;
}

// Never smooth across silence/unknown. Median suppresses isolated octave errors;
// sustained changes form notes, whose pitch is averaged BEFORE semitone rounding.
export function smoothPitches(frames, endSeconds, smoothingMs, tempo, noteMode) {
  const data = frames.map(f => ({ ...f, origin: f.origin ?? 'detected' }));
  const onsetCorrections = [];
  if (!smoothingMs) return { data, onsetCorrections };
  const radius = smoothingMs / 2000;
  const hold = Math.min(smoothingMs * 0.00075, 60 / (tempo * 4) * 0.5);
  for (let first = 0; first < data.length;) {
    if (data[first].kind !== 'pitched') { first++; continue; }
    let last = first;
    while (last < data.length && data[last].kind === 'pitched' && (last === first || !data[last].breakBefore)) last++;
    const values = [], boundaryPitches = [];
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
      boundaryPitches.push(Math.abs(data[i].midi - median) >= 3 ? values.at(-1) : data[i].midi);
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
    const cuts = sustain ? plateauBoundaries(data, boundaryPitches, first, last, endSeconds, tempo) : [];
    // Each independently confirmed boundary limits pitch averaging and the
    // slow vibrato decision. No boundary is moved onto a beat by this stage.
    const regions = [first, ...cuts, last];
    for (let region = 0; region < regions.length - 1; region++) {
      const regionFirst = regions[region], regionLast = regions[region + 1];
      let onsetEnd = regionFirst + 1;
      while (onsetEnd < regionLast && data[onsetEnd].time - data[regionFirst].time < settleSeconds) onsetEnd++;
      const onsetCenter = sustain ? average(regionFirst, onsetEnd) : frames[regionFirst].midi;
      let start=regionFirst,pending=-1,pendingPitch=null;
      for(let i=regionFirst+1;i<regionLast;i++) {
        // At a phrase onset, forward-looking smoothing can start at a vibrato
        // crest. Sustain mode averages the onset; detail keeps its raw reference
        // to retain short notes before a full averaging window exists.
        const center = start === regionFirst && data[i].time-data[start].time < settleSeconds
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
      apply(start,regionLast);
    }
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
