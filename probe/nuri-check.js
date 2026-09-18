// ヌリリズム 聞き分けプローブ（NR-04 実機検証用）
//
// 目的: ヌリリズムで増える語彙（座標=列A〜I・行1〜9、色12、移動、範囲/線、確定）を
//       区間ごとの文法で Vosk に食わせ、「言った語」に対して「正しく認識／取り違え／未認識」を数える。
// 立ち位置: 本番の音声入力層 (../src/speech/*) を読み込むだけ。実アプリのコードは無変更。
//           sw.js のキャッシュにも含めない独立ページ。既存2作品（ピタ/メモ）に影響しない。
// 限界: 発話は人が行う。この画面は文法の用意・結果集計・コピーだけを担う。

import { VoskAdapter } from '../src/speech/vosk.js';
import { normalize } from '../src/speech/vocabulary.js';

const $ = id => document.getElementById(id);
const nowText = () => new Date().toLocaleTimeString('ja-JP');
const log = t => { const el = $('log'); el.textContent += `${nowText()} ${t}\n`; el.scrollTop = el.scrollHeight; };

// 実機検証（2026-09-19）で確定した重要事実:
// - 連結発話「いちえー」(1A) や「したご」(下5) は語彙に無く、文法語にしても認識ゼロだった。
// - 一方、自由発話では「さん Ｃ」「四 Ｄ」のように数字トークン＋英字トークンの2語で返る。
// → 座標・移動＋数は「単独トークンの並び」で受け、認識結果を分割して合成する方式で検証する。
const ROW_SURFACES = ['いち', 'に', 'さん', 'よん', 'し', 'ご', 'ろく', 'なな', 'しち', 'はち', 'きゅう', 'く'];
const COL_SURFACES = ['えー', 'びー', 'しー', 'でぃー', 'いー', 'えふ', 'じー', 'えいち', 'えっち', 'あい'];
const DIR_SURFACES = ['みぎ', 'ひだり', 'うえ', 'した'];
// 読み（表記）→ 記号。照合は normalize 後のキーで行う。
const ROW_SYM = { 'いち': '1', 'に': '2', 'さん': '3', 'よん': '4', 'し': '4', 'ご': '5', 'ろく': '6', 'なな': '7', 'しち': '7', 'はち': '8', 'きゅう': '9', 'く': '9' };
const COL_SYM = { 'えー': 'A', 'びー': 'B', 'しー': 'C', 'でぃー': 'D', 'いー': 'E', 'えふ': 'F', 'じー': 'G', 'えいち': 'H', 'えっち': 'H', 'あい': 'I' };
const ROW_SYM_N = Object.fromEntries(Object.entries(ROW_SYM).map(([k, v]) => [normalize(k), v]));
const COL_SYM_N = Object.fromEntries(Object.entries(COL_SYM).map(([k, v]) => [normalize(k), v]));
const DIR_SET_N = new Set(DIR_SURFACES.map(normalize));

const PAIRS = [[1, 'A'], [2, 'B'], [3, 'C'], [4, 'D'], [5, 'E'], [6, 'F'], [7, 'G'], [8, 'H'], [9, 'I']];
// 座標: 発話順が違うだけで、行(row)と列(col)を当てられれば正解とする。
const COORD_RC = PAIRS.map(([d, c]) => ({ label: `${d}${c}`, row: String(d), col: c }));
const COORD_CR = PAIRS.map(([d, c]) => ({ label: `${c}${d}`, row: String(d), col: c }));
// 移動＋数（基本の右左上下は他アプリで実証済み。数付きの並びを検証）
const MOVE_NUM = [['した', 5], ['した', 2], ['みぎ', 3], ['ひだり', 4], ['うえ', 1], ['みぎ', 6]]
  .map(([dir, n]) => ({ label: `${dir}${n}`, dir, num: String(n) }));

