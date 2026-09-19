// ヌリリズム 聞き分けプローブ（実験台 / NR-04）
//
// 目的: 認識モード（制限文法 / 自由）× 照合方式（完全一致 / 前方一致 / regexテーブル）を
//       同じ発話で測り比べ、区間ごとに最適な組み合わせを数字で絞る。
// 立ち位置: 本番の音声入力層 (../src/speech/*) を読み込むだけ。実アプリ無変更・SWキャッシュ対象外。
//
// 実機で分かっている事実（2026-09-19）:
// - 制限文法だと ちゃいろ→きいろ に潰れる（出力が本物の黄と同一で後段で救えない）。
//   自由だと ちゃいろ→「茶色」と綴りが生き残る → regex/テーブルで写せる。
// - 座標は連結1語（いちえー）は不成立。数字＋英字の2トークンで返る。列→行順（A1）が実測100%。
// - regexは自由認識の出力に効く。前方一致は先頭が衝突しない語で有効。

import { VoskAdapter } from '../src/speech/vosk.js';
import { normalize } from '../src/speech/vocabulary.js';

const VERSION = 'v4';
const $ = id => document.getElementById(id);
const nowText = () => new Date().toLocaleTimeString('ja-JP');
const log = t => { const el = $('log'); el.textContent += `${nowText()} ${t}\n`; el.scrollTop = el.scrollHeight; };

// ---- 座標・移動用の代表読み（2トークン方式） ---------------------------------
const ROW_SURFACES = ['いち', 'に', 'さん', 'よん', 'し', 'ご', 'ろく', 'なな', 'しち', 'はち', 'きゅう', 'く'];
const COL_SURFACES = ['えー', 'びー', 'しー', 'でぃー', 'いー', 'えふ', 'じー', 'えいち', 'えっち', 'あい'];
const DIR_SURFACES = ['みぎ', 'ひだり', 'うえ', 'した'];
const ROW_SYM = { 'いち': '1', 'に': '2', 'さん': '3', 'よん': '4', 'し': '4', 'ご': '5', 'ろく': '6', 'なな': '7', 'しち': '7', 'はち': '8', 'きゅう': '9', 'く': '9' };
const COL_SYM = { 'えー': 'A', 'びー': 'B', 'しー': 'C', 'でぃー': 'D', 'いー': 'E', 'えふ': 'F', 'じー': 'G', 'えいち': 'H', 'えっち': 'H', 'あい': 'I' };
const ROW_SYM_N = Object.fromEntries(Object.entries(ROW_SYM).map(([k, v]) => [normalize(k), v]));
const COL_SYM_N = Object.fromEntries(Object.entries(COL_SYM).map(([k, v]) => [normalize(k), v]));
const DIR_SET_N = new Set(DIR_SURFACES.map(normalize));
const PAIRS = [[1, 'A'], [2, 'B'], [3, 'C'], [4, 'D'], [5, 'E'], [6, 'F'], [7, 'G'], [8, 'H'], [9, 'I']];
const COORD_RC = PAIRS.map(([d, c]) => ({ label: `${d}${c}`, row: String(d), col: c }));
const COORD_CR = PAIRS.map(([d, c]) => ({ label: `${c}${d}`, row: String(d), col: c }));
const MOVE_NUM = [['した', 5], ['した', 2], ['みぎ', 3], ['ひだり', 4], ['うえ', 1], ['みぎ', 6]]
  .map(([dir, n]) => ({ label: `${dir}${n}`, dir, num: String(n) }));

