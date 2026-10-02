import { ProbeTransport } from '../saezuri/audio.js?v=v0.1.0-20261002214255-70753ad';
import { AudioMixer } from '../saezuri/volume.js?v=v0.1.0-20261002214255-70753ad';
import { lightVoiceStats, stopLightVoices } from '../saezuri/light-voice.js?v=v0.1.0-20261002214255-70753ad';
import { accompanimentEvents } from '../../saezuri/music/accompaniment.js?v=v0.1.0-20261002214255-70753ad';
const $ = id => document.getElementById(id);
const engines = { light: '軽い音', simple: 'さらに軽い音', classic: '今の音' };
const records = [], build = new URL(import.meta.url).searchParams.get('v');
let context, transport, busy = false, generation = 0, current, lastHeard;
function lock(value) {
  busy = value;
  for (const id of ['listen', 'engine', 'scenario', 'mode', 'seconds']) $(id).disabled = value;
  $('count').disabled = value || $('mode').value === 'song';
  $('stop').disabled = !value;
  updateLinks();
}
function updateLinks() { $('try-app').href = `../saezuri/${$('engine').value === 'classic' ? '' : '?sound=' + $('engine').value}`; }
function refresh() {
  $('export').disabled = !records.length;
  $('results').replaceChildren(...records.slice(-12).reverse().map(row => {
    const item = document.createElement('p');
    item.textContent = `${engines[row.engine]}・${row.audition ?? row.scenario}・${row.count ?? '進行'}音：${row.status}／${row.heard === null ? '未評価' : row.heard ? '途切れなし' : '途切れあり'}`;
    return item;
  }));
}
function stop(message = '停止しました。', reason = 'stopped') {
  generation++; transport?.stop(false); transport = undefined;
  if (context) stopLightVoices(context);
  if (current) { current.status = reason; current.finishedAt = new Date().toISOString(); current = undefined; }
  const owned = context; context = undefined;
  lock(false); $('status').textContent = message; refresh();
  if (owned && owned.state !== 'closed') void owned.close().catch(() => {});
}
function stress({ count, scenario, mode, seconds }) {
  const events = [], secondsPerTick = .125, steps = mode === 'held' ? 1 : Math.ceil(seconds / .5), gain = Math.min(.08, .65 / count);
  for (let step = 0; step < steps; step++) for (let i = 0; i < count; i++) {
    const part = scenario !== 'mixed' ? scenario : i === 0 ? 'piano' : i === 1 ? 'soft' : 'piano';
    const midi = scenario === 'soft' || scenario === 'mixed' && i === 1 ? 48 : scenario !== 'mixed' ? 60 + [0, 4, 7, 12][i % 4] : i === 0 ? 72 : [60, 64, 67][(i - 2) % 3];
    events.push({ startTick: step * 4, durationTick: mode === 'held' ? seconds / secondsPerTick : 2.8, midi, instrument: part, gain, velocity: 70 });
  }
  return { notes: [], accompaniment: events, totalTicks: seconds / secondsPerTick, tempo: 120, gain };
}
function song(seconds) {
  const pattern = { bars: 4, notes: [], key: { mode: 'minor', tonicPitchClass: 9 }, accompaniment: { enabled: true, genre: 'pop', rhythm: 'quarters', progression: 'pop', sounds: { chord: 'piano', bass: 'soft', drums: 'acoustic' } } };
  const base = accompanimentEvents(pattern), cycles = Math.ceil(seconds / 8), accompaniment = [], notes = [];
  for (let cycle = 0; cycle < cycles; cycle++) {
    accompaniment.push(...base.map(note => ({ ...note, startTick: note.startTick + cycle * 64 })));
    [69, 72, 76, 72, 69, 65, 64, 67].forEach((midi, i) => notes.push({ midi, startTick: cycle * 64 + i * 8, durationTick: 6 }));
  }
  return { notes, accompaniment, totalTicks: cycles * 64, tempo: 120, countSound: true };
}
function audition(instrument) {
  return { notes: [], tempo: 120, totalTicks: 56, accompaniment: [0, 4, 7].map((offset, i) => ({ midi: (instrument === 'soft' ? 48 : 60) + offset, startTick: i * 16, durationTick: 8, instrument, gain: .12, velocity: 70 })) };
}
async function listen(sample) {
  // Changing sample uses the same stop; no stale preparation can start later.
  if (busy && !sample) return;
  stop('音の準備中…'); const token = generation;
  $('heard').hidden = true; lastHeard = undefined; lock(true);
  const selected = { engine: $('engine').value, scenario: $('scenario').value, mode: $('mode').value, count: Number($('count').value), seconds: Number($('seconds').value) };
  if (new URLSearchParams(location.search).get('testDuration') === '1') selected.seconds = 1;
  const row = { ...selected, audition: sample ?? null, startedAt: new Date().toISOString(), status: 'started', heard: null };
  if (sample || selected.mode === 'song') row.count = null;
  try {
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    if (!Audio) throw new Error('このブラウザで音声を開始できません');
    const audio = new Audio({ latencyHint: 'interactive' }); context = audio;
    await audio.resume();
    if (token !== generation) { if (audio.state !== 'closed') await audio.close(); return; }
    if (audio.state !== 'running') throw new Error('音声を開始できません');
    row.sampleRate = audio.sampleRate; row.baseLatency = audio.baseLatency ?? null;
    const phrase = sample ? audition(sample) : selected.mode === 'song' ? song(selected.seconds) : stress(selected);
    row.musicalSeconds = phrase.totalTicks * 60 / phrase.tempo / 4; row.gain = phrase.gain ?? null;
    const mix = new AudioMixer(audio), local = new ProbeTransport(audio, (reason, metrics) => {
      if (token !== generation) return;
      row.metrics = metrics; row.voices = selected.engine === 'classic' ? null : lightVoiceStats(audio);
      const completed = reason === 'ENDED';
      stop(completed ? '聴いた結果を記録してください。' : `停止しました：${reason}`, completed ? 'completed' : reason);
      if (completed) { lastHeard = row; $('heard').hidden = false; }
    }, mix, { engine: selected.engine });
    transport = local; current = row; records.push(row); refresh();
    audio.addEventListener('statechange', () => { if (token === generation && audio.state !== 'running') stop('音声が中断しました。もう一度開始してください。', 'interrupted'); });
    local.start(phrase.notes, { ...phrase, instrument: 'piano', lead: .3 });
    $('status').textContent = `${engines[selected.engine]}を鳴らしています。`;
  } catch (error) { if (token === generation) stop(`発音できません：${error.message}`, 'error'); }
}
$('listen').onclick = () => listen(); $('stop').onclick = () => stop();
for (const button of document.querySelectorAll('[data-audition]')) button.onclick = () => listen(button.dataset.audition);
for (const [id, heard] of [['clean', true], ['glitch', false]]) $(id).onclick = () => {
  if (!lastHeard || lastHeard.status !== 'completed') return;
  lastHeard.heard = heard; lastHeard.evaluatedAt = new Date().toISOString(); refresh(); $('heard').hidden = true;
  $('status').textContent = '記録しました。音源を切り替えて聴きくらべられます。';
};
$('mode').onchange = () => lock(busy); $('engine').onchange = updateLinks;
$('close').onclick = () => stop(); $('try-app').onclick = () => stop();
document.addEventListener('visibilitychange', () => { if (document.hidden) { stop('画面が隠れたので停止しました。', 'hidden'); $('heard').hidden = true; lastHeard = undefined; } });
window.addEventListener('pagehide', () => stop());
$('export').onclick = () => {
  const data = { schemaVersion: 1, test: 'saezuri-native-sound', build, device: $('device').value.trim(), userAgent: navigator.userAgent, exportedAt: new Date().toISOString(), records };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), link = document.createElement('a');
  link.href = url; link.download = 'saezuri-light-sound-result.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
lock(false);
