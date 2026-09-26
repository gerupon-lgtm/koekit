import { updatePhaseGuide, setVoiceGuide, labelVoiceButton } from '../src/ui/voice-guide.js';
import { createSpeechInput, METHODS } from '../src/speech/index.js';
import { wordsForKeys } from '../src/speech/vocabulary.js';
import { PHASES } from '../src/game/phase.js';
import { SequencePhase, SEQUENCE_PHASES as SP } from '../src/game/sequence-phase.js';
import { SequenceAnswer, makeSequence, sequenceLevels } from '../src/game/sequence.js';
import { Judge } from '../src/game/judge.js';
import { Progress } from '../src/game/progress.js';
import { deal } from '../src/game/deal.js';
import { ANIMAL_FILES, animalImg } from '../src/game/animals.js';
import { BoardView } from '../src/ui/board.js';
import { openLevelIntro, closeLevelIntro } from '../src/ui/levelintro.js';
import { LevelNavigation } from '../src/ui/levelnavigation.js';
import { ScreenAwake } from '../src/ui/screenawake.js';
import { renderCertificate } from '../src/ui/certificate.js';
import { buildContinuousLevelSelect } from '../src/ui/levelselect.js';
import { installMenuLayout } from '../src/ui/menu-fit.js';
import { renderHighest, renderAward, medalMarkup } from '../src/ui/achievement.js';
import { setMicState } from '../src/ui/micstate.js';
import { showSequenceNumbers, configureSequenceIntro } from '../src/ui/sequenceview.js';
import * as sfx from '../src/audio/sfx.js';

const $ = selector => document.querySelector(selector);
const levels = sequenceLevels();
const progress = new Progress('kioku-sequence', { maxLevel: levels.length / 2, speedIds: levels.filter(l => l.speed).map(l => l.id) });
const navigation = new LevelNavigation(), awake = new ScreenAwake();
const board = new BoardView($('#board'), $('#figure'), { onCardTap: addAnswer });
let phase = null, adapter = null, level = null, judge = null, answer = null;
let trialGeneration = 0, imageLoadFailed = false;
let timer = null, pending = false, status = null, micDenied = false;
document.body.classList.add('sequence-mode');