// ---- 区間定義 --------------------------------------------------------------
// 単語区間の item: { label, forms:[読み], patterns:[/regex/] }
//   forms  … 完全一致・前方一致で使う（normalize 後に照合）
//   patterns … regexテーブル。生の認識文字列（漢字・全角も温存）に対して test する。順序＝優先。
//   ※ 複合語（黄緑/水色）を基本色より前に置き、誤マッチを防ぐ
const SETS = [
  { id: 'color', name: '色（12色）', kind: 'word', targetReps: 3, items: [
    { label: 'あか',     forms: ['あか'],               patterns: [/赤/, /あか/, /レッド/] },
    { label: 'オレンジ', forms: ['おれんじ', 'オレンジ'], patterns: [/オレンジ/, /おれんじ/, /橙/] },
    { label: 'きみどり', forms: ['きみどり', 'きみどりいろ'], patterns: [/黄緑/, /きみどり/, /黄みどり/] },
    { label: 'きいろ',   forms: ['きいろ'],             patterns: [/黄色/, /きいろ/, /イエロー/, /^黄$/] },
    { label: 'みずいろ', forms: ['みずいろ'],           patterns: [/水色/, /みずいろ/, /^水$/] },
    { label: 'みどり',   forms: ['みどり'],             patterns: [/緑/, /みどり/, /グリーン/] },
    { label: 'あお',     forms: ['あお'],               patterns: [/青/, /あお/, /ブルー/] },
    { label: 'むらさき', forms: ['むらさき'],           patterns: [/紫/, /むらさき/, /パープル/] },
    { label: 'ピンク',   forms: ['ぴんく', 'ピンク'],    patterns: [/ピンク/, /ぴんく/, /桃/] },
    { label: '茶(茶色/ちゃいろ/ブラウン)', forms: ['ちゃいろ', '茶色', 'ぶらうん', 'ブラウン'], patterns: [/茶/, /ちゃいろ/, /ブラウン/, /ぶらうん/, /ジャイロ/] },
    { label: 'しろ',     forms: ['しろ'],               patterns: [/白/, /しろ/, /ホワイト/] },
    { label: 'くろ',     forms: ['くろ'],               patterns: [/黒/, /くろ/, /ブラック/] },
  ]},
  { id: 'col', name: '列（A〜I）', kind: 'word', targetReps: 3, items: [
    { label: 'A', forms: ['えー', 'エー'],           patterns: [/えー/, /エー/, /ええ/, /^A$/i, /Ａ/] },
    { label: 'B', forms: ['びー', 'ビー'],           patterns: [/びー/, /ビー/, /びい/, /^B$/i, /Ｂ/] },
    { label: 'C', forms: ['しー', 'シー'],           patterns: [/しー/, /シー/, /^C$/i, /Ｃ/] },
    { label: 'D', forms: ['でぃー', 'ディー'],       patterns: [/でぃー/, /ディー/, /^D$/i, /Ｄ/] },
    { label: 'E', forms: ['いー', 'イー'],           patterns: [/いー/, /イー/, /いい/, /^E$/i, /Ｅ/] },
    { label: 'F', forms: ['えふ', 'エフ'],           patterns: [/えふ/, /エフ/, /^F$/i, /Ｆ/] },
    { label: 'G', forms: ['じー', 'ジー'],           patterns: [/じー/, /ジー/, /時/, /^G$/i, /Ｇ/] },
    { label: 'H', forms: ['えいち', 'エイチ', 'えっち'], patterns: [/えいち/, /エイチ/, /えっち/, /エッチ/, /初/, /淳/, /^H$/i, /Ｈ/, /ｈ/] },
    { label: 'I', forms: ['あい', 'アイ'],           patterns: [/あい/, /アイ/, /愛/, /^はい$/, /^い$/, /^I$/i, /Ｉ/] },
  ]},
  { id: 'row', name: '行（1〜9）', kind: 'word', targetReps: 3, items: [
    { label: '1', forms: ['いち'],        patterns: [/^いち/, /^一$/, /^市$/, /^いっ/] },
    { label: '2', forms: ['に'],          patterns: [/^に$/, /^二$/, /^日$/] },
    { label: '3', forms: ['さん'],        patterns: [/さん/, /三/] },
    { label: '4', forms: ['よん', 'し'],  patterns: [/よん/, /^し$/, /四/] },
    { label: '5', forms: ['ご'],          patterns: [/^ご$/, /五/, /^後$/] },
    { label: '6', forms: ['ろく'],        patterns: [/ろく/, /六/] },
    { label: '7', forms: ['なな', 'しち'],patterns: [/なな/, /しち/, /七/] },
    { label: '8', forms: ['はち'],        patterns: [/はち/, /八/] },
    { label: '9', forms: ['きゅう', 'く'],patterns: [/きゅう/, /^く$/, /九/] },
  ]},
  { id: 'coordRC', name: '座標 行→列（1A＝いち えー と2語で）', mode: 'coord', targetReps: 3, items: COORD_RC, grammar: [...ROW_SURFACES, ...COL_SURFACES] },
  { id: 'coordCR', name: '座標 列→行（A1＝えー いち と2語で）', mode: 'coord', targetReps: 3, items: COORD_CR, grammar: [...ROW_SURFACES, ...COL_SURFACES] },
  { id: 'moveNum', name: '移動＋数（した5＝した ご と2語で）', mode: 'move', targetReps: 3, items: MOVE_NUM, grammar: [...DIR_SURFACES, ...ROW_SURFACES] },
  { id: 'range', name: '範囲・線（から/まで/せん）', kind: 'word', targetReps: 3, items: [
    { label: 'から', forms: ['から'], patterns: [/から/] },
    { label: 'まで', forms: ['まで'], patterns: [/まで/] },
    { label: 'せん', forms: ['せん'], patterns: [/せん/, /線/, /千/, /先/] },
  ]},
  { id: 'confirm', name: '確定（オーケー/けってい）', kind: 'word', targetReps: 3, items: [
    { label: 'オーケー', forms: ['おーけー', 'オーケー', 'おっけー', 'オッケー'], patterns: [/おーけー/, /オーケー/, /おっけー/, /オッケー/, /OK/i, /オケ/] },
    { label: 'けってい', forms: ['けってい'], patterns: [/けってい/, /決定/, /けって/] },
  ]},
  { id: 'free', name: '自由（文法なし・生の認識を観察）', kind: 'free', targetReps: 0, items: [] },
];

