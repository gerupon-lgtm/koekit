// 受け付け状態の表示（両アプリ共通・F-003）。文字を使わずマイクの発光・斜線・点滅で示す。
/**
 * @param {HTMLElement} stateEl マイク図形のラッパ（.mic-state）
 * @param {HTMLElement|null} stageEl 受け付け中に枠を光らせるステージ（任意）
 * @param {'listening'|'idle'|'denied'|'restarting'} state
 */
export function setMicState(stateEl, stageEl, state) {
  stateEl.classList.remove('listening', 'denied', 'restarting');
  if (stageEl) stageEl.classList.remove('listening', 'restarting');
  if (state === 'listening') { stateEl.classList.add('listening'); if (stageEl) stageEl.classList.add('listening'); }
  else if (state === 'restarting') { stateEl.classList.add('restarting'); if (stageEl) stageEl.classList.add('restarting'); }
  else if (state === 'denied') { stateEl.classList.add('denied'); }
  // 'idle' は全解除のみ
}
