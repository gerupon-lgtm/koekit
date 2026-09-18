// レベル境界の音声受付。効果音中は停止し、移動時に予約を取り消す。
import { PHASES } from '../game/phase.js';

export class LevelNavigation {
  constructor() { this.timer = null; this.quietUntil = 0; }
  cancel() { clearTimeout(this.timer); this.timer = null; }
  afterSound(ms = 750) { this.quietUntil = performance.now() + ms; }
  listen(phase, nextPhase) {
    this.cancel();
    phase.to(PHASES.RESULT);
    const delay = this.quietUntil - performance.now();
    if (delay > 0) this.timer = setTimeout(() => phase.to(nextPhase), delay);
    else phase.to(nextPhase);
  }
}
