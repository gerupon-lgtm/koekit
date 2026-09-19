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

// 盤面のレイアウトを変えず、課題の切り替わりだけ案内する。
export function createTutorialGuide({ onOpen, onClose, onRestart, onRetry, onFinish }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'ir-help ir-tutorial-dialog';
  dialog.setAttribute('aria-labelledby', 'tutorial-heading');
  dialog.innerHTML = `<div class="ir-help-head"><span id="tutorial-progress"></span><button class="ir-help-close" aria-label="とじる">×</button></div>
    <div id="tutorial-content"></div>
    <button id="tutorial-primary" class="ir-help-done"></button>
    <p class="ir-tutorial-voice">「オーケー」でも すすむよ</p>
    <div class="ir-tutorial-actions"><button id="tutorial-retry" class="ir-mini">ここから やりなおす</button><button id="tutorial-restart" class="ir-mini">さいしょから</button></div>`;
  document.body.append(dialog);
  let kind, current;
  const close = () => dialog.close();
  const show = (nextKind, tutorial) => {
    kind = nextKind; current = tutorial;
    const lesson = tutorial.lesson;
    dialog.querySelector('#tutorial-progress').textContent = kind === 'overview' ? 'こえと タッチの れんしゅう' : `れんしゅう ${tutorial.step + 1} / 4`;
    const content = dialog.querySelector('#tutorial-content');
    content.replaceChildren();
    const heading = document.createElement('h2'); heading.id = 'tutorial-heading';
    heading.textContent = kind === 'overview' ? 'こえで ぬって、もどしてみよう！' : kind === 'complete' ? 'ぜんぶ できたね！' : kind === 'undo' ? '「もどす」で、くろを とりけそう' : lesson.title;
    content.append(heading);
    const paragraph = (text, className = '') => { const p = document.createElement('p'); p.textContent = text; p.className = className; content.append(p); };
    if (kind === 'overview') {
      paragraph('おなじ 9 × 9の ばんめんで、4つの おためし。');
      const list = document.createElement('ol');
      ['ひとマスを ぬる', 'しかくい はんいを ぬる', 'ななめの せんを ひく', 'ぬってから、ひとつ もどす'].forEach(text => { const li = document.createElement('li'); li.textContent = text; list.append(li); });
      content.append(list);
      paragraph('こまったら「？」で みかえせるよ。タッチでも だいじょうぶ。');
    } else if (kind === 'complete') {
      paragraph('ひとマス・はんい・せん・もどす。ぜんぶ つかえたね。');
      paragraph('つぎは「じゆうに つくる」で、すきな えを かこう。');
    } else {
      const words = document.createElement('div'); words.className = 'ir-tutorial-words';
      (kind === 'undo' ? ['もどす'] : lesson.words).forEach(word => { const chip = document.createElement('span'); chip.textContent = word; words.append(chip); });
      content.append(words);
      paragraph(kind === 'undo' ? 'タッチなら「↶」の ボタンを おそう。' : lesson.tip, 'ir-tutorial-tip');
      paragraph(kind === 'undo' ? 'くろを ぬるまえに もどったら、できあがり！' : 'タッチ：' + lesson.touch);
    }
    dialog.querySelector('#tutorial-primary').textContent = kind === 'overview' ? 'はじめる' : kind === 'complete' ? 'おしまい' : 'やってみる';
    dialog.querySelector('#tutorial-retry').hidden = kind === 'overview' || kind === 'complete';
    dialog.querySelector('#tutorial-restart').hidden = kind === 'overview';
    if (!dialog.open) { dialog.showModal(); onOpen(); }
  };
  const primary = () => {
    if (!dialog.open) return;
    if (kind === 'overview') show('lesson', current);
    else if (kind === 'complete') { close(); onFinish(); }
    else close();
  };
  dialog.querySelector('#tutorial-primary').onclick = primary;
  dialog.querySelector('.ir-help-close').onclick = close;
  dialog.querySelector('#tutorial-retry').onclick = () => { close(); onRetry(); };
  dialog.querySelector('#tutorial-restart').onclick = () => { close(); onRestart(); };
  dialog.addEventListener('close', () => { if (!dialog.open) onClose(); });
  return { show, close, primary, get open() { return dialog.open; } };
}
