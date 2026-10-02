// Trial voices: native Web Audio only. No rendered notes, samples or DX presets.
export const LIGHT_ENGINES = ['light', 'simple'];
const presets = {
  piano: { wave: 'sine', attack: .006, decay: .8, sustain: .035, release: .42, ratio: 3, depth: .9, modDecay: .18 },
  wood: { wave: 'sine', attack: .004, decay: .34, sustain: .012, release: .3, ratio: 2.01, depth: 1.15, modDecay: .14 },
  soft: { wave: 'triangle', attack: .018, decay: .3, sustain: .62, release: .22, cutoff: 5 },
  sine: { wave: 'sine', attack: .012, decay: 1.2, sustain: .4, release: .2 },
  lead: { wave: 'sawtooth', attack: .012, decay: .22, sustain: .72, release: .18, cutoff: 5 },
};
const owners = new WeakMap();
export function lightVoiceStats(ctx) {
  const state = owners.get(ctx);
  return { active: state?.voices.size ?? 0, maxActive: state?.maxActive ?? 0, maxOscillators: state?.maxOscillators ?? 0 };
}
export function stopLightVoices(ctx) { for (const voice of [...(owners.get(ctx)?.voices ?? [])]) voice.stop(); }
function heldLevel(t, peak, preset) {
  if (t <= 0) return 0;
  if (t < preset.attack) return peak * t / preset.attack;
  return peak * (preset.sustain + (1 - preset.sustain) * Math.exp(-(t - preset.attack) / preset.decay));
}
export function createLightVoice(ctx, output, { midi, time = ctx.currentTime, duration, instrument = 'piano', gain = .16, velocity = 70, engine = 'light' }) {
  const preset = presets[instrument];
  if (!preset) throw new Error('INSTRUMENT_UNKNOWN');
  if (!LIGHT_ENGINES.includes(engine)) throw new Error('VOICE_ENGINE_UNKNOWN');
  if (!Number.isFinite(midi) || midi < 0 || midi > 127 || !Number.isFinite(time) || !Number.isFinite(gain) || gain < 0 || !Number.isFinite(velocity) || velocity < 1 || velocity > 127 || (duration !== undefined && (!Number.isFinite(duration) || duration <= 0))) throw new Error('VOICE_INVALID');
  time = Math.max(ctx.currentTime, time);
  const frequency = 440 * 2 ** ((midi - 69) / 12), peak = gain * (velocity / 70) ** .8;
  const envelope = ctx.createGain(), carrier = ctx.createOscillator(), nodes = [carrier, envelope], oscillators = [carrier];
  carrier.type = engine === 'simple' && instrument === 'piano' ? 'triangle' : preset.wave;
  carrier.frequency.setValueAtTime(frequency, time);
  let path = carrier;
  if (preset.cutoff || engine === 'simple' && instrument === 'piano') {
    const filter = ctx.createBiquadFilter(), cutoff = preset.cutoff ?? 6;
    filter.type = 'lowpass'; filter.Q.value = .55;
    const high = Math.min(ctx.sampleRate * .4, frequency * cutoff), low = Math.min(high, frequency * (instrument === 'soft' ? 2.5 : 3));
    filter.frequency.setValueAtTime(high, time); filter.frequency.setTargetAtTime(low, time + preset.attack, .15);
    carrier.connect(filter); path = filter; nodes.push(filter);
  }
  if (engine === 'light' && preset.ratio && frequency * preset.ratio < ctx.sampleRate * .35) {
    const modulator = ctx.createOscillator(), modulation = ctx.createGain();
    modulator.type = 'sine'; modulator.frequency.setValueAtTime(frequency * preset.ratio, time);
    const depth = frequency * preset.depth * Math.min(1, ctx.sampleRate * .12 / (frequency * (1 + preset.ratio))) * Math.min(1.3, velocity / 70);
    modulation.gain.setValueAtTime(0, time); modulation.gain.linearRampToValueAtTime(depth, time + preset.attack);
    modulation.gain.setTargetAtTime(depth * .025, time + preset.attack, preset.modDecay);
    modulator.connect(modulation).connect(carrier.frequency);
    oscillators.push(modulator); nodes.push(modulator, modulation);
  }
  path.connect(envelope).connect(output);
  envelope.gain.setValueAtTime(0, time); envelope.gain.linearRampToValueAtTime(peak, time + preset.attack);
  envelope.gain.setTargetAtTime(peak * preset.sustain, time + preset.attack, preset.decay);
  let released = false, cleaned = false, ended = 0;
  const state = owners.get(ctx) ?? { voices: new Set(), maxActive: 0, maxOscillators: 0 };
  owners.set(ctx, state);
  const cleanup = () => { if (cleaned) return; cleaned = true; for (const node of nodes) node.disconnect(); state.voices.delete(voice); };
  const voice = {
    endTime: Infinity, oscillatorCount: oscillators.length,
    release(at = ctx.currentTime) {
      if (released || cleaned) return; released = true;
      const off = Math.max(time, at), value = heldLevel(off - time, peak, preset), end = off + preset.release;
      voice.endTime = end + .005;
      // Analytic hold also works on browsers without cancelAndHoldAtTime.
      envelope.gain.cancelScheduledValues(off);
      if (off < time + preset.attack) envelope.gain.linearRampToValueAtTime(value, off);
      else envelope.gain.setValueAtTime(value, off);
      envelope.gain.setTargetAtTime(0, off, preset.release / 6);
      envelope.gain.setValueAtTime(value * Math.exp(-6 * (preset.release - .005) / preset.release), end - .005);
      envelope.gain.linearRampToValueAtTime(0, end);
      for (const oscillator of oscillators) oscillator.stop(voice.endTime);
    },
    stop() { if (cleaned) return; cleanup(); for (const oscillator of oscillators) { try { oscillator.stop(ctx.currentTime); } catch {} } },
  };
  for (const oscillator of oscillators) { oscillator.onended = () => { if (++ended === oscillators.length) cleanup(); }; oscillator.start(time); }
  state.voices.add(voice); state.maxActive = Math.max(state.maxActive, state.voices.size);
  state.maxOscillators = Math.max(state.maxOscillators, [...state.voices].reduce((sum, item) => sum + item.oscillatorCount, 0));
  if (duration !== undefined) voice.release(time + duration);
  return voice;
}
