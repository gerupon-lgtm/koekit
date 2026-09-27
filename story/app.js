// モノガタリズム — 画面と状態（基本設計4〜5節）
// 声（端末内Vosk）とタッチの両方で同じ操作を行う。読み上げ中は聞き取りを止める。
import { SETS, ROW_KEYS } from './story-data.js';
import { makeBoard, resolvePicks, buildStory, picksSummary, MAX_PER_ROW, loadSets } from './story.js';
import { Reader } from './tts.js';
import { StorySpeech } from './voice.js';
import { wordsFor, parse } from './vocabulary.js';
import { microphoneEnabled, onMicrophoneChange } from '../src/speech/microphone.js';
import { setMicState } from '../src/ui/micstate.js';
import { ScreenAwake } from '../src/ui/screenawake.js';
import { setVoiceGuide } from '../src/ui/voice-guide.js';

// 遊んでいる間（なまえ・ばん・おはなし）は画面を消さない。はじめ画面では解除（共通部品、デリバリズムと同じ）
const screenAwake = new ScreenAwake();

const $ = id => document.getElementById(id);
const NUM_WORDS = ['いち', 'に', 'さん', 'よん', 'ご'];
const SETTINGS_KEY = 'koekit.story.settings';

// ---------- 設定（端末内に保存。失敗しても既定値で動く） ----------
const settings = { audience: 'kids', tts: 'on', order: 'normal', rate: 1, voice: '', voiceName: '' };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* 既定値 */ }
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 保存できなくても続行 */ } };

// ---------- 検証用の記録 ----------
const logLines = [];
function log(msg) {
  logLines.push(`${new Date().toTimeString().slice(0, 8)} ${msg}`);
  if (logLines.length > 300) logLines.shift();
  $('log').textContent = logLines.join('\n');
  $('log').scrollTop = 1e9;
}

const reader = new Reader({ log });
reader.rate = settings.rate;
reader.setPreferred(settings.voice, settings.voiceName); // 選んだ声は端末に保存して次回も使う

// ---------- 状態 ----------
const st = {
  screen: 'start',
  name: '', nameCand: null,
  board: null, row: 0, cand: null, sel: null, done: false,
  picks: null, story: null,
};
let modal = null;
let revealTimer = null;
let resumeReveal = false;

function paintNavigation() {
  $('home-link').hidden = st.screen !== 'start';
  $('nav-back').hidden = st.screen === 'start' || (st.screen === 'board' && !!st.picks);
  $('quit').hidden = st.screen !== 'board';
  $('nav-back').setAttribute('aria-label', st.screen === 'name' ? 'はじめに もどる' : 'ひとつ もどる');
}

function show(screen) {
  clearTimeout(revealTimer); revealTimer = null;
  cancelAuto();
  st.screen = screen;
  for (const id of ['start', 'name', 'board']) $('s-' + id).hidden = id !== (screen === 'story' ? 'board' : screen);
  screenAwake.setActive(screen !== 'start');
  paintNavigation();
  window.scrollTo(0, 0);
  syncVoice();
}
function home() { reader.stop(); show('start'); paintStartGuide(); syncVoice(); }
$('nav-back').onclick = () => { if (st.screen === 'name') home(); else back(); };
$('quit').onclick = () => { if (st.picks) home(); else openModal('exit'); };
$('help-open').onclick = () => openModal('help');
$('help-close').onclick = () => closeModal('help');
$('exit-continue').onclick = () => closeModal('exit');
$('exit-confirm').onclick = () => { closeModal('exit', false); home(); };
for (const kind of ['help', 'exit']) {
  $(kind + '-dialog').addEventListener('cancel', e => { e.preventDefault(); closeModal(kind); });
}
function openModal(kind) {
  modal = kind;
  resumeReveal = revealTimer !== null;
  clearTimeout(revealTimer); revealTimer = null;
  cancelAuto();
  reader.stop(); speech.close();
  $(kind + '-dialog').showModal();
}
function closeModal(kind, resume = true) {
  $(kind + '-dialog').close(); modal = null;
  if (!resume) { resumeReveal = false; return; }
  if (resumeReveal && st.screen === 'board' && st.picks) scheduleRead();
  else if (st.screen === 'board' && !st.picks && !st.done) scheduleAuto();
  resumeReveal = false;
  repaint(); syncVoice();
}

