import { microphoneEnabled, setMicrophoneEnabled, onMicrophoneChange } from '../speech/microphone.js';
import { setMicState } from './micstate.js';

const mics = [...document.querySelectorAll('.mic-state')];
function refresh() {
  for (const mic of mics) setMicState(mic, mic.id === 'mic-state' ? document.querySelector('#stage') : null, mic.dataset.micState || 'idle');
  if (!microphoneEnabled()) document.querySelector('#stage')?.classList.remove('listening', 'restarting');
}
for (const mic of mics) {
  mic.addEventListener('click', event => {
    event.stopPropagation();
    setMicrophoneEnabled(!microphoneEnabled());
  });
}
onMicrophoneChange(refresh);
refresh();
