// Persistent action cues. Controllers supply only commands accepted in their current phase.
import { microphoneEnabled, onMicrophoneChange } from '../speech/microphone.js';
const guides = new Map();
function paint(el, { word, action, touch }) {
  const state = document.getElementById('mic-state')?.dataset.micState;
  const canSpeak = microphoneEnabled() && state !== 'denied' && state !== 'restarting';
  const primary = word && canSpeak ? `「${word}」` : word ? touch : action;
  const detail = word && canSpeak ? action : word ? 'タッチで すすめるよ' : '';
  // Do not repeatedly announce an unchanged cue during board redraws or mic updates.
  const key = `${primary}|${detail}`;
  if (el.dataset.guideText === key) return;
  el.dataset.guideText = key;
  el.dataset.voiceWord = word || '';
  el.dataset.input = word && !canSpeak ? 'touch' : 'voice';
  el.replaceChildren();
  const strong = document.createElement('strong'); strong.textContent = primary;
  const span = document.createElement('span'); span.textContent = detail;
  el.append(strong, span);
}
export function setVoiceGuide(el, word = '', action = '', touch = 'ボタンを タッチ') {
  if (!el) return;
  el.classList.add('voice-guide'); el.setAttribute('role', 'status'); el.setAttribute('aria-atomic', 'true');
  const cue = { word, action, touch }; guides.set(el, cue); paint(el, cue);
}
function refresh() { for (const [el, cue] of guides) { if (el.isConnected) paint(el, cue); else guides.delete(el); } }
onMicrophoneChange(refresh);
document.addEventListener('koekit-mic-state', refresh);
export function labelVoiceButton(el, label) {
  if (!el) return;
  let span = el.querySelector('.voice-button-label');
  if (!span) { span = document.createElement('span'); span.className = 'voice-button-label'; span.setAttribute('aria-hidden', 'true'); el.append(span); }
  span.textContent = label; el.classList.add('voice-labeled');
}
function host(id, before) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.id = id; before?.before(el); }
  return el;
}
// Pitarhythm and both Memorhythm modes share the same phase vocabulary.
export function updatePhaseGuide(phase) {
  const game = host('game-voice-guide', document.querySelector('#game .controls'));
  const cert = host('cert-voice-guide', document.getElementById('cert-next'));
  const intro = document.querySelector('.intro-voice-hint');
  setVoiceGuide(intro, phase === 'await_intro' ? 'オッケー' : '', phase === 'await_intro' ? 'で はじめる' : 'じゅんびちゅう', '✓ を タッチ');
  setVoiceGuide(cert, phase === 'await_next' ? 'つぎ' : '', phase === 'await_next' ? 'で すすむ' : 'みていてね', 'つぎ を タッチ');
  const cues = {
    await_start: ['スタート', 'で はじめる', 'スタート を タッチ'],
    await_stop: ['ストップ', 'で とめる', 'ストップ を タッチ'],
    await_confirm: ['オッケー', 'で きめる', 'オッケー を タッチ'],
    await_result_next: ['つぎ', 'で すすむ', 'つぎ を タッチ'],
    await_position: ['', 'ばしょを えらぼう'],
    sequence_answer: ['', 'ばしょを じゅんばんに えらぼう'],
    sequence_confirm: ['オッケー', 'で こたえる', 'オッケー を タッチ'],
  };
  setVoiceGuide(game, ...(cues[phase] || ['', 'みていてね']));
  labelVoiceButton(document.getElementById('spin-btn'), phase === 'await_stop' ? 'ストップ' : 'スタート');
  labelVoiceButton(document.getElementById('next-btn'), phase === 'await_result_next' ? 'つぎ' : 'スタート');
  labelVoiceButton(document.getElementById('confirm-btn'), 'オッケー');
  labelVoiceButton(document.getElementById('cert-next'), 'つぎ');
  labelVoiceButton(document.getElementById('intro-go'), 'オッケー');
}
