// イロドリズム 音声語彙・文法・解析 — docs/irodori/ の確定設計に準拠
// 全区間 制限文法。読みは実機検証で選定（A=えー/えい/ええ/え、D=でー、H=えっち、C=しー/しい 等）。
// 座標の列に単独「し」は入れない（数字4=しと衝突）。共通の normalize を流用。
import { normalize } from '../src/speech/vocabulary.js';

// 列(A〜I) 受け付け読み
const COL = {
  A: ['えー', 'エー', 'えい', 'エイ', 'ええ', 'エエ', 'え'],
  B: ['びー', 'ビー', 'びい', 'びぃー', 'ビィー', 'びぃ'],
  C: ['しー', 'シー', 'しい'],
  D: ['でー', 'で', 'でぃ', 'ディ', 'でぃー', 'ディー'],
  E: ['いー', 'イー'],
  F: ['えふ', 'エフ'],
  G: ['じー', 'ジー'],
  H: ['えっち', 'エッチ', 'えいち', 'エイチ'],
  I: ['あい', 'アイ'],
};
// 行(1〜9) 受け付け読み
const ROW = {
  '1': ['いち'], '2': ['に'], '3': ['さん'], '4': ['よん', 'し'], '5': ['ご'],
  '6': ['ろく'], '7': ['なな', 'しち'], '8': ['はち'], '9': ['きゅう', 'く'],
};
// 相対移動
const DIR = { 'みぎ': ['みぎ', '右'], 'ひだり': ['ひだり', '左'], 'うえ': ['うえ', '上'], 'した': ['した', '下'] };
// 色（index→読み）。ちゃいろは候補統合
const COLOR = {
  0: ['あか', '赤'], 1: ['みずいろ', '水色'], 2: ['きいろ', '黄色'], 3: ['むらさき', '紫'],
  4: ['みどり', '緑'], 5: ['ピンク', 'ぴんく'], 6: ['あお', '青'], 7: ['オレンジ', 'おれんじ'],
  8: ['きみどり', '黄緑'], 9: ['ちゃいろ', '茶色', 'ブラウン', 'ぶらうん'], 10: ['しろ', '白'], 11: ['くろ', '黒'],
};
// キーワード
const KW = {
  kara: ['から'], made: ['まで'], sen: ['せん', '線'],
  ok: ['オーケー', 'おーけー', 'オッケー', 'おっけー'],
  save: ['ほぞん', '保存', 'せーぶ', 'セーブ'],
  quit: ['やめる', 'おわり', '終わり'],   // 家族と同じ：おわり＝やめる（タイトルへ・下書きは自動保存で残る）
};

function buildMap(obj) {
  const m = new Map();
  for (const [key, forms] of Object.entries(obj)) for (const f of forms) m.set(normalize(f), key);
  return m;
}
const COL_N = buildMap(COL), ROW_N = buildMap(ROW), DIR_N = buildMap(DIR), KW_N = buildMap(KW);
const COLOR_N = new Map();
for (const [idx, forms] of Object.entries(COLOR)) for (const f of forms) COLOR_N.set(normalize(f), Number(idx));

/** この区間（制作画面）で受け付ける全表記。Voskの文法に渡す。 */
export function makeGrammar() {
  const out = new Set();
  for (const o of [COL, ROW, DIR, COLOR, KW]) for (const forms of Object.values(o)) for (const f of forms) out.add(f);
  return [...out];
}

/** 認識文字列をトークン列（{type,val}）へ。type: col|digit|dir|color|kw */
export function parse(text) {
  const toks = text.trim().split(/[\s　]+/).map(normalize).filter(Boolean);
  const out = [];
  for (const t of toks) {
    if (COLOR_N.has(t)) out.push({ type: 'color', val: COLOR_N.get(t) });
    else if (KW_N.has(t)) out.push({ type: 'kw', val: KW_N.get(t) });
    else if (DIR_N.has(t)) out.push({ type: 'dir', val: DIR_N.get(t) });
    else if (COL_N.has(t)) out.push({ type: 'col', val: COL_N.get(t) });
    else if (ROW_N.has(t)) out.push({ type: 'digit', val: ROW_N.get(t) });
  }
  return out;
}

export const colIndex = letter => letter.charCodeAt(0) - 65; // A→0
