// 練習の判定は制作コントローラから独立。作品・下書きの保存はしない。
export const LESSONS = [
  { size: 9, title: 'A1を きいろに ぬろう', words: ['えい いち', 'きいろ', 'オーケー'], tip: 'Aは「えい」。ばしょが うごいてから、いろを いおう。', touch: 'A1 → きいろ → オーケー', cells: [0], color: 2, tool: 'single' },
  { size: 9, title: 'B2から D4まで あおに ぬろう', words: ['びー に から', 'でー よん', 'あお', 'オーケー'], tip: 'Bは「びー」、Dは「でー」。「から」を わすれずに。', touch: '「はんい」→ B2 → D4 → あお → オーケー', cells: [10, 11, 12, 19, 20, 21, 28, 29, 30], color: 6, tool: 'range' },
  { size: 9, title: 'A5から E1へ オレンジの ななめせん', words: ['えい ご から', 'いー いち', 'せん', 'オレンジ', 'オーケー'], tip: 'Aは「えい」、Eは「いー」。「せん」は ぬるまえに。', touch: '「せん」→ A5 → E1 → オレンジ → オーケー', cells: [36, 28, 20, 12, 4], color: 7, tool: 'line' },
  { size: 9, title: 'H5を くろにして、もどそう', words: ['えっち ご', 'くろ', 'オーケー'], tip: 'Hは「えっち」と いってみよう。', touch: 'H5 → くろ → オーケー。そのあと「もどす」', cells: [43], color: 11, tool: 'single' },
];
export class Tutorial {
  constructor() { this.step = 0; this.passed = false; this.undoReady = false; this.feedback = ''; this.base = Array(81).fill(null); }
  get lesson() { return LESSONS[this.step]; }
  get target() { const cells = this.base.slice(); this.lesson.cells.forEach(i => { cells[i] = this.lesson.color; }); return cells; }
  record(action, cells) {
    if (this.passed) return;
    this.feedback = '';
    const same = expected => cells.length === expected.length && cells.every((v, i) => v === expected[i]);
    if (this.step === 3 && this.undoReady) {
      this.passed = action.type === 'undo' && same(this.base);
      return;
    }
    const lesson = this.lesson;
    const exactPaint = action.type === 'paint' && action.tool === lesson.tool && action.color === lesson.color &&
      action.cells.length === lesson.cells.length && lesson.cells.every(i => action.cells.includes(i)) && same(this.target);
    if (exactPaint) {
      if (this.step === 3) this.undoReady = true;
      else this.passed = true;
    } else this.feedback = 'ばしょ・いろ・ぬりかたを みて、もういちど。';
  }
  next() {
    if (!this.passed || this.step === 3) return false;
    this.base = this.target;
    this.step++;
    this.passed = false; this.undoReady = false;
    this.feedback = '';
    return true;
  }
  retry() { this.passed = false; this.undoReady = false; this.feedback = ''; return this.base.slice(); }
}

export function renderTutorial(el, tutorial) {
  el.hidden = !tutorial;
  if (!tutorial) { el.replaceChildren(); return; }
  const lesson = tutorial.lesson;
  const heading = document.createElement('h2');
  heading.textContent = tutorial.passed ? (tutorial.step === 3 ? 'ぜんぶ できたね！' : 'できたね！') : tutorial.undoReady ? '「もどす」で、くろを とりけそう' : lesson.title;
  const progress = document.createElement('span'); progress.className = 'ir-tutorial-progress'; progress.textContent = `れんしゅう ${tutorial.step + 1} / 4`;
  const words = document.createElement('div'); words.className = 'ir-tutorial-words';
  const prompts = tutorial.passed ? [tutorial.step === 3 ? 'オーケーで おしまい' : 'つぎ / オーケー'] : tutorial.undoReady ? ['もどす'] : lesson.words;
  prompts.forEach(word => { const chip = document.createElement('span'); chip.textContent = word; words.append(chip); });
  const touch = document.createElement('p');
  touch.textContent = tutorial.passed ? 'こえでも、したの ボタンでも すすむよ。' : tutorial.undoReady ? 'タッチなら「↶」の ボタンを おそう。' : lesson.touch;
  const tip = document.createElement('p'); tip.className = 'ir-tutorial-tip';
  tip.textContent = tutorial.feedback || lesson.tip;
  el.replaceChildren(progress, heading, words, touch);
  if (!tutorial.passed && !tutorial.undoReady) el.append(tip);
  el.classList.toggle('is-done', tutorial.passed);
}
