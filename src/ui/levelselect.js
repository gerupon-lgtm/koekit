// レベル選択（作品・モード共通）。内容、クリア印、スピードの解放条件を示す。

/**
 * @param {HTMLElement} wrapEl ボタンを並べる要素
 * @param {{id:string}[]} levels レベル定義（id を表示）
 * @param {(id:string)=>void} onPick 選択時
 */
export function buildLevelSelect(wrapEl, levels, onPick, progress) {
  wrapEl.innerHTML = '';
  for (const l of levels) {
    const b = document.createElement('button');
    b.className = 'lv-btn';
    const speed = l.id === 'extra' || l.id.startsWith('s');
    const names = { '0': 'れんしゅう', '1': 'ひだり・みぎ', '2': 'うえ・した', '3': 'まんなか', '4': 'ななめ', '5': '9つのばしょ' };
    const label = l.label || (speed ? 'スピード' : names[l.id]);
    b.dataset.level = l.id;
    b.textContent = `${speed ? '⚡' : l.id === '0' ? '▶' : l.id}  ${label}`;
    if (progress?.completed(l.id)) { b.textContent += ' ✓'; b.classList.add('completed'); }
    b.disabled = !!(speed && progress && !progress.unlocked());
    if (b.disabled) b.textContent += ' 🔒';
    b.setAttribute('aria-label', b.textContent + (b.disabled ? '：通常レベルをすべてクリアすると解放' : ''));
    b.addEventListener('click', () => onPick(l.id));
    wrapEl.appendChild(b);
  }
  if (progress) {
    const hint = document.createElement('p'); hint.className = 'unlock-hint';
    hint.textContent = progress.unlocked() ? 'スピードに チャレンジできます' : '通常レベルを すべてクリアで スピード解放';
    wrapEl.append(hint);
  }
}

// 通常／スピードを切り替え、内容だけを大きく表示する共通メニュー。
export function buildGroupedLevelSelect(wrapEl, levels, onPick, progress) {
  const isSpeedLevel = level => level.speed === true || level.id === 'extra';
  const sequence = levels.some(level => level.steps);
  const names = { '1': 'ひだり・みぎ', '2': 'うえ・した', '3': 'まんなか', '4': 'ななめ', '5': '9つのばしょ', extra: '9つのばしょ' };
  let speed = wrapEl.dataset.speed === 'true' && progress.unlocked();
  wrapEl.replaceChildren();
  const modes = document.createElement('div');
  modes.className = 'memory-speed-picker';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', '通常・スピード');
  const list = document.createElement('div');
  list.className = 'memory-level-list';
  const hint = document.createElement('p');
  hint.className = 'unlock-hint';
  hint.id = 'memory-unlock-hint';
  hint.textContent = progress.unlocked() ? 'スピードにも チャレンジできるよ' : '🔒 通常を ぜんぶクリアで スピードが ひらく';
  const buttons = [false, true].map(isSpeed => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.speed = String(isSpeed);
    button.disabled = isSpeed && !progress.unlocked();
    button.textContent = isSpeed ? (button.disabled ? '🔒 スピード' : 'スピード') : '通常';
    if (button.disabled) button.setAttribute('aria-describedby', hint.id);
    button.addEventListener('click', () => { speed = isSpeed; render(); });
    modes.append(button);
    return button;
  });
  const prompt = document.createElement('p');
  prompt.className = 'memory-menu-prompt';
  prompt.textContent = sequence ? 'いくつ おぼえる？' : 'ばしょを えらぼう';
  function render() {
    wrapEl.dataset.speed = String(speed);
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(Boolean(i) === speed)));
    list.replaceChildren();
    for (const level of levels.filter(l => isSpeedLevel(l) === speed)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lv-btn';
      button.dataset.level = level.id;
      const label = sequence ? `${level.steps}て` : names[level.id];
      button.textContent = label;
      const cleared = progress.completed(level.id);
      button.setAttribute('aria-label', `${speed ? 'スピード' : '通常'} ${label}${cleared ? ' クリアずみ' : ''}`);
      if (cleared) {
        button.classList.add('completed');
        const check = document.createElement('span');
        check.className = 'memory-clear-mark';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = '✓';
        button.append(check);
      }
      button.addEventListener('click', () => onPick(level.id));
      list.append(button);
    }
  }
  wrapEl.append(modes, prompt, list, hint);
  render();
}

// 承認済みの入口: 通常の連続開始、通常の個別レベル、スピードの連続開始。
export function buildContinuousLevelSelect(wrapEl, levels, onPick, progress) {
  const speedLevels = levels.filter(l => l.speed === true || l.id === 'extra');
  const normalLevels = levels.filter(l => !speedLevels.includes(l));
  const names = { '1': 'ひだり・みぎ', '2': 'うえ・した', '3': 'まんなか', '4': 'ななめ', '5': '9つのばしょ' };
  const list = document.createElement('div');
  list.className = 'memory-level-list';
  const make = (text, id, className = '') => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `lv-btn ${className}`.trim();
    button.textContent = text;
    button.addEventListener('click', () => onPick(id));
    list.append(button);
    return button;
  };
  const start = make('▶ はじめから あそぶ', progress.game === 'doubutsu' ? '0' : '1', 'start-entry');
  start.id = 'start-play';
  for (const level of normalLevels) {
    const label = level.steps ? `${level.steps}て` : names[level.id];
    const button = make(label, level.id);
    button.dataset.level = level.id;
    button.setAttribute('aria-label', label + (progress.completed(level.id) ? ' クリアずみ' : ''));
    if (progress.completed(level.id)) {
      button.classList.add('completed');
      const mark = document.createElement('span'); mark.className = 'memory-clear-mark';
      mark.textContent = '✓'; mark.setAttribute('aria-hidden', 'true'); button.append(mark);
    }
  }
  const speed = make(progress.unlocked() ? '▶ スピード' : '🔒 スピード', speedLevels[0].id, 'speed-entry');
  speed.id = 'speed-play'; speed.disabled = !progress.unlocked();
  speed.setAttribute('aria-describedby', 'memory-unlock-hint');
  const hint = document.createElement('p'); hint.className = 'unlock-hint'; hint.id = 'memory-unlock-hint';
  hint.textContent = progress.unlocked() ? 'スピードにも チャレンジできるよ' : '通常を ぜんぶクリアで スピードが ひらく';
  wrapEl.replaceChildren(list, hint);
}
