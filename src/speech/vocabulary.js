// 語彙テーブルと照合（要件8.7 / implementation-guide 7節）
//
// 方針:
// - 同義語表は「データ」として外に出し、コードを触らずに語を追加できる構造にする
//   （ログの認識文字列を見て後から補強する前提。要件8.7）
// - 「上を含む発話なら何でも上」とはしない。正規化してから登録語と「完全一致」で照合する
// - 登録外の発話・雑音は一致なし（''）＝「何もしない」

/**
 * 同義語表。キー = 正規のキー、値 = そのキーとして受け付ける表記の配列。
 * ここに表記を足すだけで語を拡張できる（照合ロジックは変更不要）。
 * 認識器は漢字・ひらがな・カタカナのいずれで返すか環境依存のため、代表表記を並べる。
 */
export const SYNONYMS = {
  start:     ['スタート', 'すたーと'],
  stop:      ['ストップ', 'すとっぷ', '停止', 'ていし'],

  up:        ['上', 'うえ'],
  down:      ['下', 'した'],
  left:      ['左', 'ひだり'],
  right:     ['右', 'みぎ'],

  center:    ['中央', 'ちゅうおう', '真ん中', 'まんなか'],
  // 「中」まで受けるかは精度を見て判断（区分B）。必要になったら 'なか' 等をここに足す

  upleft:    ['左上', 'ひだりうえ'],
  upright:   ['右上', 'みぎうえ'],
  downleft:  ['左下', 'ひだりした'],
  downright: ['右下', 'みぎした'],

  confirm:   ['決定', 'けってい', 'オーケー', 'おーけー', 'オッケー', 'おっけー'],
};

/**
 * 正規化: 前後空白除去 → 全ての空白除去 → カタカナをひらがなへ統一。
 * 長音符（ー）はそのまま残す。漢字はそのまま（読みへは変換しない）。
 * @param {string} raw
 * @returns {string}
 */
export function normalize(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  // 半角・全角の空白をすべて除去
  s = s.replace(/[\s　]+/g, '');
  // カタカナ(ァ-ヶ)→ひらがな。長音符ー(U+30FC)・中点・記号は対象外
  s = s.replace(/[ァ-ヶ]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
  return s;
}

// 正規化済み同義語 → キー の逆引き表。SYNONYMS を編集（またはキーへ表記を push）した後に
// rebuildLookup() を呼べば、コードのロジックを触らずに語を拡張できる（要件8.7）。
let _lookup = new Map();
export function rebuildLookup() {
  const map = new Map();
  for (const [key, forms] of Object.entries(SYNONYMS)) {
    for (const form of forms) {
      map.set(normalize(form), key);
    }
  }
  _lookup = map;
  return _lookup;
}
rebuildLookup();

/**
 * キー配列に対応する表記（surface forms）の一覧を返す。
 * Vosk の文法（受け付ける語を絞った認識）に渡す用途。WebSpeech系は文法指定不可のため参考情報。
 * @param {string[]} keys
 * @returns {string[]} 重複除去した表記の配列
 */
export function wordsForKeys(keys) {
  const out = new Set();
  for (const k of keys) {
    for (const form of (SYNONYMS[k] || [])) out.add(form);
  }
  return [...out];
}

/**
 * 認識文字列を正規のキーへ照合する。
 * @param {string} raw 認識器が返した文字列そのもの
 * @param {string[]} [allowed] この区間で受け付けるキーの配列。省略時は全キー対象。
 *   allowed に含まれないキーへの一致は「一致なし」として扱う（区間ごとの語彙の絞り込み）。
 * @returns {string} 一致したキー。一致なしは ''。
 */
export function match(raw, allowed) {
  const key = _lookup.get(normalize(raw));
  if (!key) return '';
  if (allowed && !allowed.includes(key)) return '';
  return key;
}
