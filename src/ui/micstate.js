// 音声受付区間と利用者のON/OFF設定を合わせて表示する。
import { microphoneEnabled } from '../speech/microphone.js';
/**
 * @param {HTMLElement} stateEl マイク図形のラッパ（.mic-state）
 * @param {HTMLElement|null} stageEl 受け付け中に枠を光らせるステージ（任意）
 * @param {'listening'|'idle'|'denied'|'restarting'} state
 */
export function setMicState(stateEl, stageEl, state) {
  stateEl.dataset.micState = state;
  const enabled = microphoneEnabled();
  const labels = { listening: '音声受付中', idle: '音声受付は休止中', denied: '音声を使えません。タッチで操作できます', restarting: '音声認識を再開中' };
  stateEl.setAttribute('aria-label', enabled ? `マイク：オン。${labels[state] || labels.idle}。タップでオフ` : 'マイク：オフ。タップでオン');
  stateEl.setAttribute('aria-pressed', String(enabled));
  stateEl.classList.toggle('muted', !enabled);
  if (!enabled) state = 'idle';
  stateEl.classList.remove('listening', 'denied', 'restarting');
  if (stageEl) stageEl.classList.remove('listening', 'restarting');
  if (state === 'listening') { stateEl.classList.add('listening'); if (stageEl) stageEl.classList.add('listening'); }
  else if (state === 'restarting') { stateEl.classList.add('restarting'); if (stageEl) stageEl.classList.add('restarting'); }
  else if (state === 'denied') { stateEl.classList.add('denied'); }
  document.dispatchEvent(new Event('koekit-mic-state'));
  // 'idle' は全解除のみ
}
