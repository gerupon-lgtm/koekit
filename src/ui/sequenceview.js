export function showSequenceNumbers(board, values) {
  for (const [key, card] of board.cards) {
    card.el.querySelector('.sequence-numbers')?.remove();
    const numbers = values.flatMap((value, i) => value === key ? [i + 1] : []);
    if (!numbers.length) continue;
    const badge = document.createElement('span'); badge.className = 'sequence-numbers';
    badge.textContent = numbers.join('・');
    card.el.append(badge);
  }
}

export function configureSequenceIntro(level) {
  document.querySelector('#intro-badge').textContent = `${level.speed ? 'スピード ' : ''}レベル ${level.id.replace('s', '')}`;
  document.querySelector('#intro-heading').textContent = `${level.steps}つの じゅんばんを、おぼえよう。`;
  document.querySelector('#intro-text').textContent = 'ひかった ばしょを、おなじ じゅんばんで。';
  const steps = document.querySelector('#intro-steps'); steps.replaceChildren();
  for (const [word, hint] of [['スタート', 'ひかる じゅんばんを おぼえる'], ['ばしょをいう', `${level.steps}こ →「オッケー」`], ['もどす ／ やりなおし', '1つ ／ 全部けす']]) {
    const li = document.createElement('li'), strong = document.createElement('strong'), span = document.createElement('span');
    strong.textContent = word; span.textContent = hint; li.append(strong, span); steps.append(li);
  }
  document.querySelector('#intro-touch').textContent = 'タッチ：順番にタップ → ✓。やりなおし（↺）は、こたえを全部けす。';
}
