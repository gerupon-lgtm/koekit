// ML-T01 only: locally synthesized comparison voices, not approved instrument assets.
import { tickSeconds } from '../../saezuri/document.js';
export function scheduleVoice(ctx, output, { midi, time, duration, instrument = 'piano', gain = 0.16 }) {
  const harmonics = { sine: [1], piano: [1, 0.35, 0.16, 0.08], wood: [1, 0, 0.12], soft: [1, 0.12, 0.04] }[instrument];
  if (!harmonics) throw new Error('INSTRUMENT_UNKNOWN');
  const envelope = ctx.createGain();
  envelope.connect(output);
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(gain, time + 0.008);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, gain * (instrument === 'wood' ? 0.02 : 0.25)), time + Math.max(0.016, duration));
  envelope.gain.linearRampToValueAtTime(0, time + duration + 0.06);
  const oscillators = harmonics.map((amplitude, i) => {
    if (!amplitude) return null;
    const oscillator = ctx.createOscillator(), level = ctx.createGain();
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12) * (i + 1);
    level.gain.value = amplitude / harmonics.reduce((a,b) => a+b,0);
    oscillator.connect(level).connect(envelope);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.065);
    oscillator.onended = () => { oscillator.disconnect(); level.disconnect(); };
    return oscillator;
  }).filter(Boolean);
  const last = oscillators.at(-1), cleanup = last.onended;
  last.onended = () => { cleanup(); envelope.disconnect(); };
  return () => { envelope.disconnect(); for (const node of oscillators) { try { node.stop(); } catch {} } };
}

export class ProbeTransport {
  constructor(ctx, onStop) { this.ctx = ctx; this.onStop = onStop; this.serial = 0; this.voices = new Set(); this.active = false; }
  start(notes, { tempo = 120, totalTicks = 64, instrument = 'piano', lead = 0.35, ahead = 0.15 } = {}) {
    this.stop(false);
    if (this.ctx.state !== 'running') throw new Error('AUDIO_NOT_READY');
    const serial = this.serial;
    this.anchor = this.ctx.currentTime + lead;
    this.tempo = tempo;
    this.totalTicks = totalTicks;
    this.active = true;
    this.metrics = { events: 0, maxTimerGapMs: 0, aheadMs: ahead * 1000, leadMs: lead * 1000 };
    const queue = [...notes].sort((a,b) => a.startTick - b.startTick);
    let index = 0, previous = performance.now();
    const pump = () => {
      if (serial !== this.serial) return;
      const wall = performance.now();
      this.metrics.maxTimerGapMs = Math.max(this.metrics.maxTimerGapMs, wall - previous);
      previous = wall;
      const now = this.ctx.currentTime;
      for (const voice of this.voices) if (voice.end < now) this.voices.delete(voice);
      if (this.ctx.state !== 'running') return this.stop(true, 'AUDIO_INTERRUPTED');
      while (index < queue.length) {
        const note = queue[index], time = this.anchor + tickSeconds(note.startTick, tempo);
        if (time > now + ahead) break;
        if (time < now - 0.04) return this.stop(true, 'SCHEDULER_LATE');
        const duration = tickSeconds(note.durationTick, tempo);
        const stop = scheduleVoice(this.ctx, this.ctx.destination, { midi: note.midi, time: Math.max(now, time), duration, instrument });
        this.voices.add({ stop, end: time + duration + 0.07 });
        index++; this.metrics.events++;
      }
      if (now >= this.anchor + tickSeconds(totalTicks, tempo) + 0.08) this.stop(true, 'ENDED');
    };
    this.timer = setInterval(pump, 25);
    pump();
  }
  position() { return this.active ? Math.max(0, Math.min(this.totalTicks, (this.ctx.currentTime - this.anchor) * this.tempo * 4 / 60)) : 0; }
  stop(notify = true, reason = 'STOPPED') {
    this.serial++;
    clearInterval(this.timer);
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    const wasActive = this.active;
    this.active = false;
    if (notify && wasActive) this.onStop?.(reason, this.metrics);
  }
}
