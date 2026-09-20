// 全作品共通の利用者設定。受付区間の開始・停止とは独立させる。
const KEY = 'koekit.microphone.enabled';
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== 'false'; } catch { /* メモリで継続 */ }
const listeners = new Set();
export const microphoneEnabled = () => enabled;
export function onMicrophoneChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setMicrophoneEnabled(value) {
  enabled = Boolean(value);
  try { localStorage.setItem(KEY, String(enabled)); } catch { /* メモリで継続 */ }
  for (const fn of [...listeners]) fn(enabled);
}
globalThis.addEventListener?.('storage', event => {
  if (event.key !== KEY && event.key !== null) return;
  const next = event.newValue !== 'false';
  if (next === enabled) return;
  enabled = next;
  for (const fn of [...listeners]) fn(enabled);
});
