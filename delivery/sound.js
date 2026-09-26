// Delivery-only synthesized effects. No microphone, downloaded audio or BGM.
const n = (frequency, at, duration, gain = .09, type = 'sine') => ({ frequency, at, duration, gain, type });
export function scoreFor(event, alternate = false) {
  switch (event) {
    case 'move': return [n(alternate ? 620 : 830, 0, .075, .055, 'triangle'), n(alternate ? 440 : 620, .055, .055, .035)];
    case 'pickup': return [n(659, 0, .11), n(988, .08, .15)];
    case 'delivery': return [n(784, 0, .16), n(1047, .09, .22), n(523, .09, .20, .055)];
    case 'failure': return [n(392, 0, .18, .07), n(294, .14, .24, .07)];
    // Includes the final delivery landing: callers choose clear OR delivery.
    case 'clear': return [n(784, 0, .14), n(1047, .10, .18), n(659, .25, .16), n(784, .39, .16), n(1047, .53, .28), n(523, .53, .28, .045)];
    case 'award': return [n(523, 0, .16), n(659, .13, .16), n(784, .26, .18), n(1047, .43, .21), n(1175, .61, .16), n(1047, .78, .38), n(659, .78, .38, .045), n(784, .78, .38, .045)];
    default: return [];
  }
}
export const scoreDuration = score => Math.ceil(Math.max(0, ...score.map(note => note.at + note.duration + .02)) * 1000);

export class DeliverySound {
  constructor({ contextFactory = () => {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    return Audio ? new Audio() : null;
  } } = {}) {
    this.contextFactory = contextFactory;
    this.context = null;
    this.playing = new Set();
    this.alternate = false;
  }
  /** Call during the first touch gesture. Rejection keeps the game playable. */
  async prime() {
    try {
      this.context ||= this.contextFactory();
      if (this.context?.state === 'suspended') await this.context.resume();
      return this.context?.state === 'running';
    } catch { return false; }
  }
  /** Returns milliseconds including the release tail, even without audio. */
  play(event) {
    const score = scoreFor(event, this.alternate);
    if (event === 'move') this.alternate = !this.alternate;
    const duration = scoreDuration(score);
    const ac = this.context;
    if (!ac || ac.state !== 'running') return duration;
    try {
      const origin = ac.currentTime;
      for (const note of score) {
        const source = ac.createOscillator(), gain = ac.createGain();
        const start = origin + note.at, end = start + note.duration;
        const entry = { source, gain };
        this.playing.add(entry);
        source.addEventListener('ended', () => {
          this.playing.delete(entry);
          source.disconnect(); gain.disconnect();
        }, { once: true });
        source.type = note.type;
        source.frequency.setValueAtTime(note.frequency, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(note.gain, start + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, end);
        source.connect(gain); gain.connect(ac.destination);
        source.start(start); source.stop(end + .02);
      }
    } catch { this.stopAll(); }
    return duration;
  }
  /** Stops active AND future scheduled oscillators, silencing their gains now. */
  stopAll() {
    for (const { source, gain } of this.playing) {
      try { gain.gain.cancelScheduledValues(0); gain.gain.setValueAtTime(0, this.context.currentTime); } catch {}
      try { source.stop(); } catch {}
      try { source.disconnect(); gain.disconnect(); } catch {}
    }
    this.playing.clear();
    this.alternate = false;
  }
}
