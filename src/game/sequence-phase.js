import { PhaseMachine } from './phase.js';
export const SEQUENCE_PHASES = { ANSWER: 'sequence_answer', CONFIRM: 'sequence_confirm' };
// 既存の位置選択では「言い直し」、順番だけで「列への追加」を受け付ける。
export class SequencePhase extends PhaseMachine {
  get allowed() {
    if (this.phase === SEQUENCE_PHASES.ANSWER) return [...this._levelVocab, 'undo', 'clearAnswer', 'quit'];
    if (this.phase === SEQUENCE_PHASES.CONFIRM) return ['confirm', 'undo', 'clearAnswer', 'quit'];
    return super.allowed;
  }
}
