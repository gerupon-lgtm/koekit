import { proposeNote, commitNote, undo } from '../../saezuri/document.js';
import { microphoneEnabled, setMicrophoneEnabled, onMicrophoneChange } from '../../src/speech/microphone.js';
import { ProbeTransport } from './audio.js';
import { ProbeCapture } from './capture.js';
import { renderScore, pitchName } from './score.js';
import { alignCaptureStart } from './capture-support.js';
import { inferSignature, signature } from './key-signature.js';
const $ = id => document.getElementById(id);
const example = () => ({ bars: 4, gridStep: 1, notes: [
  { id: 'low', midi: 48, startTick: 0, durationTick: 4 },
  { id: 'short', midi: 61, startTick: 6, durationTick: 1 },
  { id: 'repeat-a', midi: 64, startTick: 8, durationTick: 2 },
  { id: 'repeat-b', midi: 64, startTick: 10, durationTick: 2 },
  { id: 'tie', midi: 67, startTick: 14, durationTick: 6 },
  { id: 'high', midi: 96, startTick: 24, durationTick: 4 },
  { id: 'end', midi: 60, startTick: 48, durationTick: 16 },
] });
let state = { pattern: example(), cursor: 0, revision: 0 }, candidate = null, captured = null, capturedOriginal = null;
let ctx, transport, capture, serial = 0, phase = 'idle', raf, lastFrame = 0, maxFrameGapMs = 0, lastBar = -1;
const record = { prototype: 'ML-T01-v10', timestamp: new Date().toISOString(), userAgent: navigator.userAgent, playback: null, capture: null };
const keyChoices = { score: null, capture: null };
const displayOctaves = { score: 0, capture: 0 };
function drawPattern(kind, pattern) {
  const inferred = inferSignature(pattern.notes), fifths = keyChoices[kind] ?? inferred.fifths;
  const label = $(`${kind}-key-label`);
  const source = keyChoices[kind] !== null ? '手動' : inferred.estimated ? '推定' : '未推定・調号なし';
  label.textContent = `調号：${source} — ${signature(fifths).label}${keyChoices[kind] === null && inferred.alternatives.length ? '（ほかの調号の可能性もあります）' : ''}`;
  label.dataset.fifths = String(fifths);
  record.scoreSignatures ??= {};
  record.scoreSignatures[kind] = { fifths, source };
  record.displayOctaves = { ...displayOctaves };
  $(`${kind}-octave-label`).textContent = displayOctaves[kind]>0?'表示：1オクターブ上（実音は譜面より1オクターブ下）':displayOctaves[kind]<0?'表示：1オクターブ下（実音は譜面より1オクターブ上）':'表示：原音の高さ';
  renderScore($(kind === 'score' ? 'score' : 'capture-score'), pattern, { fifths, displayOctave: displayOctaves[kind] });
  updateKeyButtons();
}
function updateKeyButtons() {
  for(const kind of ['score','capture']){
    const fifths = Number($(`${kind}-key-label`).dataset.fifths || 0);
    $(`${kind}-key-flat`).disabled = phase !== 'idle' || fifths <= -7;
    $(`${kind}-key-sharp`).disabled = phase !== 'idle' || fifths >= 7;
    $(`${kind}-key-auto`).disabled = phase !== 'idle' || keyChoices[kind] === null;
    for(const [name,value] of [['up',1],['original',0],['down',-1]]){
      const button=$(`${kind}-octave-${name}`);
      button.disabled=phase !== 'idle';
      button.setAttribute('aria-pressed',String(displayOctaves[kind]===value));
    }
  }
}
const labels = { idle: '準備できました', preparing: '音とマイクの準備中', playing: '再生中・停止はボタンで', 'count-in': '8拍のカウント中', recording: '4小節を取り込み中', analyzing: '端末内で解析中' };
function setPhase(next, message) {
  phase = next; $('status').dataset.state = next; $('status').textContent = message || labels[next];
  for (const id of ['tempo','instrument','length','lead','ahead','example','empty','propose','undo','capture','play','adopt','preview','discard','pitch','duration','count-sound','count-volume','record-count','play-count','smoothing','note-mode','timing-adjust','acoustic-sync','processing','boundary-mode','window-size','rms','ratio','gap']) $(id).disabled = next !== 'idle';
  $('align-start').disabled = next !== 'idle' || !capturedOriginal?.notes[0]?.startTick;
  $('capture').disabled = next !== 'idle' || !microphoneEnabled();
  $('confirm').disabled = next !== 'idle' || !candidate || !!candidate.code;
  $('cancel').disabled = next !== 'idle' || !candidate;
  updateKeyButtons();
}
function draw() {
  drawPattern('score', state.pattern);
  $('remaining').textContent = `入力位置 ${state.cursor / 4}拍目・残り ${(state.pattern.bars * 16 - state.cursor) / 4}拍`;
  $('candidate').textContent = !candidate ? '候補なし' : candidate.code ? `置けません：${candidate.code}${candidate.details?.shortageBeats ? `（${candidate.details.shortageBeats}拍超過）` : ''}` : `候補：${$('pitch').value === 'rest' ? 'やすみ' : pitchName(Number($('pitch').value))} ${Number($('duration').value) / 4}拍 → オッケーで確定`;
  setPhase(phase);
}
function stop(message = '停止しました。必要ならもう一度開始してください。') {
  serial++; transport?.stop(false); capture?.cancel(); cancelAnimationFrame(raf);
  setPhase('idle', message);
}
async function prepare() {
  if (!ctx || ctx.state === 'closed') {
    capture?.unsubscribe();
    ctx = new AudioContext();
    const ownedContext = ctx;
    transport = new ProbeTransport(ctx, (reason, metrics) => {
      record.playback = { ...record.playback, ...metrics, reason, maxFrameGapMs, endAudioTime: ctx.currentTime, finalTick: transport.totalTicks };
      stop(reason === 'ENDED' ? '再生がおわりました' : `再生停止：${reason}`); showReport();
    });
    capture = new ProbeCapture(ctx, setPhase, result => {
      record.capture = result;
      const acoustic=result.acousticTiming;
      $('acoustic-status').textContent=acoustic?.status==='measured'
        ? `ドンカマ実測：${Math.round(acoustic.delaySeconds*1000)}ms（${acoustic.inliers}/6拍一致）。実測の補正を使用しました。`
        : acoustic?.status==='unavailable' ? 'ドンカマを安定して検出できませんでした。従来の推定補正を使用しました。'
        : 'ドンカマ実測OFF：従来の推定補正を使用しました。';
      captured = result.empty ? null : { bars: 4, gridStep: 1, notes: result.notes };
      capturedOriginal = captured ? structuredClone(captured) : null;
      record.captureAlignmentTicks = 0; $('align-start').textContent = '頭の休符を詰める';
      $('capture-position').textContent = '取り込み完了';
      $('review').hidden = !captured;
      if (captured) drawPattern('capture', captured);
      setPhase('idle', captured ? '候補を試聴して確認してください' : 'ほとんど音を検出できませんでした。カウントからやり直してください。');
      showReport();
    });
    ctx.addEventListener('statechange', () => { if (ctx === ownedContext && ownedContext.state !== 'running' && phase !== 'idle' && phase !== 'preparing') stop('音声が中断しました。手動で再開してください。'); });
  }
  await ctx.resume();
  if (ctx.state !== 'running') throw new Error('AUDIO_NOT_READY');
}
function tempoValue() {
  const tempo = Number($('tempo').value);
  if (!Number.isFinite(tempo) || tempo < 60 || tempo > 180) throw new Error('テンポは60〜180で指定してください');
  return tempo;
}
function animate() {
  if (!transport?.active && !capture?.active) return;
  const now = performance.now();
  if (lastFrame) maxFrameGapMs = Math.max(maxFrameGapMs, now - lastFrame);
  lastFrame = now;
  const tick = transport.active ? transport.position() : Math.max(0, (ctx.currentTime - capture.startTime) * tempoValue() * 4 / 60);
  const bar = Math.floor(tick / 16), beat = Math.floor(tick / 4) % 4;
  if (capture?.active && Number.isFinite(capture.anchor)) {
    const countBeat = Math.floor((ctx.currentTime - capture.anchor) * capture.tempo / 60);
    $('capture-position').textContent = countBeat < 0 ? `マイクの準備待ち・カウントまで${Math.ceil(capture.anchor-ctx.currentTime)}秒` : countBeat < 8 ? `準備 ${countBeat + 1} / 8拍` : countBeat < 24 ? `録音 ${Math.floor((countBeat - 8) / 4) + 1} / 4小節・${(countBeat - 8) % 4 + 1}拍` : '取り込み・解析の完了待ち';
  }
  $('position').textContent = `${bar + 1}小節・${beat + 1}拍`;
  [...$('beats').children].forEach((node, i) => node.classList.toggle('active', i === beat));
  if (bar !== lastBar) { lastBar = bar; record.lastBoundary = { bar: bar + 1, audioTime: ctx.currentTime, tick, wallTime: now }; }
  raf = requestAnimationFrame(animate);
}
async function play(pattern = state.pattern, preview = false) {
  if (candidate && !preview) { $('status').textContent = '候補を確定するか、とりけしてから再生してください'; return; }
  stop(); const request = serial;
  setPhase('preparing');
  try {
    const tempo = tempoValue(); await prepare(); if (request !== serial) return;
    const bars = preview ? 4 : Number($('length').value), notes = [];
    for (let offset = 0; offset < bars * 16; offset += 64) for (const note of pattern.notes) {
      if (offset + note.startTick >= bars * 16) continue;
      notes.push({ ...note, startTick: offset + note.startTick, durationTick: Math.min(note.durationTick, bars * 16 - offset - note.startTick) });
    }
    record.playback = { tempo, bars, instrument: $('instrument').value, sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency, outputLatency: ctx.outputLatency, notes: notes.length, countSound: $('play-count').checked, countVolume: Number($('count-volume').value) };
    transport.start(notes, { tempo, totalTicks: bars * 16, instrument: $('instrument').value, lead: Number($('lead').value), ahead: Number($('ahead').value), countSound: $('play-count').checked, countVolume: Number($('count-volume').value) });
    setPhase('playing'); lastFrame = 0; maxFrameGapMs = 0; lastBar = -1; animate();
  } catch (error) { if (request === serial) stop(error.message); }
}
function showReport() {
  $('metrics').textContent = JSON.stringify({ ...record, conditions: $('conditions').value, captureCandidate: captured, capture: record.capture ? { ...record.capture, frames: { count: record.capture.frames.length, pitched: record.capture.frames.filter(f => f.kind === 'pitched').length, unknown: record.capture.frames.filter(f => f.kind === 'unknown').length } } : null }, null, 2);
}
async function copyReport(event) {
  const button=event.currentTarget;
  showReport();
  const text=$('metrics').textContent;
  const buttons=[$('copy-report'),$('copy-capture-report')];
  for(const node of buttons)node.disabled=true;
  $('copy-status').textContent='コピー中…';
  try {
    await navigator.clipboard.writeText(text);
    button.textContent='コピーしました';
    $('copy-status').textContent='記録をコピーしました。そのまま貼り付けできます。';
    $('copy-fallback').hidden=true;
  } catch {
    button.textContent='記録をコピー';
    $('copy-status').textContent='コピーできませんでした。選択した記録を手動でコピーしてください。';
    $('copy-fallback').hidden=false;
    $('copy-text').value=text; $('copy-text').focus(); $('copy-text').select();
    $('copy-text').setSelectionRange(0,text.length);
  } finally {
    for(const node of buttons)node.disabled=false;
  }
}
$('play').onclick = () => play(); $('stop').onclick = () => { if (transport?.active) record.playback = { ...record.playback, ...transport.metrics, maxFrameGapMs, stoppedAtTick: transport.position(), reason: 'USER_STOP' }; stop(); showReport(); };
$('capture').onclick = async () => {
  stop(); const request = serial; captured = null; capturedOriginal = null; $('review').hidden = true; setPhase('preparing');
  record.timestamp = new Date().toISOString(); record.capture = null; record.captureAlignmentTicks = 0;
  keyChoices.capture = null;
  if (record.scoreSignatures) delete record.scoreSignatures.capture;
  $('capture-position').textContent = 'カウント待ち';
  $('acoustic-status').textContent = '今回の取り込みを待っています。';
  try {
    const tempo = tempoValue(); await prepare(); if (request !== serial) return;
    const options = { countVolume: Number($('count-volume').value), acousticSync: $('acoustic-sync').checked, windowSize: Number($('window-size').value), boundaryMode: $('boundary-mode').value, rmsFloor: Number($('rms').value), minDetectedRatio: Number($('ratio').value), maxGapSeconds: Number($('gap').value), processing: $('processing').checked, countSound: $('count-sound').checked, recordCount: $('record-count').checked, smoothingMs: Number($('smoothing').value), noteMode: $('note-mode').value, manualMs: Number($('timing-adjust').value) };
    if (!Number.isFinite(options.manualMs) || options.manualMs < -200 || options.manualMs > 400 || ![0,80,120].includes(options.smoothingMs)) throw new Error('補正値が範囲外です');
    try { localStorage.setItem('saezuri.capture.manualMs', String(options.manualMs)); } catch {}
    if (options.rmsFloor < 0.001 || options.rmsFloor > 0.1 || options.minDetectedRatio < 0 || options.minDetectedRatio > 1 || options.maxGapSeconds < 0 || options.maxGapSeconds > 0.5) throw new Error('解析条件が範囲外です');
    record.captureOptions = { tempo, ...options }; await capture.start(tempo, options);
    if (request === serial) { lastFrame = 0; animate(); }
  } catch (error) { if (request === serial) stop(`取り込めません：${error.message}。タッチの音符入力は利用できます。`); }
};
$('mic').onclick = () => setMicrophoneEnabled(!microphoneEnabled());
function refreshMic(enabled) { $('mic').textContent = `マイク ${enabled ? 'ON' : 'OFF'}`; $('mic').setAttribute('aria-pressed', String(enabled)); if (!enabled && phase !== 'playing') stop('マイクOFF・タッチで操作できます'); setPhase(phase); }
onMicrophoneChange(refreshMic); refreshMic(microphoneEnabled());
$('preview').onclick = () => captured && play(captured, true);
$('align-start').onclick = () => {
  if (!capturedOriginal) return;
  record.captureAlignmentTicks = record.captureAlignmentTicks ? 0 : capturedOriginal.notes[0].startTick;
  captured = record.captureAlignmentTicks ? alignCaptureStart(capturedOriginal, record.captureOptions.tempo) : structuredClone(capturedOriginal);
  $('align-start').textContent = record.captureAlignmentTicks ? '頭の休符を戻す' : '頭の休符を詰める';
  drawPattern('capture', captured); showReport();
};
$('adopt').onclick = () => { if (!captured) return; keyChoices.score = keyChoices.capture; displayOctaves.score = displayOctaves.capture; state = { pattern: structuredClone(captured), cursor: 0, revision: state.revision + 1 }; candidate = null; captured = null; $('review').hidden = true; draw(); };
$('discard').onclick = () => { captured = null; $('review').hidden = true; };
$('example').onclick = () => { state = { pattern: example(), cursor: 0, revision: state.revision + 1 }; candidate = null; draw(); };
$('empty').onclick = () => { state = { pattern: { bars: 4, gridStep: 2, notes: [] }, cursor: 0, revision: state.revision + 1 }; candidate = null; draw(); };
for (const midi of [null, ...Array.from({ length: 49 }, (_, i) => i + 48)]) { const option = document.createElement('option'); option.value = midi ?? 'rest'; option.textContent = midi === null ? 'やすみ' : pitchName(midi); $('pitch').append(option); }
$('pitch').value = '60';
$('propose').onclick = () => { candidate = proposeNote(state, { midi: $('pitch').value === 'rest' ? null : Number($('pitch').value), durationTick: Number($('duration').value) }); draw(); };
$('confirm').onclick = () => { const result = commitNote(state, candidate); if (result && !result.code) { state = result; candidate = null; } draw(); };
$('cancel').onclick = () => { candidate = null; draw(); };
$('undo').onclick = () => { if (candidate) return; state = undo(state); draw(); };
$('report').onclick = showReport;
$('copy-report').onclick = copyReport;
$('copy-capture-report').onclick = copyReport;
for(const kind of ['score','capture'])for(const [name,value] of [['up',1],['original',0],['down',-1]]){
  $(`${kind}-octave-${name}`).onclick=()=>{
    const pattern=kind==='score'?state.pattern:captured;
    if(!pattern || phase!=='idle')return;
    displayOctaves[kind]=value; drawPattern(kind,pattern); showReport();
  };
}
for (const kind of ['score','capture']) for (const [suffix,delta] of [['flat',-1],['sharp',1],['auto',null]]) {
  $(`${kind}-key-${suffix}`).onclick = () => {
    const pattern = kind === 'score' ? state.pattern : captured;
    if (!pattern || phase !== 'idle') return;
    keyChoices[kind] = delta === null ? null : Math.max(-7,Math.min(7,Number($(`${kind}-key-label`).dataset.fifths)+delta));
    drawPattern(kind, pattern); showReport();
  };
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stop('画面が隠れたため中断しました（試作の動作）'); });
addEventListener('pagehide', () => { stop(); ctx?.close(); });
try { const saved = localStorage.getItem('saezuri.capture.manualMs'); if (saved !== null && Number.isFinite(Number(saved)) && Number(saved)>=-200 && Number(saved)<=400) $('timing-adjust').value = saved; } catch {}
draw();