// マッチャ定義（順序＝表示順）
const MATCHERS = ['exact', 'prefix', 'regex'];
const MATCHER_LABEL = { exact: '完全一致', prefix: '前方一致', regex: 'regex' };

// 前計算＆カウンタ初期化
function initItem(it) {
  if (it.forms) it.norm = new Set(it.forms.map(normalize));
  it.said = 0;
  // 単語区間: マッチャごとの成績
  it.m = {};
  for (const m of MATCHERS) it.m[m] = { ok: 0, ng: 0, none: 0, conf: {} };
  // 座標・移動: トークン方式の成績
  it.correct = 0; it.unknown = 0; it.confusedInto = {};
}
for (const set of SETS) for (const it of set.items) initItem(it);
function resetTally(set) { for (const it of set.items) initItem(it); }

// ---- 照合（単語区間） ------------------------------------------------------
function matchExact(set, text) {
  const n = normalize(text);
  for (const it of set.items) if (it.norm && it.norm.has(n)) return it;
  return null;
}
// 前方一致: 出力(n)と各formの、どちらかが他方の接頭辞。最長一致で決め、別itemと同点なら曖昧として棄却。
function matchPrefix(set, text) {
  const n = normalize(text);
  if (!n) return null;
  let best = null, bestLen = 0, ambiguous = false;
  for (const it of set.items) {
    if (!it.forms) continue;
    for (const f of it.forms) {
      const fn = normalize(f);
      if (!fn) continue;
      if (n.startsWith(fn) || (n.length >= 2 && fn.startsWith(n))) {
        const len = Math.min(n.length, fn.length);
        if (len > bestLen) { bestLen = len; best = it; ambiguous = false; }
        else if (len === bestLen && best && best !== it) ambiguous = true;
      }
    }
  }
  return ambiguous ? null : best;
}
// regexテーブル: 生テキストに対して、item順・pattern順で最初に当たったものを返す。
function matchRegex(set, text) {
  for (const it of set.items) {
    if (!it.patterns) continue;
    for (const re of it.patterns) if (re.test(text)) return it;
  }
  return null;
}
const MATCH_FN = { exact: matchExact, prefix: matchPrefix, regex: matchRegex };