// 共通案内帯と、区間で実際に受け付ける語の一覧。読み上げ中は声を促さない。
function paintCue(id, word, action, touch, words = '') {
  const speaking = canSpeak();
  setVoiceGuide($(id), reader.busy || modal ? '' : word,
    reader.busy ? 'よみあげちゅう。タッチでも すすめるよ' : action, touch);
  $(id + '-words').textContent = speaking && words ? `いえること：${words}` : '';
}

// ---------- MG-S01 はじめ ----------
function paintSegs() {
  document.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('button')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === settings[seg.dataset.key]))));
}
function setSetting(key, value) { settings[key] = value; saveSettings(); paintSegs(); applySettings(); }
document.querySelectorAll('.seg').forEach(seg => {
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setSetting(seg.dataset.key, b.dataset.v);
  });
});
paintSegs();
function applySettings() {
  document.body.classList.toggle('kids', settings.audience === 'kids');
  document.body.classList.toggle('adult', settings.audience === 'adult');
  reader.enabled = settings.tts === 'on';
  // 読み上げOFFのときは声のメニューを使えなくする（表示は残す）
  const vs = document.getElementById('voice');
  if (vs) vs.disabled = settings.tts !== 'on' || !reader.available;
}
applySettings();
$('go-name').onclick = () => openName();
// 物語データ（data/*.json）を読み込むまで「はじめる」を押せないようにする
$('go-name').disabled = true;
let setsReady = false;
loadSets().then(() => { setsReady = true; $('go-name').disabled = false; log('物語データを読み込みました'); paintStartGuide(); syncVoice(); })
  .catch(e => { log(`✕ 物語データを読み込めません ${e.message}`); toast('物語データを読み込めませんでした。ひらき直してください'); });
// 直近2回の物語で使った場面は、なるべく使わない（同じ話に見えないように）
const recentScenes = [];
let lastType = null; // 同じ流れの型が続かないように

$('rate').value = settings.rate; $('rateV').textContent = (+settings.rate).toFixed(1);
$('rate').oninput = () => { settings.rate = reader.rate = +$('rate').value; $('rateV').textContent = reader.rate.toFixed(1); saveSettings(); };
// 声を選んだら、その声で短く試し読みする（読み上げONのとき）
$('voice').onchange = () => {
  const v = reader.voices.find(x => x.voiceURI === $('voice').value);
  settings.voice = $('voice').value; settings.voiceName = v ? v.name : ''; saveSettings();
  reader.setPreferred(settings.voice, settings.voiceName);
  log(`声を変更 ${v ? v.name : '既定'}`);
  if (reader.enabled && reader.available) reader.speak([{ text: settings.audience === 'kids' ? 'この こえで よむね。' : 'この声で読みます。' }]);
};
$('tts-test').onclick = () => {
  if (!reader.available) { toast('この端末は よみあげに 対応していません'); return; }
  const was = reader.enabled; reader.enabled = true;
  log(`ためし読み online=${navigator.onLine}`);
  reader.speak([{ text: 'むかしむかし、あるところに。これは、よみあげの ためしです。' }]).then(() => { reader.enabled = was; });
};
function paintVoices() {
  const sel = $('voice');
  sel.innerHTML = reader.voices.length ? '' : '<option value="">（日本語の声なし・端末の既定）</option>';
  reader.voices.forEach(v => {
    const o = document.createElement('option');
    o.value = v.voiceURI; o.textContent = `${v.name}${v.localService ? '（端末内）' : ''}`;
    sel.appendChild(o);
  });
  sel.value = reader.voiceURI;
  $('voices').innerHTML = reader.voices.map(v =>
    `<tr><td>${esc(v.name)}</td><td>${v.lang}</td><td class="${v.localService ? 'yes' : 'no'}">${v.localService ? 'はい' : 'いいえ'}</td></tr>`).join('')
    + `<tr><td colspan="3">全体 ${reader.allVoiceCount ?? 0} 件中、日本語 ${reader.voices.length} 件</td></tr>`;
}
reader.on(e => { if (e.type === 'voices') paintVoices(); });
paintVoices();
function updateStatus() {
  const sw = navigator.serviceWorker?.controller ? 'あり' : 'なし（一度オンラインで開き直すと有効）';
  $('status').innerHTML = `通信：<b class="${navigator.onLine ? 'yes' : 'no'}">${navigator.onLine ? 'オンライン' : 'オフライン'}</b>　オフライン保存(SW)：${sw}　読み上げ機能：${reader.available ? 'あり' : 'なし'}`;
}
addEventListener('online', () => { updateStatus(); log('オンラインになった'); });
addEventListener('offline', () => { updateStatus(); log('オフラインになった'); });
navigator.serviceWorker?.addEventListener('controllerchange', updateStatus);
updateStatus();
log(`起動 UA=${navigator.userAgent}`);
// 版数はコエキット共通の version.json（正典）から表示する。取れなければ表示しない
fetch('../version.json').then(r => r.json()).then(v => { if (v?.version) $('ver').textContent = `v${v.version}　`; }).catch(() => {});
$('copy-log').onclick = async () => {
  const v = reader.voices.map(x => `${x.name}|${x.lang}|local=${x.localService}`).join('\n');
  try { await navigator.clipboard.writeText(`${logLines.join('\n')}\n--- 日本語の声 ---\n${v}`); toast('記録をコピーしました'); } catch { toast('コピーできませんでした'); }
};