function show(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.dataset.screen === name));
  awake.setActive(name === 'game' || name === 'cert');
}
function mic(state) {
  setMicState($('#mic-state'), $('#stage'), state);
  document.querySelectorAll('.navigation-mic').forEach(el => setMicState(el, null, state));
}
function startListening(keys) {
  if (!adapter || micDenied) return;
  mic('listening'); adapter.start(wordsForKeys(keys));
}
function stopListening() { adapter?.stop(); if (!micDenied) mic('idle'); }
function refresh() {
  buildContinuousLevelSelect($('#level-select'), levels, startLevel, progress);
  renderHighest($('#highest-title'), progress);
}
function startLevel(id) {
  const chosen = levels.find(l => l.id === id);
  if (!chosen || (chosen.speed && !progress.unlocked())) return;
  trialGeneration++; imageLoadFailed = false;
  clearTimeout(timer); navigation.cancel(); phase?.to(PHASES.RESULT);
  sfx.primeAudio(); level = chosen; pending = false; micDenied = false;
  if (!adapter) {
    adapter = createSpeechInput(METHODS.VOSK);
    adapter.on('result', (raw, ms) => phase?.handleRaw(raw, ms));
    adapter.on('error', code => { if (/denied|not-allowed|not-supported|init-failed|recognizer-failed|language-not-supported/i.test(code)) { micDenied = true; mic('denied'); } });
  }
  phase = new SequencePhase({ startListening, stopListening });
  phase.setLevelVocab(level.vocab); phase.on('match', onMatch); phase.on('enter', controls);
  judge = new Judge({ maxAttempts: 3, clearHits: 2 });
  board.render(level.vocab);
  $('#level-status').textContent = `${level.speed ? '⚡ ' : ''}${level.id.replace('s', '')}`;
  $('#level-status').setAttribute('aria-label', `${level.label} レベル${level.id.replace('s', '')}`);
  $('#sequence-status').textContent = '';
  show('game'); openLevelIntro({ ...level, id: '5' }, 'kioku'); configureSequenceIntro(level);
  navigation.listen(phase, PHASES.AWAIT_INTRO);
}
function fromIntro() {
  if (!$('#level-intro').open) return;
  navigation.cancel(); closeLevelIntro(); beginTrial();
}
async function beginTrial() {
  const token = ++trialGeneration;
  clearTimeout(timer); pending = false; status = null; imageLoadFailed = false;
  phase.to(PHASES.RESULT);
  board.clearMarks(); board.clearContent(); showSequenceNumbers(board, []);
  $('#board').style.visibility = 'hidden';
  $('#board').setAttribute('aria-busy', 'true');
  $('#sequence-status').textContent = 'えを よみこみちゅう…';
  setVoiceGuide($('#game-voice-guide'), '', 'えを よみこみちゅう…');
  const dealt = deal(level.vocab, { letters: ANIMAL_FILES });
  const images = level.vocab.map(key => ({ key, img: animalImg(dealt.map[key]) }));
  try {
    // Decode detached images first so every card is ready before showing the board.
    await Promise.race([
      Promise.all(images.map(({ img }) => img.decode())),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('image-timeout')), 15000); }),
    ]);
  } catch {
    if (token !== trialGeneration) return;
    clearTimeout(timer);
    imageLoadFailed = true;
    $('#board').removeAttribute('aria-busy');
    $('#sequence-status').textContent = 'えを よめませんでした。もういちど おしてね。';
    $('#next-btn').classList.remove('hidden');
    $('#next-btn').setAttribute('aria-label', 'えを よみなおす');
    labelVoiceButton($('#next-btn'), 'よみなおす');
    setVoiceGuide($('#game-voice-guide'), '', 'よみなおす を タッチ');
    return;
  }
  if (token !== trialGeneration) return;
  clearTimeout(timer);
  for (const { key, img } of images) board.setContent(key, img);
  board.flipAll(true);
  $('#board').style.visibility = '';
  $('#board').removeAttribute('aria-busy');
  answer = new SequenceAnswer(makeSequence(level.steps));
  $('#sequence-status').textContent = `▶  ${judge.attempts + 1} / 3`;
  navigation.listen(phase, PHASES.AWAIT_START);
}
function startExample() {
  if (phase?.phase !== PHASES.AWAIT_START) return;
  phase.to(PHASES.RESULT);
  $('#sequence-status').textContent = '● ● ●';
  let index = 0;
  function light() {
    board.setFocus(answer.target[index]);
    sfx.playTick();
    timer = setTimeout(() => {
      board.clearFocus();
      timer = setTimeout(() => {
        index++;
        if (index < answer.target.length) light();
        else { phase.to(SP.ANSWER); updateAnswer(); }
      }, level.offMs);
    }, level.onMs);
  }
  light();
}
function answering() { return phase && (phase.phase === SP.ANSWER || phase.phase === SP.CONFIRM); }
function controls() {
  const ph = phase.phase;
  updatePhaseGuide(ph);
  $('#next-btn').classList.toggle('hidden', ph !== PHASES.AWAIT_START && ph !== PHASES.AWAIT_RESULT_NEXT);
  $('#next-btn').setAttribute('aria-label', ph === PHASES.AWAIT_START ? 'スタート' : 'つぎへ（声でも「つぎ」「オッケー」）');
  $('#confirm-btn').classList.toggle('hidden', !answering());
  $('#confirm-btn').disabled = !answering() || !answer?.ready;
  $('#confirm-btn').setAttribute('aria-label', 'オッケー、順番をこたえる');
  for (const id of ['undo-answer', 'clear-answer']) {
    $('#'+id).classList.toggle('hidden', !answering());
    $('#'+id).disabled = !answer?.values.length;
  }
}
function updateAnswer() {
  showSequenceNumbers(board, answer.values);
  $('#sequence-status').textContent = `${answer.values.length} / ${level.steps}`;
  const next = answer.ready ? SP.CONFIRM : SP.ANSWER;
  if (phase.phase !== next) phase.to(next); else controls();
}
function addAnswer(key) {
  if (!answering() || answer.ready) return;
  answer.add(key); updateAnswer();
}
function editAnswer(all) {
  if (!answering()) return;
  if (all) answer.clear(); else answer.undo();
  updateAnswer();
}
function confirm() {
  if (!answering()) return;
  const correct = answer.submit();
  if (correct === null) return;
  phase.to(PHASES.RESULT);
  status = judge.record(correct ? 'correct' : 'wrong'); pending = true;
  if (status === 'clear') progress.clear(level.id);
  if (correct) {
    sfx.playCorrect(); $('#sequence-status').textContent = '✓';
    navigation.afterSound(500); navigation.listen(phase, PHASES.AWAIT_RESULT_NEXT);
  } else {
    sfx.playBlip(220);
    $('#sequence-status').textContent = 'ざんねん';
    timer = setTimeout(() => {
      showSequenceNumbers(board, answer.target);
      $('#sequence-status').textContent = 'こたえ';
      navigation.listen(phase, PHASES.AWAIT_RESULT_NEXT);
    }, 900);
  }
}
function afterResult() {
  if (!pending || phase?.phase !== PHASES.AWAIT_RESULT_NEXT) return;
  pending = false; navigation.cancel(); phase.to(PHASES.RESULT);
  if (status === 'playing') beginTrial(); else certificate(status);
}
function certificate(kind) {
  if (kind === 'clear') sfx.playClear(); else sfx.playGameover();
  renderCertificate($('#medal'), $('#cert-stars'), { kind, stars: level.speed ? 6 : Number(level.id), total: Math.max(6, levels.length / 2) });
  const title = renderAward($('#cert-award'), progress, kind, level.id);
  $('#medal').innerHTML = kind === 'clear' ? medalMarkup(title?.medal || 'diamond') : '↻';
  $('#cert').dataset.kind = kind;
  $('#cert').dataset.level = level.id;
  $('#cert-next').setAttribute('aria-label', kind === 'gameover' ? '同じレベルに再挑戦（声でも「つぎ」）' : 'つぎへ');
  show('cert'); navigation.afterSound(); navigation.listen(phase, PHASES.AWAIT_NEXT);
}
function certNext() {
  if (!$('#cert').classList.contains('active')) return;
  navigation.cancel(); phase.to(PHASES.RESULT);
  if ($('#cert').dataset.kind === 'gameover') { startLevel(level.id); return; }
  const next = levels[levels.indexOf(level) + 1];
  if (!next || (next.speed && !progress.unlocked())) goTitle(); else startLevel(next.id);
}
function onMatch(key) {
  if (key === 'quit') { goTitle(); return; }
  const ph = phase.phase;
  if (ph === PHASES.AWAIT_INTRO && key === 'confirm') fromIntro();
  else if (ph === PHASES.AWAIT_START && key === 'start') startExample();
  else if (ph === PHASES.AWAIT_NEXT && key === 'next') certNext();
  else if (ph === PHASES.AWAIT_RESULT_NEXT && ['next','confirm'].includes(key)) afterResult();
  else if (answering()) {
    if (key === 'undo') editAnswer(false);
    else if (key === 'clearAnswer') editAnswer(true);
    else if (key === 'confirm') confirm();
    else addAnswer(key);
  }
}
function goTitle() {
  trialGeneration++; imageLoadFailed = false;
  clearTimeout(timer); navigation.cancel(); sfx.stopAll(); pending = false;
  phase?.to(PHASES.RESULT); adapter?.dispose?.(); adapter = null; phase = null;
  closeLevelIntro(); board.clearFocus(); awake.setActive(false); mic('idle');
  refresh(); show('title');
}
$('#intro-go').addEventListener('click', fromIntro);
$('#intro-back').addEventListener('click', goTitle);
$('#level-intro').addEventListener('cancel', e => { e.preventDefault(); goTitle(); });
$('#to-title').addEventListener('click', goTitle);
$('#cert-quit').addEventListener('click', goTitle);
$('#cert-next').addEventListener('click', certNext);
$('#next-btn').addEventListener('click', () => imageLoadFailed ? beginTrial() : phase?.phase === PHASES.AWAIT_START ? startExample() : afterResult());
$('#confirm-btn').addEventListener('click', confirm);
$('#undo-answer').addEventListener('click', () => editAnswer(false));
$('#clear-answer').addEventListener('click', () => editAnswer(true));
window.addEventListener('pagehide', goTitle);
refresh();
installMenuLayout();