// ---- 照合（座標・移動：トークン分割） --------------------------------------
function parseTokens(text) {
  const toks = text.trim().split(/[\s　]+/).map(normalize).filter(Boolean);
  let row = null, col = null, dir = null;
  for (const t of toks) {
    if (row === null && ROW_SYM_N[t]) row = ROW_SYM_N[t];
    if (col === null && COL_SYM_N[t]) col = COL_SYM_N[t];
    if (dir === null && DIR_SET_N.has(t)) dir = t;
  }
  return { row, col, dir };
}

// ---- 状態 ------------------------------------------------------------------
let adapter = null, ready = false, activeSet = null, targetIdx = -1;
let recogMode = 'grammar';  // 'grammar' | 'free'

// ---- UI --------------------------------------------------------------------
function renderModes() {
  const box = $('modes');
  box.innerHTML = '';
  for (const [val, label] of [['grammar', '制限文法'], ['free', '自由']]) {
    const b = document.createElement('button');
    b.className = 'mode' + (recogMode === val ? ' active' : '');
    b.textContent = label;
    b.onclick = () => { recogMode = val; renderModes(); $('status').textContent = `認識モード：${label}。区間を選んでください。`; };
    box.appendChild(b);
  }
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
  if (!activeSet || activeSet.kind === 'free') { box.innerHTML = ''; return; }
  const modeLabel = recogMode === 'grammar' ? '制限文法' : '自由';
  const curLabel = (targetIdx >= 0 && targetIdx < activeSet.items.length)
    ? `いま言う語：<b>「${activeSet.items[targetIdx].label}」</b>（${activeSet.items[targetIdx].said}/${activeSet.targetReps}）`
    : '完了';
  const head = `<p class="small">区間：<b>${activeSet.name}</b>／モード：<b>${modeLabel}</b>　${curLabel}
    <button id="skip">この語をとばす</button><button id="again">やり直す</button></p>`;

  let table;
  if (activeSet.kind === 'word') {
    // マッチャ横断の要約：区間合計の正解率
    const tot = {}; for (const m of MATCHERS) tot[m] = { ok: 0, said: 0 };
    const rows = activeSet.items.map(it => {
      const cur = activeSet.items[targetIdx] === it ? '▶ ' : '';
      const cells = MATCHERS.map(m => {
        tot[m].ok += it.m[m].ok; tot[m].said += it.said;
        const conf = Object.entries(it.m[m].conf).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(',');
        return `<td class="n">${it.m[m].ok}/${it.said}</td><td>${conf || (it.m[m].none ? `無×${it.m[m].none}` : '')}</td>`;
      }).join('');
      return `<tr><td>${cur}${it.label}</td>${cells}</tr>`;
    }).join('');
    const sumCells = MATCHERS.map(m => {
      const r = tot[m].said ? Math.round(100 * tot[m].ok / tot[m].said) : 0;
      return `<td class="n"><b>${r}%</b></td><td>${tot[m].ok}/${tot[m].said}</td>`;
    }).join('');
    const th = MATCHERS.map(m => `<th>${MATCHER_LABEL[m]}</th><th>誤/無</th>`).join('');
    table = `<table><thead><tr><th>語</th>${th}</tr></thead><tbody>${rows}
      <tr class="ok"><td><b>正解率</b></td>${sumCells}</tr></tbody></table>`;
  } else {
    // 座標・移動（トークン方式）
    const rows = activeSet.items.map(it => {
      const conf = Object.entries(it.confusedInto).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' / ') || '—';
      const rate = it.said ? it.correct / it.said : 0;
      const cls = it.said === 0 ? '' : rate >= 0.8 ? 'ok' : rate >= 0.5 ? 'mid' : 'bad';
      const cur = activeSet.items[targetIdx] === it ? '▶ ' : '';
      return `<tr class="${cls}"><td>${cur}${it.label}</td><td class="n">${it.said}</td><td class="n">${it.correct}</td><td>${conf}</td><td class="n">${it.unknown}</td></tr>`;
    }).join('');
    table = `<table><thead><tr><th>語</th><th>言った</th><th>正解</th><th>取り違え</th><th>未認識</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  box.innerHTML = head + table;
  const skip = $('skip'); if (skip) skip.onclick = () => advanceTarget(true);
  const again = $('again'); if (again) again.onclick = () => startSet(activeSet);
}

function advanceTarget(force) {
  if (!activeSet) return;
  const cur = activeSet.items[targetIdx];
  if (force || (cur && cur.said >= activeSet.targetReps)) {
    targetIdx++;
    if (targetIdx >= activeSet.items.length) {
      $('status').textContent = `「${activeSet.name}」完了。結果をコピーして共有してください。`;
      log(`=== ${activeSet.name} 完了 ===`);
    } else {
      $('status').textContent = `「${activeSet.items[targetIdx].label}」と${activeSet.targetReps}回言ってください。`;
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
  // 文法の決定: モードが自由なら空。制限なら set.grammar か forms を渡す。
  let grammar = [];
  if (recogMode === 'grammar' && set.kind !== 'free') {
    if (set.grammar) grammar = [...set.grammar];
    else for (const it of set.items) if (it.forms) for (const f of it.forms) grammar.push(f);
  }
  const modeLabel = recogMode === 'grammar' ? '制限文法' : '自由';
  log(`--- 区間開始: ${set.name}／${modeLabel}（文法語数 ${grammar.length}）---`);
  $('status').textContent = set.items.length
    ? `「${set.items[0].label}」と${set.targetReps}回言ってください。`
    : '自由に言ってみてください（生の結果がログに出ます）。';
  renderResult();
  try { await adapter.start(grammar); }
  catch (e) { log(`区間開始エラー: ${e.message}`); }
}

function onResult(text) {
  log(`認識: ${text}`);
  if (!activeSet || activeSet.kind === 'free') return;
  const target = activeSet.items[targetIdx];
  if (!target) return;

  if (activeSet.mode === 'coord') {
    const { row, col } = parseTokens(text);
    target.said++;
    if (row === target.row && col === target.col) target.correct++;
    else if (row === null && col === null) { target.unknown++; log(`  → 未認識: 「${text}」`); }
    else { const h = `${row || '?'}${col || '?'}`; target.confusedInto[h] = (target.confusedInto[h] || 0) + 1; log(`  → 取り違え: 「${target.label}」→「${h}」`); }
    advanceTarget(false);
    return;
  }
  if (activeSet.mode === 'move') {
    const { dir, row } = parseTokens(text);
    target.said++;
    const dirOk = dir === normalize(target.dir), numOk = row === target.num;
    if (dirOk && numOk) target.correct++;
    else if (dir === null && row === null) { target.unknown++; log(`  → 未認識: 「${text}」`); }
    else { const h = `${dirOk ? target.dir : (dir || '?')}${row || '?'}`; target.confusedInto[h] = (target.confusedInto[h] || 0) + 1; log(`  → 取り違え: 「${target.label}」→「${h}」`); }
    advanceTarget(false);
    return;
  }

  // 単語区間: 3方式で同時採点
  target.said++;
  const marks = [];
  for (const m of MATCHERS) {
    const hit = MATCH_FN[m](activeSet, text);
    if (hit === target) { target.m[m].ok++; marks.push(`${MATCHER_LABEL[m]}:○`); }
    else if (hit) { target.m[m].ng++; target.m[m].conf[hit.label] = (target.m[m].conf[hit.label] || 0) + 1; marks.push(`${MATCHER_LABEL[m]}:×${hit.label}`); }
    else { target.m[m].none++; marks.push(`${MATCHER_LABEL[m]}:無`); }
  }
  log(`  → ${target.label}: ${marks.join(' / ')}`);
  advanceTarget(false);
}

// ---- 操作系 ----------------------------------------------------------------
$('stop').onclick = () => { adapter?.stop(); $('status').textContent = '停止しました。区間ボタンで再開できます。'; };
window.addEventListener('pagehide', () => adapter?.dispose());
window.addEventListener('error', e => log(`エラー: ${e.message}`));
window.addEventListener('unhandledrejection', e => log(`非同期エラー: ${e.reason?.message || e.reason}`));

$('copy').onclick = async () => {
  const lines = [];
  lines.push(`ヌリリズム 聞き分けチェック結果 ${VERSION}  ${new Date().toLocaleString('ja-JP')}`);
  lines.push(navigator.userAgent);
  for (const set of SETS) {
    if (!set.items.some(it => it.said)) continue;
    lines.push(`\n[${set.name}]`);
    if (set.kind === 'word') {
      const tot = {}; for (const m of MATCHERS) tot[m] = { ok: 0, said: 0 };
      lines.push('語\t言った\t' + MATCHERS.map(m => `${MATCHER_LABEL[m]}(正/誤/無)`).join('\t'));
      for (const it of set.items) {
        const cells = MATCHERS.map(m => {
          tot[m].ok += it.m[m].ok; tot[m].said += it.said;
          const conf = Object.entries(it.m[m].conf).map(([k, v]) => `${k}×${v}`).join(',');
          return `${it.m[m].ok}/${it.m[m].ng}/${it.m[m].none}${conf ? '(' + conf + ')' : ''}`;
        }).join('\t');
        lines.push(`${it.label}\t${it.said}\t${cells}`);
      }
      lines.push('正解率\t\t' + MATCHERS.map(m => (tot[m].said ? Math.round(100 * tot[m].ok / tot[m].said) : 0) + '%').join('\t'));
    } else {
      lines.push('語\t言った\t正解\t未認識\t取り違え');
      for (const it of set.items) {
        const conf = Object.entries(it.confusedInto).map(([k, v]) => `${k}×${v}`).join(',');
        lines.push(`${it.label}\t${it.said}\t${it.correct}\t${it.unknown}\t${conf}`);
      }
    }
  }
  lines.push('\n--- ログ ---');
  lines.push($('log').textContent);
  try { await navigator.clipboard.writeText(lines.join('\n')); $('copy').textContent = 'コピーしました'; }
  catch { $('status').textContent = 'コピーできません。ログを長押しで選択してください。'; }
};

// ---- 起動 ------------------------------------------------------------------
$('ver').textContent = VERSION;
log(`${VERSION} / ${navigator.userAgent}`);
log(`HTTPS: ${isSecureContext}`);

$('init').onclick = async () => {
  $('init').disabled = true;
  $('status').textContent = 'マイクとモデルを準備中…（初回はモデル取得で時間がかかります）';
  try {
    await adapter.start(['あか']);  // 初期化だけ先に済ませる
    adapter.stop();
    ready = true;
    $('stop').disabled = false;
    $('status').textContent = '準備できました。モードを選び、区間ボタンを押してください。';
    renderModes();
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
  renderModes();
  renderSets();
} catch (e) {
  $('status').textContent = 'プログラムを読み込めませんでした。';
  log(`初期化エラー: ${e.name}: ${e.message}`);
}
