import { proposeNote, commitNote, undo } from '../../saezuri/document.js';
import { microphoneEnabled, setMicrophoneEnabled, onMicrophoneChange } from '../../src/speech/microphone.js';
import { createSpeechInput, METHODS } from '../../src/speech/index.js';
import { EditVoice } from './edit-voice.js';
import { ProbeTransport } from './audio.js';
import { ProbeCapture } from './capture.js';
import { renderScore, pitchName } from './score.js';
import { alignCaptureStart } from './capture-support.js';
import { inferSignature, signature } from './key-signature.js';
import { CaptureEditorView } from './capture-editor-view.js';
import { readCaptureReport } from './capture-report.js';
import { setupEditorLayout, syncEditorLayout, focusEditor } from './editor-layout.js';
import {ComposerControls} from './composer-controls.js';
import {blankPattern} from './entry-session.js';
import {ENTRY_WORDS,parseEntryCommand} from './entry-voice.js';
import {ImageControls} from './image-controls.js';
import {accompanimentEvents} from '../../saezuri/music/accompaniment.js';
const compactEditor=setupEditorLayout();
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
// A familiar seven-note phrase for editing. Keep the boundary fixture above
// available only from the technical comparison controls.
const editingExample = () => ({ bars: 4, gridStep: 1, notes: [
  { id: 'demo-1', midi: 66, startTick: 0, durationTick: 8 },
  { id: 'demo-2', midi: 63, startTick: 8, durationTick: 2 },
  { id: 'demo-3', midi: 64, startTick: 10, durationTick: 2 },
  { id: 'demo-4', midi: 66, startTick: 14, durationTick: 10 },
  { id: 'demo-5', midi: 61, startTick: 24, durationTick: 2 },
  { id: 'demo-6', midi: 63, startTick: 26, durationTick: 2 },
  { id: 'demo-7', midi: 59, startTick: 30, durationTick: 34 },
] });
let state = { pattern: editingExample(), cursor: 0, revision: 0 }, candidate = null, captured = null, capturedOriginal = null;
let ctx, transport, capture, serial = 0, phase = 'idle', raf, lastFrame = 0, maxFrameGapMs = 0, lastBar = -1, playbackPreview = false;
const record = { prototype: 'ML-T01-v20', timestamp: new Date().toISOString(), userAgent: navigator.userAgent, playback: null, capture: null };
const keyChoices = { score: null, capture: null };
const displayOctaves = { score: 0, capture: 0 };
const captureAlignments = new Map();
let voice, voiceTimer, composer, imageControls;
function syncVoice() {
  if(!voice) return;
  if(captureEditor.previewPattern?.source==='manual') voice.configure(ENTRY_WORDS,parseEntryCommand);
  else voice.configure();
  clearTimeout(voiceTimer);
  const enabled=$('edit-voice').checked && microphoneEnabled();
  const available=enabled && captureEditor.isOpen && !$('review').hidden && !document.hidden && phase==='idle';
  if(!available) voice.setActive(false,{release:!enabled || !captureEditor.isOpen || document.hidden || ['count-in','recording','analyzing'].includes(phase)});
  else voiceTimer=setTimeout(()=>voice.setActive(true),250);
}
const captureEditor = new CaptureEditorView({ onChange(change) {
  captured = change.pattern;
  if(change.confirmed) {
    keyChoices.score=keyChoices.capture; displayOctaves.score=displayOctaves.capture;
    state={pattern:structuredClone(captured),cursor:0,revision:state.revision+1}; candidate=null;
    draw();
  }
  if (change.sourceChanged) capturedOriginal = change.sourcePattern;
  record.captureAlignmentTicks = captureAlignments.get(change.variant) ?? 0;
  $('align-start').textContent = record.captureAlignmentTicks ? '頭の休符を戻す' : '頭の休符を詰める';
  record.captureEditing = captureEditor.snapshot();
  if (change.previewPattern) drawPattern('capture', change.previewPattern);
  setPhase(phase);
  showReport();
} });
function drawPattern(kind, pattern) {
  const inferred = inferSignature(kind==='capture' ? (captured?.notes ?? pattern.notes) : pattern.notes), fifths = keyChoices[kind] ?? (pattern.source==='manual'?0:inferred.fifths);
  const label = $(`${kind}-key-label`);
  const source = keyChoices[kind] !== null ? '手動' : pattern.source==='manual'?'指定':inferred.estimated ? '推定' : '未推定・調号なし';
  label.textContent = `調号：${source} — ${signature(fifths).label}${source==='推定' && inferred.alternatives.length ? '（ほかの調号の可能性もあります）' : ''}`;
  label.dataset.fifths = String(fifths);
  record.scoreSignatures ??= {};
  record.scoreSignatures[kind] = { fifths, source };
  record.displayOctaves = { ...displayOctaves };
  $(`${kind}-octave-label`).textContent = displayOctaves[kind]>0?'表示：1オクターブ上（実音は譜面より1オクターブ下）':displayOctaves[kind]<0?'表示：1オクターブ下（実音は譜面より1オクターブ上）':'表示：原音の高さ';
  renderScore($(kind === 'score' ? 'score' : 'capture-score'), pattern, { fifths, displayOctave: displayOctaves[kind], fitWidth:compactEditor && kind==='capture' });
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
  for (const id of ['edit-score','tempo','instrument','length','lead','ahead','example','empty','propose','undo','capture','play','adopt','preview','discard','pitch','duration','count-sound','count-volume','record-count','play-count','play-count-style','smoothing','note-mode','timing-adjust','acoustic-sync','processing','boundary-mode','window-size','adaptive-window','rms','ratio','gap','comparison-settings','capture-import-button','capture-import-text']) $(id).disabled = next !== 'idle';
  $('align-start').disabled = next !== 'idle' || captureEditor.pending || captureEditor.edited || !capturedOriginal?.notes[0]?.startTick;
  $('adopt').disabled = next !== 'idle' || !captureEditor.accepted || captureEditor.pending;
  $('capture-import-button').disabled = next !== 'idle' || captureEditor.pending;
  captureEditor.setBusy(next !== 'idle');
  $('preview').disabled=next!=='idle' || !!captureEditor.entry?.proposal.code;
  composer?.render(next!=='idle');
  imageControls?.render(next!=='idle');
  document.body.classList.toggle('manual-composer',captureEditor.isOpen&&captureEditor.previewPattern?.source==='manual');
  $('capture').disabled = next !== 'idle' || !microphoneEnabled() || captureEditor.isOpen;
  $('confirm').disabled = next !== 'idle' || !candidate || !!candidate.code;
  $('cancel').disabled = next !== 'idle' || !candidate;
  if(captureEditor.isOpen) for(const id of ['edit-score','example','empty','propose','confirm','cancel','undo','capture-import-button']) $(id).disabled=true;
  if(compactEditor) {
    $('capture').disabled=next!=='idle' || !microphoneEnabled() || captureEditor.pending;
    $('capture-import-button').disabled=next!=='idle' || captureEditor.pending;
    syncEditorLayout({open:captureEditor.isOpen,pending:captureEditor.pending,phase:next});
  }
  syncVoice();
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
  playbackPreview=false;captureEditor.followPlayback(null);
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
    capture = new ProbeCapture(ctx, setPhase, acceptCapture);
    ctx.addEventListener('statechange', () => { if (ctx === ownedContext && ownedContext.state !== 'running' && phase !== 'idle' && phase !== 'preparing') stop('音声が中断しました。手動で再開してください。'); });
  }
  await ctx.resume();
  if (ctx.state !== 'running') throw new Error('AUDIO_NOT_READY');
}
function acceptCapture(result) {
      record.editingSource='capture';
      record.capture = result;
      const comparison = result.analysisComparison;
      const comparisonLabels = { current:'現在の設定', detail:'細かい変化', unsmoothed:'ならしなし' };
      $('analysis-comparison').textContent = comparison
        ? `同じ入力の比較：${comparison.variants.map(v=>`${comparisonLabels[v.mode]} ${v.notes.length}音`).join(' ／ ')}。比較結果と音程推移を記録に含めました。`
        : '今回の解析比較はありません。';
      const acoustic=result.acousticTiming;
      $('acoustic-status').textContent=acoustic?.status==='measured'
        ? `ドンカマ実測：${Math.round(acoustic.delaySeconds*1000)}ms（${acoustic.inliers}/6拍一致）。実測の補正を使用しました。`
        : acoustic?.status==='unavailable' ? 'ドンカマを安定して検出できませんでした。従来の推定補正を使用しました。'
        : 'ドンカマ実測OFF：従来の推定補正を使用しました。';
      captureAlignments.clear();
      captureEditor.load(result, record.captureOptions);
      $('capture-position').textContent = '取り込み完了';
      $('review').hidden = false;
      setPhase('idle', captured?.notes.length ? '候補を選んで試聴・編集してください' : 'ほとんど音を検出できませんでした。別の方式を確認するか、カウントからやり直してください。');
      showReport();
      focusEditor();
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
  if(playbackPreview && transport.active && ctx.currentTime>=transport.anchor) captureEditor.followPlayback(tick);
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
  if(candidate?.code && !preview) { $('status').textContent=`この候補は再生できません：${candidate.code}`; return; }
  if(candidate && !preview && !candidate.code) pattern=candidate.pattern;
  stop(); const request = serial;
  setPhase('preparing');
  try {
    const tempo = tempoValue(); await prepare(); if (request !== serial) return;
    const bars = preview ? pattern.bars : Number($('length').value)===129?129:pattern.bars, notes = [];
    for (let offset = 0; offset < bars * 16; offset += pattern.bars*16) for (const note of pattern.notes) {
      if (offset + note.startTick >= bars * 16) continue;
      notes.push({ ...note, startTick: offset + note.startTick, durationTick: Math.min(note.durationTick, bars * 16 - offset - note.startTick) });
    }
    record.playback = { tempo, bars, instrument: $('instrument').value, sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency, outputLatency: ctx.outputLatency, notes: notes.length, draft:preview ? captureEditor.pending : !!candidate, pitches:notes.map(n=>n.midi), countSound: $('play-count').checked, countStyle: $('play-count-style').value, countVolume: Number($('count-volume').value) };
    const backing=accompanimentEvents(pattern),accompaniment=[];
    for(let offset=0;offset<bars*16;offset+=pattern.bars*16) for(const note of backing) if(offset+note.startTick<bars*16) accompaniment.push({...note,startTick:offset+note.startTick});
    record.playback.accompaniment=pattern.accompaniment??null;
    transport.start(notes, { tempo, totalTicks: bars * 16, instrument: $('instrument').value, lead: Number($('lead').value), ahead: Number($('ahead').value), countSound: $('play-count').checked, countStyle: $('play-count-style').value, countVolume: Number($('count-volume').value),accompaniment });
    playbackPreview=preview;
    setPhase('playing'); lastFrame = 0; maxFrameGapMs = 0; lastBar = -1; animate();
  } catch (error) { if (request === serial) stop(error.message); }
}
function showReport() {
  const frames = record.capture?.frames ?? [];
  const frameSummary = !frames.length && record.importedFrom?.frameSummary ? record.importedFrom.frameSummary : { count: frames.length, pitched: frames.filter(f => f.kind === 'pitched').length, unknown: frames.filter(f => f.kind === 'unknown').length };
  $('metrics').textContent = JSON.stringify({ ...record, ...(captured?.source==='manual'?{compositionOptions:{tempo:Number($('tempo').value)}}:{}), conditions: $('conditions').value, captureCandidate: captured, capture: record.capture ? { ...record.capture, frames: frameSummary } : null }, null, 2);
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
  voice?.setActive(false,{release:true});
  stop(); const request = serial; captured = null; capturedOriginal = null; $('review').hidden = true; setPhase('preparing');
  record.timestamp = new Date().toISOString(); record.capture = null; record.captureAlignmentTicks = 0; record.playback = null;
  delete record.importedFrom;
  captureAlignments.clear(); captureEditor.load(null);
  keyChoices.capture = null;
  if (record.scoreSignatures) delete record.scoreSignatures.capture;
  $('capture-position').textContent = 'カウント待ち';
  $('acoustic-status').textContent = '今回の取り込みを待っています。';
  $('analysis-comparison').textContent = '今回の取り込みを待っています。';
  try {
    const tempo = tempoValue(); await prepare(); if (request !== serial) return;
    const options = { countVolume: Number($('count-volume').value), acousticSync: $('acoustic-sync').checked, windowSize: Number($('window-size').value), adaptiveWindow: $('adaptive-window').checked, boundaryMode: $('boundary-mode').value, rmsFloor: Number($('rms').value), minDetectedRatio: Number($('ratio').value), maxGapSeconds: Number($('gap').value), processing: $('processing').checked, countSound: $('count-sound').checked, recordCount: $('record-count').checked, smoothingMs: Number($('smoothing').value), noteMode: $('note-mode').value, manualMs: Number($('timing-adjust').value) };
    if (!Number.isFinite(options.manualMs) || options.manualMs < -200 || options.manualMs > 400 || ![0,80,120].includes(options.smoothingMs)) throw new Error('補正値が範囲外です');
    try { localStorage.setItem('saezuri.capture.manualMs', String(options.manualMs)); } catch {}
    if (options.rmsFloor < 0.001 || options.rmsFloor > 0.1 || options.minDetectedRatio < 0 || options.minDetectedRatio > 1 || options.maxGapSeconds < 0 || options.maxGapSeconds > 0.5) throw new Error('解析条件が範囲外です');
    record.captureOptions = { tempo, ...options }; await capture.start(tempo, options);
    if (request === serial) { lastFrame = 0; animate(); }
  } catch (error) { if (request === serial) stop(`取り込めません：${error.message}。タッチの音符入力は利用できます。`); }
};
$('capture-import-button').onclick = () => {
  if (phase !== 'idle' || captureEditor.pending) return;
  try {
    const imported = readCaptureReport($('capture-import-text').value);
    record.timestamp = new Date().toISOString();
    record.captureOptions = imported.options;
    record.importedFrom = imported.importedFrom;
    record.playback = null;
    delete record.lastBoundary;
    keyChoices.capture = null;
    $('tempo').value = String(imported.options.tempo);
    if(imported.pattern) {
      record.capture=null;record.editingSource='manual';displayOctaves.capture=0;
      captureAlignments.clear();captureEditor.openPattern(imported.pattern);$('review').hidden=false;
      setPhase('idle');focusEditor();showReport();
      $('capture-import-status').textContent='通常作成の確定した音列を開きました。';return;
    }
    acceptCapture(imported.result);
    $('capture-import-status').textContent = '元の取り込みを開きました。方式を選んで試聴・編集できます。';
    $('capture-position').textContent = '記録から読み込みました';
  } catch (error) { $('capture-import-status').textContent = error.message; }
};
$('comparison-settings').onclick = () => {
  if (phase !== 'idle') return;
  const values = { tempo:'120', 'note-mode':'sustain', smoothing:'120', gap:'0.1', 'window-size':'4096', 'boundary-mode':'energy-gated', 'timing-adjust':'0', ratio:'0.5', rms:'0.008' };
  for(const [id,value] of Object.entries(values)) $(id).value=value;
  for(const id of ['adaptive-window','acoustic-sync','count-sound','record-count']) $(id).checked=true;
  $('processing').checked=false;
  $('status').textContent='比較設定にしました。カウントのあと、切らずにG／G♯を8分音符で交互に歌ってください。';
};
$('mic').onclick = () => setMicrophoneEnabled(!microphoneEnabled());
function refreshMic(enabled) { $('mic').textContent = `マイク ${enabled ? 'ON' : 'OFF'}`; $('mic').setAttribute('aria-pressed', String(enabled)); if (!enabled && phase !== 'playing') stop('マイクOFF・タッチで操作できます'); setPhase(phase); }
onMicrophoneChange(refreshMic); refreshMic(microphoneEnabled());
$('preview').onclick = () => captured && !captureEditor.entry?.proposal.code && play(captureEditor.previewPattern, true);
$('align-start').onclick = () => {
  if (!capturedOriginal || !capturedOriginal.notes[0]?.startTick || phase !== 'idle' || captureEditor.pending || captureEditor.edited) return;
  record.captureAlignmentTicks = record.captureAlignmentTicks ? 0 : capturedOriginal.notes[0].startTick;
  captured = record.captureAlignmentTicks ? alignCaptureStart(capturedOriginal, record.captureOptions.tempo) : structuredClone(capturedOriginal);
  captureAlignments.set(captureEditor.variant, record.captureAlignmentTicks);
  captureEditor.setPattern(captured);
};
$('edit-score').onclick = () => {
  if(phase!=='idle' || captureEditor.isOpen) return;
  keyChoices.capture=keyChoices.score; displayOctaves.capture=displayOctaves.score;
  captureAlignments.clear(); captureEditor.openPattern(state.pattern);
  $('review').hidden=false; record.editingSource='score'; setPhase('idle');
  if(compactEditor) focusEditor();
  else $('review').scrollIntoView({behavior:'smooth',block:'start'});
};
$('adopt').onclick = () => {
  if(phase!=='idle' || !captureEditor.accepted || !captureEditor.end()) return;
  $('review').hidden=true; setPhase('idle');showReport();
};
$('discard').onclick = () => {
  if(phase!=='idle') return;
  captured=null; captureEditor.load(null); $('review').hidden=true;setPhase('idle');showReport();
};
voice=new EditVoice({createInput:()=>createSpeechInput(METHODS.VOSK),
  onCommand(command) {
    if(phase!=='idle' || !captureEditor.isOpen || document.hidden || !microphoneEnabled()) return;
    if(command?.type==='note') {
      captureEditor.inputNote({...command,...($('composer-replace')?.checked?{replaceNoteId:captureEditor.selectedNoteId}:{})});return;
    }
    if(command?.type==='position') {
      const bar=Math.min(captureEditor.previewPattern.bars-1,Math.floor(captureEditor.cursor/16));
      captureEditor.moveCursor(bar*16+(command.beat-1)*4+2);return;
    }
    if(command==='preview') $('preview').click(); else captureEditor.command(command);
  },
  onStatus(status) {
    if(status==='error') $('edit-voice').checked=false;
    $('edit-voice-status').textContent=status==='error' ? '音声を準備できませんでした。ボタンで操作できます。' : !$('edit-voice').checked ? '音声操作OFF・ボタンで操作できます' :
      ({paused:'音声受付はおやすみ中',loading:'音声認識の準備中…',listening:'声を受け付けています',error:'音声を準備できませんでした。ボタンで操作できます。'}[status]);
  }
});
$('edit-voice').onchange=syncVoice;
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
    const pattern=kind==='score'?state.pattern:captureEditor.previewPattern;
    if(!pattern || phase!=='idle')return;
    displayOctaves[kind]=value; drawPattern(kind,pattern); captureEditor.setBusy(false); showReport();
  };
}
for (const kind of ['score','capture']) for (const [suffix,delta] of [['flat',-1],['sharp',1],['auto',null]]) {
  $(`${kind}-key-${suffix}`).onclick = () => {
    const pattern = kind === 'score' ? state.pattern : captureEditor.previewPattern;
    if (!pattern || phase !== 'idle') return;
    keyChoices[kind] = delta === null ? null : Math.max(-7,Math.min(7,Number($(`${kind}-key-label`).dataset.fifths)+delta));
    drawPattern(kind, pattern); captureEditor.setBusy(false); showReport();
  };
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop('画面が隠れたため中断しました（試作の動作）');
  else syncVoice();
});
addEventListener('pagehide', () => { stop(); clearTimeout(voiceTimer);voice?.setActive(false,{release:true});captureEditor.load(null);ctx?.close(); });
try { const saved = localStorage.getItem('saezuri.capture.manualMs'); if (saved !== null && Number.isFinite(Number(saved)) && Number(saved)>=-200 && Number(saved)<=400) $('timing-adjust').value = saved; } catch {}
function newComposition(withImage=false) {
  if(phase!=='idle' || captureEditor.pending) return;
  keyChoices.capture=null;displayOctaves.capture=0;
  const pattern=blankPattern();
  if(withImage)pattern.accompaniment={enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'};
  $('tempo').value='120';
  captureAlignments.clear();captureEditor.openPattern(pattern);
  $('review').hidden=false;record.editingSource='manual';record.capture=null;record.playback=null;
  record.captureOptions=null;delete record.importedFrom;record.timestamp=new Date().toISOString();
  setPhase('idle','音や休符を選び、オッケーで置いていきます。');focusEditor();showReport();
  if(imageControls?.panel)imageControls.panel.open=withImage;
}
composer=new ComposerControls({editor:captureEditor,onNew:()=>newComposition()});
imageControls=new ImageControls({editor:captureEditor,onNew:()=>newComposition(true),onTempo:tempo=>{$('tempo').value=String(tempo);}});
draw();
if(compactEditor) $('edit-score').click();
if(compactEditor) {
  let width=0;
  new ResizeObserver(entries=>{
    const next=entries[0].contentRect.width;
    if(!next || Math.abs(next-width)<1) return;
    width=next;
    if(!captureEditor.isOpen) return;
    captureEditor.followPlayback(null);
    drawPattern('capture',captureEditor.previewPattern);
    captureEditor.setBusy(phase!=='idle');
    if(playbackPreview && transport?.active && ctx.currentTime>=transport.anchor) captureEditor.followPlayback(transport.position());
  }).observe($('capture-score'));
}
