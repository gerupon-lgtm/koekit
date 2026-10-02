import { createPerformanceAudioRenderer } from './runtime/fmopelab-dx7ii.mjs?v=v0.1.0-20261002161601-cabae06';
import { frameEvents } from './config.js?v=v0.1.0-20261002161601-cabae06';

class PolyphonyProbe extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { parts, mode, durationSeconds } = options.processorOptions;
    this.renderers = parts.map(part => createPerformanceAudioRenderer({ voice: part.voice, outputSampleRate: sampleRate, maxVoices: 16 }));
    this.buffers = parts.map(() => new Float32Array(128));
    this.events = frameEvents(parts, sampleRate, durationSeconds, mode);
    this.length = Math.round(durationSeconds * sampleRate);
    this.cursor = 0; this.eventIndex = 0; this.peak = 0; this.signalFrames = 0; this.done = false;
    this.port.onmessage = ({ data }) => { if (data.type === 'stop') this.finish('stopped'); };
    this.port.postMessage({ type: 'ready', sampleRate });
  }
  finish(reason) {
    if (this.done) return;
    this.done = true;
    this.renderers.forEach(renderer => renderer.reset());
    this.port.postMessage({ type: 'done', reason, renderedFrames: this.cursor, peak: this.peak, signalFrames: this.signalFrames, sampleRate });
  }
  process(_inputs, outputs) {
    const target = outputs[0]?.[0];
    if (!target) return true;
    target.fill(0);
    if (this.done) return false;
    try {
      for (let offset = 0; offset < target.length && this.cursor < this.length;) {
        while (this.eventIndex < this.events.length && this.events[this.eventIndex].frame === this.cursor) {
          const event = this.events[this.eventIndex++]; this.renderers[event.part].enqueue(event.intents);
        }
        const frames = Math.min(target.length - offset, this.length - this.cursor, (this.events[this.eventIndex]?.frame ?? this.length) - this.cursor);
        this.renderers.forEach((renderer, index) => {
          if (this.buffers[index].length < frames) this.buffers[index] = new Float32Array(frames);
          const part = this.buffers[index].subarray(0, frames); renderer.renderInto(part);
          for (let frame = 0; frame < frames; frame++) target[offset + frame] += part[frame] * 0.08;
        });
        for (let frame = 0; frame < frames; frame++) {
          const value = target[offset + frame];
          if (!Number.isFinite(value)) throw Error('Non-finite PCM');
          this.peak = Math.max(this.peak, Math.abs(value));
          if (Math.abs(value) > 1e-6) this.signalFrames++;
        }
        this.cursor += frames; offset += frames;
      }
      if (this.cursor >= this.length) this.finish('completed');
      return !this.done;
    } catch (error) {
      target.fill(0); this.port.postMessage({ type: 'error', message: error.message }); this.finish('error'); return false;
    }
  }
}
registerProcessor('fm-polyphony-probe', PolyphonyProbe);
