import { createPerformanceAudioRenderer } from './runtime/fmopelab-dx7ii.mjs?v=v0.1.0-20261002222541-da565ef';
import { counts, partsFor, frameEvents } from './config.js?v=v0.1.0-20261002222541-da565ef';

self.onmessage = ({ data }) => {
  try {
    const { voices, scenario, sampleRate, mode } = data;
    for (const count of counts) {
      const parts = partsFor(scenario, count, voices);
      // Warm a separate renderer so the measured sequence starts with fresh EG/phase.
      const warm = createPerformanceAudioRenderer({ voice: parts[0].voice, outputSampleRate: sampleRate, maxVoices: 16 });
      warm.enqueue([{ type: 'noteOn', note: 60, velocity: 70 }]);
      const warmBuffer = new Float32Array(128);
      for (let index = 0; index < 64; index++) warm.renderInto(warmBuffer);
      const renderers = parts.map(part => createPerformanceAudioRenderer({ voice: part.voice, outputSampleRate: sampleRate, maxVoices: 16 }));
      const buffers = parts.map(() => new Float32Array(128));
      const mixed = new Float32Array(128);
      const length = Math.round(sampleRate * 2), events = frameEvents(parts, sampleRate, 2, mode);
      let eventIndex = 0, peak = 0, signalFrames = 0, totalMs = 0;
      const times = [];
      for (let cursor = 0; cursor < length;) {
        const quantumFrames = Math.min(128, length - cursor);
        const started = performance.now();
        mixed.fill(0);
        for (let offset = 0; offset < quantumFrames;) {
          while (eventIndex < events.length && events[eventIndex].frame === cursor + offset) {
            const event = events[eventIndex++]; renderers[event.part].enqueue(event.intents);
          }
          const frames = Math.min(quantumFrames - offset, (events[eventIndex]?.frame ?? length) - cursor - offset);
          renderers.forEach((renderer, index) => {
            const target = buffers[index].subarray(0, frames);
            renderer.renderInto(target);
            for (let frame = 0; frame < frames; frame++) mixed[offset + frame] += target[frame] * 0.08;
          });
          offset += frames;
        }
        const elapsed = performance.now() - started;
        times.push(elapsed / (quantumFrames * 1000 / sampleRate)); totalMs += elapsed;
        for (let frame = 0; frame < quantumFrames; frame++) {
          if (!Number.isFinite(mixed[frame])) throw Error('Non-finite PCM');
          peak = Math.max(peak, Math.abs(mixed[frame]));
          if (Math.abs(mixed[frame]) > 1e-6) signalFrames++;
        }
        cursor += quantumFrames;
      }
      if (!signalFrames || peak >= 1) throw Error('Silence or clipped mix');
      times.sort((a, b) => a - b);
      self.postMessage({ type: 'row', row: { count, scenario, mode, sampleRate, durationSeconds: 2, totalMs, averageRatio: totalMs / 2000, p95Ratio: times[Math.floor(times.length * 0.95)], maxRatio: times.at(-1), peak, signalFrames, rendererCount: parts.length, rendererSlots: 16, blockFrames: 128, measuredOn: 'browser dedicated Worker, not AudioWorklet' } });
    }
    self.postMessage({ type: 'done' });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