// ---------- MG-S02 なまえ ----------
function openName() {
  const set = SETS[settings.audience];
  st.nameCand = st.name && set.names.includes(st.name) ? st.name : null;
  const box = $('names');
  box.innerHTML = '';
  set.names.forEach(n => {
    const b = document.createElement('button');
    b.textContent = n;
    b.onclick = () => { st.nameCand = n; paintName(); };
    box.appendChild(b);
  });
  show('name');
  paintName();
  reader.speak([{ text: settings.audience === 'kids' ? 'だれの おはなし？' : '主人公は、だれ？' }]);
}
function paintName() {
  $('names').querySelectorAll('button').forEach(b => {
    b.classList.toggle('cand', b.textContent === st.nameCand);
    b.setAttribute('aria-pressed', String(b.textContent === st.nameCand));
  });
  $('name-ok').disabled = !st.nameCand;
  paintCue('name-guide', st.nameCand ? 'オッケー' : '',
    st.nameCand ? `で「${st.nameCand}」に きめる` : 'なまえを えらぼう',
    'オッケー を タッチ', 'なまえ・おまかせ・もどる' + (st.nameCand ? '・オッケー' : ''));
  syncVoice();
}
$('name-ok').onclick = () => { if (st.nameCand) { st.name = st.nameCand; openBoard(); } };
$('name-omakase').onclick = () => {
  const list = SETS[settings.audience].names;
  st.name = list[Math.floor(Math.random() * list.length)];
  openBoard();
};

// ---------- MG-S03 ばん ----------
function openBoard() {
  st.board = makeBoard(settings.audience);
  st.sel = Object.fromEntries(ROW_KEYS.map(k => [k, []]));
  cancelAuto();
  st.row = 0; st.cand = null; st.done = false; st.picks = null; st.story = null;
  $('who').textContent = `しゅじんこう：${st.name}`;
  $('story-area').hidden = true;
  $('board-btns').hidden = false;
  show('board');
  renderBoard();
  promptRow();
  log(`盤面 mode=${settings.audience} order=${settings.order}`);
}

// 行ごとのトランプの印（いつ♠・どこで♥・だれと♦・なにを♣）
// \uFE0E：絵文字ではなく文字の形で出す（iPhone でハートが赤い絵文字になるのを防ぐ）
const SUITS = [{ s: '♠\uFE0E', name: 'スペード', red: false }, { s: '♥\uFE0E', name: 'ハート', red: true },
  { s: '♦\uFE0E', name: 'ダイヤ', red: true }, { s: '♣\uFE0E', name: 'クラブ', red: false }];
// 数字の札：左上の数字と印、まん中に数と同じだけの印
function cardFace(n, suit) {
  const pips = Array.from({ length: n }, () => `<i>${suit.s}</i>`).join('');
  return `<span class="idx">${n}<br>${suit.s}</span><span class="pips p${n}">${pips}</span>`;
}

function rowKey() { return ROW_KEYS[st.row]; }

