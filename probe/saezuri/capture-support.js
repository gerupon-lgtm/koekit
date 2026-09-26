// Local synthesis and analysis helpers; no samples or device settings leave the page.
export function captureTiming({ anchor, tempo, sampleRate, baseLatency, outputLatency, inputLatency, manualMs = 0, audibleCount = true }) {
  const known = value => Number.isFinite(value) && value >= 0 ? value : 0;
  const estimatedLatencySeconds = (audibleCount ? known(baseLatency) + known(outputLatency) : 0) + known(inputLatency);
  const correctionSeconds = Math.max(-0.2, Math.min(1, estimatedLatencySeconds + manualMs / 1000));
  const beat = 60 / tempo, musicalStart = anchor + 8 * beat;
  const startFrame = Math.round((musicalStart + correctionSeconds) * sampleRate);
  return { musicalStart, startFrame, endFrame: startFrame + Math.round(16 * beat * sampleRate), correctionSeconds, estimatedLatencySeconds,
    countTimes: Array.from({ length: 24 }, (_, i) => anchor + i * beat) };
}

// A short, noise-like high-band shaker. All spectral components are above the
// detector's voice band. Speaker nonlinearities can still produce lower energy.
export function shakerSamples(sampleRate, accent = false) {
  const size = Math.round(sampleRate * 0.025), buffer = new Float32Array(size);
  const low = Math.min(6500, sampleRate * 0.30), high = Math.min(10500, sampleRate * 0.44);
  let seed = 7243;
  for (let n = 0; n < 48; n++) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const frequency = low + (high - low) * seed / 2 ** 32;
    seed = (1664525 * seed + 1013904223) >>> 0;
    const phase = 2 * Math.PI * seed / 2 ** 32;
    for (let i = 0; i < size; i++) buffer[i] += Math.sin(2 * Math.PI * frequency * i / sampleRate + phase);
  }
  let peak = 0;
  for (let i = 0; i < size; i++) {
    buffer[i] *= Math.sin(Math.PI * i / (size - 1)) ** 2;
    peak = Math.max(peak, Math.abs(buffer[i]));
  }
  for (let i = 0; i < size; i++) buffer[i] *= (accent ? 0.13 : 0.09) / peak;
  return buffer;
}

// Symmetric FIR, evaluated around each sample (no artificial time shift).
// Filter the count's upper band before both energy gating and pitch estimation.
export function filterCaptureSamples(samples, sampleRate) {
  const half = 48, cutoff = Math.min(3000 / sampleRate, 0.4), kernel = [];
  let sum = 0;
  for (let j = -half; j <= half; j++) {
    const sinc = j ? Math.sin(2 * Math.PI * cutoff * j) / (Math.PI * j) : 2 * cutoff;
    const window = 0.42 + 0.5 * Math.cos(Math.PI * j / half) + 0.08 * Math.cos(2 * Math.PI * j / half);
    kernel.push(sinc * window); sum += sinc * window;
  }
  const result = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let value = 0;
    for (let j = -half; j <= half; j++) value += (samples[i + j] ?? 0) * kernel[j + half];
    result[i] = value / sum;
  }
  return result;
}

const shakerBuffers = new WeakMap();
export function scheduleShaker(ctx, time, accent = false) {
  if (!shakerBuffers.has(ctx)) shakerBuffers.set(ctx, new Map());
  const cache = shakerBuffers.get(ctx);
  if (!cache.has(accent)) {
    const data = shakerSamples(ctx.sampleRate, accent);
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.copyToChannel(data, 0); cache.set(accent, buffer);
  }
  const buffer = cache.get(accent);
  const node = ctx.createBufferSource(); node.buffer = buffer; node.connect(ctx.destination);
  node.start(time); node.onended = () => node.disconnect();
  return () => { try { node.stop(); } catch {} node.disconnect(); };
}

export function alignCaptureStart(pattern, tempo) {
  const ticks = pattern.notes[0]?.startTick || 0, seconds = ticks * 60 / (tempo * 4);
  return { ...structuredClone(pattern), notes: pattern.notes.map(note => ({ ...note, startTick: note.startTick - ticks,
    completedRanges: (note.completedRanges || []).map(r => ({start:Math.max(0,r.start-seconds),end:Math.max(0,r.end-seconds)})) })) };
}