// 区間ごとの語彙。forms = その語として受け付ける表記（照合は normalize 後の完全一致）。
// 認識器の文法にはこの forms をすべて渡す（＝この区間で受け付ける語だけを対象にする）。
const SETS = [
  { id: 'color', name: '色（12色）', targetReps: 3, items: [
    { label: 'あか',     forms: ['あか'] },
    { label: 'オレンジ', forms: ['おれんじ', 'オレンジ'] },
    { label: 'きいろ',   forms: ['きいろ'] },
    { label: 'きみどり', forms: ['きみどり', 'きみどりいろ'] },
    { label: 'みどり',   forms: ['みどり'] },
    { label: 'みずいろ', forms: ['みずいろ'] },
    { label: 'あお',     forms: ['あお'] },
    { label: 'むらさき', forms: ['むらさき'] },
    { label: 'ピンク',   forms: ['ぴんく', 'ピンク'] },
    { label: 'ちゃいろ', forms: ['ちゃいろ'] },
    { label: 'ブラウン', forms: ['ぶらうん', 'ブラウン'] },
    { label: 'しろ',     forms: ['しろ'] },
    { label: 'くろ',     forms: ['くろ'] },
  ]},
  { id: 'col', name: '列（A〜I）', targetReps: 3, items: [
    { label: 'A', forms: ['えー', 'エー'] },
    { label: 'B', forms: ['びー', 'ビー'] },
    { label: 'C', forms: ['しー', 'シー'] },
    { label: 'D', forms: ['でぃー', 'ディー'] },
    { label: 'E', forms: ['いー', 'イー'] },
    { label: 'F', forms: ['えふ', 'エフ'] },
    { label: 'G', forms: ['じー', 'ジー'] },
    { label: 'H', forms: ['えいち', 'エイチ', 'えっち'] },
    { label: 'I', forms: ['あい', 'アイ'] },
  ]},
  { id: 'row', name: '行（1〜9）', targetReps: 3, items: [
    { label: '1', forms: ['いち'] },
    { label: '2', forms: ['に'] },
    { label: '3', forms: ['さん'] },
    { label: '4', forms: ['よん', 'し'] },
    { label: '5', forms: ['ご'] },
    { label: '6', forms: ['ろく'] },
    { label: '7', forms: ['なな', 'しち'] },
    { label: '8', forms: ['はち'] },
    { label: '9', forms: ['きゅう', 'く'] },
  ]},
  { id: 'coordRC', name: '座標 行→列（1A＝いち えー と2語で）', mode: 'coord', targetReps: 3, items: COORD_RC, grammar: [...ROW_SURFACES, ...COL_SURFACES] },
  { id: 'coordCR', name: '座標 列→行（A1＝えー いち と2語で）', mode: 'coord', targetReps: 3, items: COORD_CR, grammar: [...ROW_SURFACES, ...COL_SURFACES] },
  { id: 'moveNum', name: '移動＋数（した5＝した ご と2語で）', mode: 'move', targetReps: 3, items: MOVE_NUM, grammar: [...DIR_SURFACES, ...ROW_SURFACES] },
  { id: 'range', name: '範囲・線（から/まで/せん）', targetReps: 3, items: [
    { label: 'から', forms: ['から'] },
    { label: 'まで', forms: ['まで'] },
    { label: 'せん', forms: ['せん'] },
  ]},
  { id: 'confirm', name: '確定（オーケー/けってい）', targetReps: 3, items: [
    { label: 'オーケー', forms: ['おーけー', 'オーケー', 'おっけー', 'オッケー'] },
    { label: 'けってい', forms: ['けってい'] },
  ]},
  { id: 'free', name: '自由（文法なし・生の認識を観察）', targetReps: 0, items: [] },
];

// 各 item.forms を normalize したセットを前計算（coord/move は forms を持たずトークン解析で判定）
for (const set of SETS) {
  for (const it of set.items) {
    if (it.forms) it.norm = new Set(it.forms.map(normalize));
    it.said = 0; it.correct = 0; it.unknown = 0; it.confusedInto = {};
  }
}

let adapter = null;
let ready = false;
let activeSet = null;   // 現在計測中の区間
let targetIdx = -1;     // 現在言ってほしい語のindex

function resetTally(set) {
  for (const it of set.items) { it.said = 0; it.correct = 0; it.unknown = 0; it.confusedInto = {}; }
}

// recognized(normalize済み) がどの item に属するか（なければ null）
function itemForNorm(set, n) {
  for (const it of set.items) if (it.norm.has(n)) return it;
  return null;
}

function renderSets() {
  const box = $('sets');
  box.innerHTML = '';
  for (const set of SETS) {
    const b = document.createElement('button');
    b.className = 'set';
    b.textContent = set.name;
    b.disabled = !ready;
    b.onclick = () => startSet(set);
    box.appendChild(b);
  }
}

