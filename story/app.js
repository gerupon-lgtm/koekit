// モノガタリズム（仮称）試作 — 画面と状態（基本設計4〜5節）
// 声での入力（MG-T04）は次の段階。いまはタッチで同じ流れを確かめる。
import { SETS, ROW_KEYS } from './story-data.js';
import { makeBoard, resolvePicks, buildStory, picksSummary, MAX_PER_ROW } from './story.js';
import { Reader } from './tts.js';

const $ = id => document.getElementById(id);
const NUM_WORDS = ['いち', 'に', 'さん', 'よん', 'ご'];
const SETTINGS_KEY = 'koekit.story.settings';

// ---------- 設定（端末内に保存。失敗しても既定値で動く） ----------
const settings = { audience: 'kids', tts: 'on', order: 'normal', rate: 1, voice: '' };
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
if (settings.voice) reader.voiceURI = settings.voice;

// ---------- 状態 ----------
const st = {
  screen: 'start',
  name: '', nameCand: null,
  board: null, row: 0, cand: null, sel: null, done: false,
  picks: null, story: null,
};

function show(screen) {
  st.screen = screen;
  for (const id of ['start', 'name', 'board']) $('s-' + id).hidden = id !== (screen === 'story' ? 'board' : screen);
  window.scrollTo(0, 0);
}
function home() { reader.stop(); show('start'); }
document.querySelectorAll('[data-home]').forEach(b => (b.onclick = home));

// ---------- MG-S01 はじめ ----------
document.querySelectorAll('.seg').forEach(seg => {
  const key = seg.dataset.key;
  const paint = () => seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === settings[key])));
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    settings[key] = b.dataset.v; saveSettings(); paint(); applySettings();
  });
  paint();
});
function applySettings() {
  document.body.classList.toggle('kids', settings.audience === 'kids');
  document.body.classList.toggle('adult', settings.audience === 'adult');
  reader.enabled = settings.tts === 'on';
}
applySettings();
$('go-name').onclick = () => openName();

$('rate').value = settings.rate; $('rateV').textContent = (+settings.rate).toFixed(1);
$('rate').oninput = () => { settings.rate = reader.rate = +$('rate').value; $('rateV').textContent = reader.rate.toFixed(1); saveSettings(); };
$('voice').onchange = () => { settings.voice = reader.voiceURI = $('voice').value; saveSettings(); };
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
    o.value = v.voiceURI; o.textContent = `${v.name}${v.localService ? '（端末内）' : '（ネット経由の可能性）'}`;
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
  $('names').querySelectorAll('button').forEach(b => b.classList.toggle('cand', b.textContent === st.nameCand));
  $('name-ok').disabled = !st.nameCand;
  $('name-guide').innerHTML = st.nameCand
    ? `「${esc(st.nameCand)}」で いい？ →「オッケー」`
    : 'なまえを えらんでね';
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
  st.row = 0; st.cand = null; st.done = false; st.picks = null; st.story = null;
  $('who').textContent = `しゅじんこう：${st.name}`;
  $('story-area').hidden = true;
  $('board-btns').hidden = false;
  show('board');
  renderBoard();
  promptRow();
  log(`盤面 mode=${settings.audience} order=${settings.order}`);
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
    lab.innerHTML = `<span class="ico">${set.rows[k].icon}</span>${set.rows[k].label}`;
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
          cell.innerHTML = `<span class="emo">${it.e}</span><span class="word">${esc(it.w)}</span>`
            + (p.omakase ? '<span class="badge omakase">おまかせ</span>' : `<span class="badge">${p.idx.indexOf(c) + 1}</span>`);
        } else {
          cell.classList.add('dim');
          cell.textContent = c + 1;
        }
      } else {
        cell.textContent = c + 1;
        cell.setAttribute('aria-label', `${set.rows[k].label} ${c + 1}ばん`);
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
}

