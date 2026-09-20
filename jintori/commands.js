// Reuse Irodori's verified readings, not its painting controller or full grammar.
import { makeGrammar, parse } from '../irodori/vocabulary.js';
import { normalize, SYNONYMS } from '../src/speech/vocabulary.js';

const WORDS = makeGrammar().map(word => ({ word, token: parse(word)[0] })).filter(x => x.token);
const columns = WORDS.filter(x => x.token.type === 'col');
const digits = WORDS.filter(x => x.token.type === 'digit');
const colors = WORDS.filter(x => x.token.type === 'color');
const coordinates = new Map();
for (const { word: column, token: c } of columns) {
  for (const { word: row, token: r } of digits) {
    const value = { row: Number(r.val) - 1, col: c.val.charCodeAt(0) - 65 };
    coordinates.set(normalize(column + row), value);
    coordinates.set(normalize(row + column), value);
  }
}
export const COMMAND_WORDS = {
  confirm: SYNONYMS.confirm, start: SYNONYMS.start, stop: SYNONYMS.stop,
  quit: [...SYNONYMS.quit, 'おわる'], undo: SYNONYMS.undo, next: SYNONYMS.next,
  help: ['せつめい', '説明'], close: ['とじる', '閉じる'],
  extend: ['えんちょう', '延長'], cancel: ['つづける', '続ける'],
  enhanced: ['きょうか', '強化'], strongest: ['さいきょう', '最強'],
};
const allowed = {
  setup: ['start', 'confirm', 'quit', 'help'],
  dice: ['stop', 'quit', 'help'],
  human: ['confirm', 'undo', 'quit', 'help'],
  direction: ['confirm', 'undo', 'quit', 'help'],
  result: ['next', 'quit', 'help'],
  series: ['extend', 'quit', 'help'],
  help: ['close', 'confirm', 'quit'],
  exit: ['quit', 'confirm', 'cancel'],
};
const normalizedWords = new Map(Object.entries(COMMAND_WORDS).flatMap(([key, forms]) => forms.map(w => [normalize(w), key])));

function withoutConfirm(text) {
  // Combined utterance previews/selects only. A new utterance must confirm.
  for (const word of COMMAND_WORDS.confirm) {
    const ending = normalize(word);
    if (text.length > ending.length && text.endsWith(ending)) return text.slice(0, -ending.length);
  }
  return text;
}

export function parseCommand(raw, phase, size = 8, availableItems = ['enhanced', 'strongest']) {
  if (!allowed[phase]) return null;
  const text = normalize(raw).toLowerCase();
  const key = normalizedWords.get(text);
  if (allowed[phase].includes(key)) return { type: key };
  if (phase === 'setup') {
    const entry = colors.find(x => normalize(x.word) === text);
    return entry ? { type: 'color', color: entry.token.val } : null;
  }
  if (phase !== 'human' && phase !== 'direction') return null;
  if (size >= 6 && ['enhanced', 'strongest'].includes(key) && availableItems.includes(key)) return { type: 'item', item: key };
  const selection = withoutConfirm(text);
  if (phase === 'direction') {
    const entry = digits.find(x => normalize(x.word) === selection);
    const number = entry ? Number(entry.token.val) : /^[1-8]$/.test(selection) ? Number(selection) : 0;
    if (number > 0 && number <= 8) return { type: 'choice', number };
  }
  let coord = coordinates.get(selection);
  const literal = selection.match(/^([a-i])([1-9])$|^([1-9])([a-i])$/);
  if (literal) coord = { row: Number(literal[2] || literal[3]) - 1, col: (literal[1] || literal[4]).charCodeAt(0) - 97 };
  if (!coord) return null;
  if (coord.row >= size || coord.col >= size) return { type: 'invalidCell' };
  return { type: 'cell', cell: coord.row * size + coord.col };
}

export function grammarFor(phase, size = 8, availableItems = ['enhanced', 'strongest']) {
  if (!allowed[phase]) return [];
  const words = allowed[phase].flatMap(key => COMMAND_WORDS[key]);
  if (phase === 'setup') words.push(...colors.map(x => x.word));
  if (phase === 'human' || phase === 'direction') {
    words.push(...columns.filter(x => x.token.val.charCodeAt(0) - 65 < size).map(x => x.word));
    words.push(...digits.filter(x => Number(x.token.val) <= size).map(x => x.word));
    if (size >= 6) for (const item of availableItems) words.push(...(COMMAND_WORDS[item] || []));
    if (phase === 'direction') words.push(...digits.filter(x => Number(x.token.val) <= 8).map(x => x.word));
  }
  return [...new Set(words)];
}