function renderBoard() {
  const set = SETS[settings.audience];
  const box = $('board');
  box.innerHTML = '';
  box.style.setProperty('--cols', st.board.cols);
  ROW_KEYS.forEach((k, r) => {
    const row = document.createElement('div');
    row.className = 'brow';
    if (!st.picks && !st.done && r === st.row) row.classList.add('active');
    if (!st.picks && (st.done || r < st.row)) row.classList.add('done');
    const lab = document.createElement('div');
    lab.className = 'rlabel';
    const suit = SUITS[r];
    row.classList.add(suit.red ? 'red' : 'black');
    lab.innerHTML = `<span class="ico suit">${suit.s}</span>${set.rows[k].label}`;
    row.appendChild(lab);
    for (let c = 0; c < st.board.cols; c++) {
      const cell = document.createElement('button');
      cell.className = 'cell';
      const order = st.sel[k].indexOf(c);
      if (st.picks) {
        // めくったあと
        const p = st.picks[k];
        const picked = p.idx.includes(c);
        const it = st.board.rows[k][c];
        cell.disabled = true;
        cell.classList.add('open');
        if (picked) {
          cell.classList.add(p.omakase ? 'omk' : 'sel');
          cell.style.setProperty('--d', `${(r * st.board.cols + c) * 0.06}s`);
          cell.innerHTML = `<span class="idx">${c + 1}<br>${suit.s}</span><span class="emo">${it.e}</span><span class="word">${esc(it.w)}</span>`
            + (p.omakase ? '<span class="badge omakase">おまかせ</span>' : `<span class="badge">${p.idx.indexOf(c) + 1}</span>`);
        } else {
          cell.classList.add('dim');
          cell.innerHTML = cardFace(c + 1, suit);
        }
      } else {
        cell.innerHTML = cardFace(c + 1, suit);
        cell.setAttribute('aria-label', `${set.rows[k].label}（${suit.name}）${c + 1}ばん`);
        cell.disabled = st.done || r !== st.row;
        if (order >= 0) { cell.classList.add('sel'); cell.insertAdjacentHTML('beforeend', `<span class="badge">${order + 1}</span>`); }
        if (r === st.row && st.cand === c) cell.classList.add('cand', ...(order >= 0 ? ['unsel'] : []));
        cell.onclick = () => chooseNumber(c);
      }
      row.appendChild(cell);
    }
    box.appendChild(row);
  });
  paintGuide();
  syncVoice();
}

function paintGuide() {
  const set = SETS[settings.audience];
  const g = $('guide');
  if (st.picks) { g.hidden = true; $('guide-words').textContent = ''; return; }
  g.hidden = false;
  const cols = st.board.cols;
  const nums = NUM_WORDS.slice(0, cols).join('・');
  $('back').hidden = false; // めくる直前もタッチで選び直せる
  $('omakase').hidden = $('ok').hidden = st.done;
  $('start').hidden = !st.done;
  if (st.done) {
    paintCue('guide', 'オッケー', 'で めくろう', 'オッケー を タッチ', 'オッケー・もどる');
    return;
  }
  const k = rowKey();
  const label = set.rows[k].label;
  const selected = st.sel[k];
  let main;
  if (selected.length >= MAX_PER_ROW) main = '3つ えらんだよ。つぎへ すすむね';
  else if (selected.length) main = `${selected.map(i => i + 1).join('・')}ばん。オッケーで つぎへ`;
  else main = `${label}？ 3つまで えらぼう`;
  paintCue('guide', '', main, '', `${nums}・オッケー・おまかせ・もどる`);
}

// 番号の指定（タッチ・声で共通）：その場で選択／解除する（2026-09-27 発案者指示）。
// 確定はカテゴリごとの「オッケー」（上限に達したら自動）と、めくる前の「オッケー」。
const AUTO_NEXT_MS = 700; // 上限に達してから次のカテゴリへ移るまでの間（選んだマスを見せるため）
let autoTimer = null;
function cancelAuto() { clearTimeout(autoTimer); autoTimer = null; }
function chooseNumber(c) {
  if (st.done || st.picks || autoTimer) return;
  const selected = st.sel[rowKey()];
  const i = selected.indexOf(c);
  if (i >= 0) selected.splice(i, 1);
  else if (selected.length < MAX_PER_ROW) selected.push(c);
  renderBoard();
  scheduleAuto();
}
function scheduleAuto() {
  if (st.sel[rowKey()].length >= MAX_PER_ROW) {
    const row = st.row;
    autoTimer = setTimeout(() => { autoTimer = null; if (!st.done && !st.picks && st.row === row) nextRow(); }, AUTO_NEXT_MS);
  }
}