function renderResult() {
  const box = $('result');
  if (!activeSet || activeSet.id === 'free') { box.innerHTML = ''; return; }
  const rows = activeSet.items.map(it => {
    const conf = Object.entries(it.confusedInto)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}×${v}`).join(' / ') || '—';
    const rate = it.said ? it.correct / it.said : 0;
    const cls = it.said === 0 ? '' : rate >= 0.8 ? 'ok' : rate >= 0.5 ? 'mid' : 'bad';
    const cur = activeSet.items[targetIdx] === it ? '▶ ' : '';
    return `<tr class="${cls}"><td>${cur}${it.label}</td><td class="n">${it.said}</td><td class="n">${it.correct}</td><td>${conf}</td><td class="n">${it.unknown}</td></tr>`;
  }).join('');
  box.innerHTML =
    `<p class="small">区間：<b>${activeSet.name}</b>　${targetIdx >= 0 && targetIdx < activeSet.items.length
      ? `いま言う語：<b>「${activeSet.items[targetIdx].label}」</b>（${activeSet.items[targetIdx].said}/${activeSet.targetReps}）`
      : '完了'}
     <button id="skip">この語をとばす</button><button id="again">最初からやり直す</button></p>` +
    `<table><thead><tr><th>語</th><th>言った</th><th>正しく認識</th><th>取り違え（化けた相手×回数）</th><th>未認識</th></tr></thead><tbody>${rows}</tbody></table>`;
  const skip = $('skip'); if (skip) skip.onclick = () => advanceTarget(true);
  const again = $('again'); if (again) again.onclick = () => startSet(activeSet);
}

function advanceTarget(force) {
  if (!activeSet) return;
  // 現在の語が規定回数に達したら次へ
  let idx = targetIdx;
  const cur = activeSet.items[idx];
  if (force || (cur && cur.said >= activeSet.targetReps)) {
    idx++;
    targetIdx = idx;
    if (idx >= activeSet.items.length) {
      $('status').textContent = `「${activeSet.name}」完了。結果をコピーして共有してください。`;
      log(`=== ${activeSet.name} 完了 ===`);
    } else {
      $('status').textContent = `「${activeSet.items[idx].label}」と${activeSet.targetReps}回言ってください。`;
    }
  }
  renderResult();
}

async function startSet(set) {
  if (!ready || !adapter) return;
  adapter.stop();
  resetTally(set);
  activeSet = set;
  targetIdx = set.items.length ? 0 : -1;
  let grammar = [];
  if (set.grammar) grammar = [...set.grammar];
  else for (const it of set.items) for (const f of it.forms) grammar.push(f);
  log(`--- 区間開始: ${set.name}（文法語数 ${grammar.length}）---`);
  if (set.id === 'free') {
    $('status').textContent = '文法なしで認識します。座標・色などを自由に言ってみてください（生の結果がログに出ます）。';
  } else {
    $('status').textContent = `「${set.items[0].label}」と${set.targetReps}回言ってください。`;
  }
  renderResult();
  try {
    await adapter.start(grammar);   // grammar が空なら全語彙認識（自由）
  } catch (e) {
    log(`区間開始エラー: ${e.message}`);
  }
}

// 認識文字列を空白でトークン分割し、行(数字)・列(英字)・方向を拾う。
// normalize は空白を除去するため、必ず分割してから各トークンを normalize する。
function parseTokens(text) {
  const toks = text.trim().split(/[\s　]+/).map(normalize).filter(Boolean);
  let row = null, col = null, dir = null;
  for (const t of toks) {
    if (row === null && ROW_SYM_N[t]) row = ROW_SYM_N[t];
    if (col === null && COL_SYM_N[t]) col = COL_SYM_N[t];
    if (dir === null && DIR_SET_N.has(t)) dir = t;
  }
  return { row, col, dir, toks };
}

function onResult(text) {
  log(`認識: ${text}`);
  if (!activeSet || activeSet.id === 'free') return;
  const target = activeSet.items[targetIdx];
  if (!target) return;

  if (activeSet.mode === 'coord') {
    const { row, col } = parseTokens(text);
    target.said++;
    if (row === target.row && col === target.col) {
      target.correct++;
    } else if (row === null && col === null) {
      target.unknown++;
      log(`  → 未認識/対象外: 「${text}」`);
    } else {
      const heard = `${row || '?'}${col || '?'}`;
      target.confusedInto[heard] = (target.confusedInto[heard] || 0) + 1;
      log(`  → 取り違え: 「${target.label}」と言って「${heard}」に認識`);
    }
    advanceTarget(false);
    return;
  }

  if (activeSet.mode === 'move') {
    const { dir, row } = parseTokens(text);
    target.said++;
    const dirOk = dir === normalize(target.dir);
    const numOk = row === target.num;
    if (dirOk && numOk) {
      target.correct++;
    } else if (dir === null && row === null) {
      target.unknown++;
      log(`  → 未認識/対象外: 「${text}」`);
    } else {
      const heard = `${target.dir && dirOk ? target.dir : (dir || '?')}${row || '?'}`;
      target.confusedInto[heard] = (target.confusedInto[heard] || 0) + 1;
      log(`  → 取り違え: 「${target.label}」と言って「${heard}」に認識`);
    }
    advanceTarget(false);
    return;
  }

  // 単独語（色・列・行・範囲・確定）
  const n = normalize(text);
  const matched = itemForNorm(activeSet, n);
  target.said++;
  if (matched === target) {
    target.correct++;
  } else if (matched) {
    target.confusedInto[matched.label] = (target.confusedInto[matched.label] || 0) + 1;
    log(`  → 取り違え: 「${target.label}」と言って「${matched.label}」に認識`);
  } else {
    target.unknown++;
    log(`  → 未認識/対象外: 「${n}」`);
  }
  advanceTarget(false);
}

$('stop').onclick = () => { adapter?.stop(); $('status').textContent = '停止しました。区間ボタンで再開できます。'; };
window.addEventListener('pagehide', () => adapter?.dispose());
window.addEventListener('error', e => log(`エラー: ${e.message}`));
window.addEventListener('unhandledrejection', e => log(`非同期エラー: ${e.reason?.message || e.reason}`));

$('copy').onclick = async () => {
  const lines = [];
  lines.push(`ヌリリズム 聞き分けチェック結果  ${new Date().toLocaleString('ja-JP')}`);
  lines.push(navigator.userAgent);
  for (const set of SETS) {
    if (set.id === 'free' || !set.items.some(it => it.said)) continue;
    lines.push(`\n[${set.name}]`);
    lines.push('語\t言った\t正解\t未認識\t取り違え');
    for (const it of set.items) {
      const conf = Object.entries(it.confusedInto).map(([k, v]) => `${k}×${v}`).join(',') || '';
      lines.push(`${it.label}\t${it.said}\t${it.correct}\t${it.unknown}\t${conf}`);
    }
  }
  lines.push('\n--- ログ ---');
  lines.push($('log').textContent);
  try { await navigator.clipboard.writeText(lines.join('\n')); $('copy').textContent = 'コピーしました'; }
  catch { $('status').textContent = 'コピーできません。ログを長押しで選択してください。'; }
};

log(navigator.userAgent);
log(`HTTPS: ${isSecureContext}`);

$('init').onclick = async () => {
  $('init').disabled = true;
  $('status').textContent = 'マイクとモデルを準備中…（初回はモデル取得で時間がかかります）';
  try {
    // ダミー文法で初期化だけ先に済ませる（モデル・マイク・音声グラフの用意）
    await adapter.start(['あか']);
    adapter.stop();
    ready = true;
    $('stop').disabled = false;
    $('status').textContent = '準備できました。区間を選んで語を読み上げてください。';
    renderSets();
    log('準備完了。');
  } catch (e) {
    $('status').textContent = '準備に失敗しました。ログをお知らせください。';
    log(`準備エラー: ${e.message}`);
    $('init').disabled = false;
  }
};

try {
  adapter = new VoskAdapter();
  adapter.on('status', (code, detail) => log(`状態: ${code}${detail ? ` (${detail})` : ''}`));
  adapter.on('error', code => log(`エラー: ${code}`));
  adapter.on('result', text => { if (text) onResult(text); });
  if (!await adapter.isAvailable()) {
    $('status').textContent = 'このブラウザでは音声機能を開始できません。';
    log('必要なブラウザ機能が不足しています。');
  } else {
    $('init').disabled = false;
    $('status').textContent = '「マイクを許可して開始」を押してください。';
  }
  renderSets();
} catch (e) {
  $('status').textContent = 'プログラムを読み込めませんでした。';
  log(`初期化エラー: ${e.name}: ${e.message}`);
}
