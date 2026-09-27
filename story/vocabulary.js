// モノガタリズム（仮称）の受け付け語と照合（基本設計4節 音声受付表）
// - 区間ごとに受け付ける語だけを Vosk の文法として渡す
// - 1回の発話は1語だけ受け付ける（「さん オッケー」のように続けて言った場合は何もしない＝2段階確定を守る）
// - 読みの初期値はイロドリズムの数字（4=よん/し）を参照。語はすべて Vosk 辞書にあることを確認済み
import { normalize } from '../src/speech/vocabulary.js';

export const NUMBERS = [['いち'], ['に'], ['さん'], ['よん', 'し'], ['ご']]; // 1〜5
export const COMMANDS = {
  ok: ['オッケー', 'オーケー'],
  omakase: ['おまかせ'],
  back: ['もどる'],
  start: ['スタート'],
  next: ['つぎ'],
};

// 区間ごとの受け付け語（Vosk へ渡す表記）
export function wordsFor(ctx) {
  if (ctx.type === 'name') return [...ctx.names, ...COMMANDS.omakase, ...(ctx.hasCand ? COMMANDS.ok : [])];
  if (ctx.type === 'row') return [...NUMBERS.slice(0, ctx.cols).flat(), ...COMMANDS.ok, ...COMMANDS.omakase, ...COMMANDS.back];
  if (ctx.type === 'ready') return [...COMMANDS.ok, ...COMMANDS.back]; // 最後の確定も「オッケー」（2026-09-27 発案者指示）
  if (ctx.type === 'after') return [...COMMANDS.next];
  return [];
}

// 認識文字列 → { type, value }。一致なしは null（何もしない）
export function parse(raw, ctx) {
  const tokens = String(raw || '').trim().split(/[\s　]+/).filter(Boolean);
  if (tokens.length !== 1) return null;
  const t = normalize(tokens[0]);
  const allowed = new Set(wordsFor(ctx).map(normalize));
  if (!allowed.has(t)) return null;
  if (ctx.type === 'name') {
    const name = ctx.names.find(n => normalize(n) === t);
    if (name) return { type: 'name', value: name };
  }
  if (ctx.type === 'row') {
    const i = NUMBERS.findIndex(list => list.some(w => normalize(w) === t));
    if (i >= 0 && i < ctx.cols) return { type: 'number', value: i };
  }
  for (const [type, list] of Object.entries(COMMANDS)) if (list.some(w => normalize(w) === t)) return { type };
  return null;
}
