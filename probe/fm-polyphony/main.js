import { ids, partsFor } from './config.js?v=v0.1.0-20261002214255-70753ad';
const $ = id => document.getElementById(id);
const assetURL = reference => { const url = new URL(reference, import.meta.url); url.search = new URL(import.meta.url).search; return url; };
const data = { schema: 'koekit-fm-polyphony-probe/1', createdAt: new Date().toISOString(), userAgent: navigator.userAgent, device: '', sampleRate: null, baseLatency: null, voices: ids, velocity: 70, gain: 0.08, rows: [], live: [], assumptions: ['CPU ratios measured in Worker, not realtime underruns', 'Listening verdict entered by user', 'No speech, humming, score drawing or drums', 'Held count excludes release tails; 16 slots per renderer'] };
let worker, context, node, generation = 0, busy = false, lastHeard, voicesPromise, currentLive, bassAudio;
const key = row => `${row.scenario}:${row.mode}:${row.count}`;
const condition = () => ({ scenario: $('scenario').value, count: Number($('count').value), mode: $('mode').value });
function refresh() {
  const current = condition(); $('results').replaceChildren();
  const visibleByCount = new Map(data.rows.filter(row => row.scenario === current.scenario && row.mode === current.mode).map(row => [row.count, row]));
  for (const live of data.live) if (live.scenario === current.scenario && live.mode === current.mode && live.status === 'completed' && !visibleByCount.has(live.count)) visibleByCount.set(live.count, live);
  const visible = [...visibleByCount.values()].sort((a, b) => a.count - b.count);
  for (const row of visible) {
    const tr = document.createElement('tr');
    const verdict = data.live.findLast(live => key(live) === key(row) && live.heard)?.heard ?? '未確認';
    for (const value of [row.count, row.averageRatio === undefined ? '未測定' : `${(row.averageRatio * 100).toFixed(0)}%`, row.p95Ratio === undefined ? '未測定' : `${(row.p95Ratio * 100).toFixed(0)}%`, verdict]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
    $('results').append(tr);
  }
  $('export').disabled = !(data.rows.length || data.live.length);
}
function lock(value) {
  busy = value;
  for (const id of ['measure', 'listen', 'scenario', 'count', 'mode']) $(id).disabled = value;
  $('stop').disabled = !value;
}
function status(text) { $('status').textContent = text; }
function loadVoices() {
  voicesPromise ??= Promise.all(Object.values(ids).map(async id => {
    const response = await fetch(assetURL(`./presets/${id}.json`));
    if (!response.ok) throw Error(`音色の読込失敗：${id}`);
    const preset = await response.json(); if (preset.status !== 'ready' || preset.id !== id) throw Error('音色データが不正');
    return [id, preset.voice];
  })).then(Object.fromEntries).catch(error => { voicesPromise = undefined; throw error; });
  return voicesPromise;
}
async function createContext() {
  if (!isSecureContext) throw Error('HTTPSまたはlocalhostで開いてください');
  const audio = new AudioContext({ latencyHint: 'interactive' });
  context = audio;
  if (!audio.audioWorklet) { await audio.close(); if (context === audio) context = undefined; throw Error('AudioWorkletに対応していません'); }
  await audio.resume();
  if (audio.state !== 'running') throw Error('音声を開始できませんでした');
  data.sampleRate = audio.sampleRate; data.baseLatency = audio.baseLatency ?? null;
  return audio;
}
async function stop(message = '停止しました。') {
  generation++; worker?.terminate(); worker = undefined;
  if (bassAudio) { bassAudio.pause(); bassAudio.removeAttribute('src'); bassAudio.load(); bassAudio = undefined; }
  if (currentLive?.status === 'started') currentLive.status = 'stopped'; currentLive = undefined;
  node?.port.postMessage({ type: 'stop' }); node?.disconnect(); node = undefined;
  const audio = context; context = undefined;
  lock(false); status(message); refresh();
  if (audio && audio.state !== 'closed') await audio.close().catch(() => {});
}
$('stop').onclick = () => stop();
for (const button of document.querySelectorAll('[data-bass]')) button.onclick = async () => {
  const token = generation + 1;
  // Start play in the button gesture while the previous AudioContext closes.
  void stop('ベース音色を準備しています…');
  if (token !== generation) return;
  $('heard').style.display = 'none'; lastHeard = undefined;
  const audio = new Audio(assetURL(`./samples/${button.dataset.bass}`));
  bassAudio = audio; lock(true);
  audio.onended = () => { if (token === generation) stop('ベースの試聴が終わりました。'); };
  audio.onerror = () => { if (token === generation) stop('ベース音源を読み込めませんでした。'); };
  try { await audio.play(); if (token === generation) status(`${button.textContent.replace('▶ ', '')}を鳴らしています。`); }
  catch (error) { if (token === generation) await stop(`試聴を開始できませんでした：${error.message}`); }
};
$('measure').onclick = async () => {
  if (busy) return; const token = ++generation; lock(true); status('処理時間を測っています…');
  try {
    const selected = condition(), audio = await createContext();
    const sampleRate = audio.sampleRate;
    await audio.close(); if (context === audio) context = undefined;
    const voices = await loadVoices(); if (token !== generation) return;
    worker = new Worker('./worker.js?v=v0.1.0-20261002214255-70753ad', { type: 'module' });
    const localWorker = worker;
    localWorker.onmessage = ({ data: message }) => {
      if (token !== generation) return;
      if (message.type === 'row') {
        data.rows = data.rows.filter(row => key(row) !== key(message.row)); data.rows.push(message.row);
        status(`${message.row.count}音の測定が終わりました。`); refresh();
      } else if (message.type === 'done') { localWorker.terminate(); worker = undefined; lock(false); status('測定完了。音数を選び、実際の音も確認してください。'); }
      else if (message.type === 'error') stop(`測定に失敗：${message.message}`);
    };
    localWorker.onerror = event => { if (token === generation) stop(`測定に失敗：${event.message}`); };
    localWorker.postMessage({ ...selected, sampleRate, voices });
  } catch (error) { if (token === generation) await stop(error.message); }
};
$('listen').onclick = async () => {
  if (busy) return; const token = ++generation; lock(true); $('heard').style.display = 'none'; lastHeard = undefined; status('音源を準備しています…');
  try {
    const selected = condition(), audio = await createContext();
    const voices = await loadVoices(); if (token !== generation) return;
    await audio.audioWorklet.addModule('./live-worklet.js?v=v0.1.0-20261002214255-70753ad'); if (token !== generation) return;
    const durationSeconds = Number(new URLSearchParams(location.search).get('testDuration')) === 2 ? 2 : 12;
    const live = { ...selected, requestedSeconds: durationSeconds, sampleRate: audio.sampleRate, status: 'started', heard: null };
    data.live.push(live); currentLive = live;
    const localNode = new AudioWorkletNode(audio, 'fm-polyphony-probe', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { parts: partsFor(selected.scenario, selected.count, voices), mode: selected.mode, durationSeconds } });
    node = localNode;
    localNode.port.onmessage = async ({ data: message }) => {
      if (token !== generation) return;
      if (message.type === 'ready') { status(`${selected.count}音を鳴らしています。音切れがあるか確認してください。`); }
      else if (message.type === 'done') {
        Object.assign(live, message, { status: message.reason });
        lastHeard = live; await stop('試聴が終わりました。聴いた結果を記録してください。');
        if (generation === token + 1 && message.reason === 'completed') $('heard').style.display = 'flex'; refresh();
      } else if (message.type === 'error') { live.status = 'error'; live.error = message.message; await stop(`発音に失敗：${message.message}`); refresh(); }
    };
    localNode.onprocessorerror = () => { if (token === generation) { live.status = 'error'; stop('音源処理に失敗しました。'); refresh(); } };
    localNode.connect(audio.destination);
  } catch (error) { if (token === generation) await stop(error.message); }
};
for (const [id, heard] of [['clean', '途切れなし'], ['glitch', '途切れあり']]) $(id).onclick = () => { if (lastHeard) { lastHeard.heard = heard; status(`「${heard}」を記録しました。`); refresh(); } };
for (const id of ['scenario', 'count', 'mode']) $(id).onchange = refresh;
$('export').onclick = () => {
  data.device = $('device').value.trim();
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'fm-polyphony-result.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.addEventListener('visibilitychange', () => { if (document.hidden && busy) stop('画面が隠れたため停止しました。'); });
window.addEventListener('pagehide', () => stop());
if (!isSecureContext || !globalThis.AudioContext) { status('HTTPSまたはlocalhostの対応ブラウザで開いてください。'); $('measure').disabled = $('listen').disabled = true; }