function paintGuide() {
  const set = SETS[settings.audience];
  const g = $('guide');
  if (st.picks) { g.innerHTML = ''; return; }
  const cols = st.board.cols;
  const nums = NUM_WORDS.slice(0, cols).join('・');
  $('back').hidden = $('omakase').hidden = $('ok').hidden = st.done;
  $('start').hidden = !st.done;
  $('back').disabled = !st.done && st.row === 0;
  if (st.done) {
    g.innerHTML = '「スタート」で めくろう<span class="words">いえること：スタート・もどる</span>';
    return;
  }
  const k = rowKey();
  const label = set.rows[k].label;
  const selected = st.sel[k];
  let main;
  if (st.cand !== null) {
    main = selected.includes(st.cand) ? `${st.cand + 1}ばんを はずす？ →「オッケー」` : `${st.cand + 1}ばんに する？ →「オッケー」`;
  } else if (selected.length) {
    main = selected.length >= MAX_PER_ROW ? `もう いっぱい（${MAX_PER_ROW}つまで）。「オッケー」で つぎへ` : `ほかも えらべるよ。おわりなら「オッケー」`;
  } else {
    main = `「${label}？」 ばんごうを えらんでね`;
  }
  g.innerHTML = `${main}<span class="words">いえること：${nums}・オッケー・おまかせ・もどる</span>`;
}

// 番号の指定（タッチ・声で共通）→ 候補を光らせるだけ（2段階確定）
function chooseNumber(c) {
  if (st.done || st.picks) return;
  const selected = st.sel[rowKey()];
  if (!selected.includes(c) && selected.length >= MAX_PER_ROW) { st.cand = null; toast(`${MAX_PER_ROW}つまで だよ`); renderBoard(); return; }
  st.cand = c;
  renderBoard();
}

// オッケー：候補あり→選択／解除。候補なし→この行はおわり
function confirm() {
  if (st.done) return;
  const selected = st.sel[rowKey()];
  if (st.cand !== null) {
    const i = selected.indexOf(st.cand);
    if (i >= 0) selected.splice(i, 1); else selected.push(st.cand);
    st.cand = null;
    renderBoard();
    return;
  }
  nextRow();
}
function nextRow() {
  st.cand = null;
  if (st.row < ROW_KEYS.length - 1) { st.row++; renderBoard(); promptRow(); }
  else { st.done = true; renderBoard(); reader.speak([{ text: 'スタートで、めくろう。' }]); }
}
function omakase() {
  if (st.done) return;
  st.sel[rowKey()] = [];
  toast('おまかせ！');
  nextRow();
}
function back() {
  st.cand = null;
  if (st.done) { st.done = false; renderBoard(); promptRow(); return; }
  if (st.row > 0) { st.row--; renderBoard(); promptRow(); }
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
  st.picks = resolvePicks(st.board, st.sel);
  st.story = buildStory({ audience: settings.audience, name: st.name, picks: st.picks, order: settings.order });
  log(`生成 companion=${st.story.companion} 行数=${st.story.lines.length}`);
  $('board-btns').hidden = true;
  $('guide').innerHTML = '';
  renderBoard();
  const summary = picksSummary(settings.audience, st.picks);
  $('picks').innerHTML = summary.map((s, i) => `<li data-i="${i}">${esc(s)}</li>`).join('');
  $('story').innerHTML = st.story.lines.map((l, i) => `<li data-i="${i}" class="${l.shift ? 'shift' : ''}">${esc(l.text)}</li>`).join('');
  $('story-area').hidden = false;
  setTimeout(() => readAll(), 900); // めくりの演出が終わってから読む
}
function mark(listId, i) {
  document.querySelectorAll('#picks li, #story li').forEach(li => li.classList.remove('reading'));
  if (i === null) return;
  const li = document.querySelector(`#${listId} li[data-i="${i}"]`);
  li?.classList.add('reading');
  li?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function readAll() {
  const summary = picksSummary(settings.audience, st.picks);
  const items = [
    ...summary.map((text, i) => ({ text, onStart: () => mark('picks', i) })),
    { text: settings.audience === 'kids' ? 'では、おはなしを よむね。' : 'それでは、物語のはじまりです。', onStart: () => mark('picks', null) },
    ...st.story.lines.map((l, i) => ({ text: l.text, onStart: () => mark('story', i) })),
  ];
  reader.speak(items).then(() => mark('story', null));
}
$('read').onclick = () => {
  if (!reader.enabled) { toast('よみあげは OFF です（はじめの画面で ON）'); return; }
  reader.speak(st.story.lines.map((l, i) => ({ text: l.text, onStart: () => mark('story', i) }))).then(() => mark('story', null));
};
$('stop').onclick = () => { reader.stop(); mark('story', null); };
$('again').onclick = () => { reader.stop(); openName(); };

// ---------- 共通 ----------
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
let toastTimer;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1500); }

// 開発確認用（声の入力をつなぐときの入口にもなる）
window.__story = { st, chooseNumber, confirm, omakase, back, startReveal };