// オッケー：このカテゴリはおわり（何も選んでいなければおまかせ）
function confirm() {
  if (st.done) return;
  cancelAuto();
  nextRow();
}
function nextRow() {
  cancelAuto();
  st.cand = null;
  if (st.row < ROW_KEYS.length - 1) { st.row++; renderBoard(); promptRow(); }
  else { st.done = true; renderBoard(); reader.speak([{ text: 'オッケーで、めくろう。' }]); }
}
function omakase() {
  if (st.done) return;
  cancelAuto();
  st.sel[rowKey()] = [];
  toast('おまかせ！');
  nextRow();
}
function back() {
  cancelAuto();
  st.cand = null;
  if (st.done) { st.done = false; renderBoard(); promptRow(); return; }
  if (st.row > 0) { st.row--; renderBoard(); promptRow(); }
  else { reader.stop(); openName(); } // 最初の行で「もどる」→ なまえの画面へ
}
function promptRow() {
  const set = SETS[settings.audience];
  reader.speak([{ text: `${set.rows[rowKey()].label}？` }]);
}
$('ok').onclick = confirm;
$('omakase').onclick = omakase;
$('back').onclick = back;
$('start').onclick = startReveal;

// ---------- MG-S04 めくりと物語 ----------
function startReveal() {
  cancelAuto();
  st.picks = resolvePicks(st.board, st.sel);
  st.story = buildStory({ audience: settings.audience, name: st.name, picks: st.picks, order: settings.order, avoid: new Set(recentScenes.flat()), avoidType: lastType });
  recentScenes.push(st.story.used); if (recentScenes.length > 2) recentScenes.shift();
  lastType = st.story.type;
  $('intro').textContent = st.story.intro;
  log(`生成 型=${st.story.type} 場面=${st.story.stages.join('→')} companion=${st.story.companion}`);
  $('board-btns').hidden = true;
  $('guide').innerHTML = '';
  renderBoard();
  const summary = picksSummary(settings.audience, st.picks);
  $('picks').innerHTML = summary.map((s, i) => `<li data-i="${i}">${esc(s)}</li>`).join('');
  $('story').innerHTML = st.story.lines.map((l, i) => `<li data-i="${i}" class="${l.shift ? 'shift' : ''}">${esc(l.text)}</li>`).join('');
  $('story-area').hidden = false;
  paintNavigation();
  paintAfterGuide();
  scheduleRead(); // めくりの演出が終わってから読む
  syncVoice();
}
function scheduleRead() {
  clearTimeout(revealTimer);
  const story = st.story;
  revealTimer = setTimeout(() => {
    revealTimer = null;
    if (st.screen === 'board' && st.story === story && !modal) readAll();
  }, 900);
}
function mark(listId, i) {
  document.querySelectorAll('#picks li, #story li').forEach(li => li.classList.remove('reading'));
  if (i === null) return;
  const li = document.querySelector(`#${listId} li[data-i="${i}"]`);
  if (!li) return;
  li.classList.add('reading');
  // 読んでいる行が画面に見えていれば動かさない（見出しへのスクロールを邪魔しないため）
  const r = li.getBoundingClientRect();
  if (r.top < 0 || r.bottom > innerHeight) li.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function readAll() {
  if (!reader.enabled || !reader.available) scrollToStory(); // 読み上げなしのときも物語まで移動する
  const summary = picksSummary(settings.audience, st.picks);
  const items = [
    ...summary.map((text, i) => ({ text, onStart: () => mark('picks', i) })),
    { text: st.story.intro, onStart: () => { mark('picks', null); scrollToStory(); } },
    ...st.story.lines.map((l, i) => ({ text: l.text, onStart: () => mark('story', i) })),
  ];
  reader.speak(items).then(() => mark('story', null));
}
// 物語の読み上げに入ったら、物語の見出しが画面の上に来るまでスクロールする
function scrollToStory() { $('intro').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
$('read').onclick = () => {
  if (!reader.enabled) { toast('よみあげは OFF です（はじめの画面で ON）'); return; }
  clearTimeout(revealTimer); revealTimer = null;
  scrollToStory();
  reader.speak(st.story.lines.map((l, i) => ({ text: l.text, onStart: () => mark('story', i) }))).then(() => mark('story', null));
};
$('stop').onclick = () => { clearTimeout(revealTimer); revealTimer = null; reader.stop(); mark('story', null); };
$('again').onclick = () => { reader.stop(); openName(); };
$('end').onclick = home;
function paintAfterGuide() {
  paintCue('after-guide', 'つぎ', 'で つぎの おはなし', 'つぎの おはなし を タッチ', 'つぎ・おわり');
}

// ---------- 声の入力（MG-T04） ----------
let micState = 'idle';
const canSpeak = () => microphoneEnabled() && micState === 'listening' && !reader.busy && !modal;
const speech = new StorySpeech({
  method: new URLSearchParams(location.search).get('speech'),
  onText: (raw, ctx) => { if (microphoneEnabled() && !document.hidden) handleText(raw, ctx); },
  onState: state => {
    const was = micState; micState = state;
    setMicState($('mic-state'), null, state);
    $('mic-notice').hidden = state !== 'denied';
    if (was !== state) queueMicrotask(repaint);
  },
});
// いまの画面で受け付ける区間。読み上げ・ダイアログ・非表示中は受け付けない
function voiceContext() {
  if (reader.busy || modal || document.hidden) return null;
  if (st.screen === 'start') return setsReady ? { type: 'top' } : null;
  if (st.screen === 'name') return { type: 'name', names: SETS[settings.audience].names, hasCand: !!st.nameCand };
  if (st.screen !== 'board') return null;
  if (st.picks) return { type: 'after' };
  if (st.done) return { type: 'ready' };
  return { type: 'row', cols: st.board.cols, row: st.row };
}
function syncVoice() {
  const ctx = voiceContext();
  if (!ctx || !microphoneEnabled()) { speech.close(); return; }
  speech.open(wordsFor(ctx), ctx, JSON.stringify(ctx));
}
function handleText(raw, ctx) {
  const now = voiceContext();
  if (!now || JSON.stringify(now) !== JSON.stringify(ctx)) return; // 区間が変わった後に届いた結果は捨てる
  const cmd = parse(raw, ctx);
  log(`きこえた「${raw}」→ ${cmd ? cmd.type + (cmd.value != null ? ':' + cmd.value : '') : '（なし）'}`);
  if (!cmd) return; // 登録外の発話・雑音は何もしない
  $('heard').textContent = `きこえた：${raw}`;
  clearTimeout(heardTimer); heardTimer = setTimeout(() => ($('heard').textContent = ''), 2500);
  if (ctx.type === 'top') {
    if (cmd.type === 'kids' || cmd.type === 'adult') setSetting('audience', cmd.type);
    else if (cmd.type === 'normal' || cmd.type === 'mechakucha') setSetting('order', cmd.type);
    else if (cmd.type === 'ok') openName();
  } else if (ctx.type === 'name') {
    if (cmd.type === 'back') home();
    else if (cmd.type === 'name') { st.nameCand = cmd.value; paintName(); }
    else if (cmd.type === 'ok') $('name-ok').click();
    else if (cmd.type === 'omakase') $('name-omakase').click();
  } else if (ctx.type === 'row') {
    if (cmd.type === 'number') chooseNumber(cmd.value);
    else if (cmd.type === 'ok') confirm();
    else if (cmd.type === 'omakase') omakase();
    else if (cmd.type === 'back') back();
  } else if (ctx.type === 'ready') {
    if (cmd.type === 'ok') startReveal();
    else if (cmd.type === 'back') back();
  } else if (ctx.type === 'after') {
    if (cmd.type === 'next') $('again').click();
    else if (cmd.type === 'end') home();
  }
}
let heardTimer;
// はじめの画面の案内（声で言えること）
function paintStartGuide() {
  paintCue('start-guide', setsReady ? 'オッケー' : '', setsReady ? 'で はじめる' : 'じゅんびちゅう',
    'はじめる を タッチ', setsReady ? 'こども・おとな・ふつう・めちゃくちゃ・オッケー' : '');
}
function repaint() {
  if (st.screen === 'start') paintStartGuide();
  if (st.screen === 'name') paintName();
  if (st.screen === 'board' && st.board) { paintGuide(); if (st.picks) paintAfterGuide(); }
}
reader.on(e => { if (e.type === 'busy') { repaint(); syncVoice(); } });
onMicrophoneChange(() => { repaint(); syncVoice(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) speech.close(); else syncVoice(); });
$('mic-retry').onclick = () => { speech.retry(); syncVoice(); };

// ---------- 共通 ----------
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
let toastTimer;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1500); }

// 開発確認用（声の入力をつなぐときの入口にもなる）
window.__story = { st, chooseNumber, confirm, omakase, back, startReveal, handleText, voiceContext };
