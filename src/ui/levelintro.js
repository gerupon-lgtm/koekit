// 保護者と一緒に読む開始案内。実際のレベル配置と登録済みの語を使う。
import { POS } from '../game/positions.js';
import { SYNONYMS } from '../speech/vocabulary.js';

const TITLES = {
  '0': 'こえで、とめてみよう。', '1': 'みぎと、ひだり。',
  '2': 'うえと、した。', '3': 'まんなかも、いっしょに。',
  '4': 'ななめを、みつけよう。', '5': 'ぜんぶのばしょに、ちょうせん。',
  extra: 'もっとはやく、できるかな。',
};
const spoken = key => key === 'center' ? SYNONYMS.center.find(word => word === 'まんなか') : SYNONYMS[key].find(word => /^[ぁ-ゖー]+$/.test(word));

export function openLevelIntro(level, game) {
  const dialog = document.querySelector('#level-intro');
  const practice = level.id === '0';
  document.querySelector('#intro-badge').textContent = practice ? 'れんしゅう' : level.id === 'extra' ? 'スピード' : `レベル ${level.id}`;
  document.querySelector('#intro-heading').textContent = TITLES[level.id];
  document.querySelector('#intro-text').textContent = practice
    ? 'すきなすうじで、とめられるかな？ 3かいとめたら、カードあそびへ。'
    : game === 'kioku' ? 'どうぶつのばしょをおぼえて、さがすえがどこにあったか、こたえよう。'
      : 'とまったカードは、どこ？ ばしょをこえでいって、めくってみよう。';

  const preview = document.querySelector('#intro-preview');
  preview.replaceChildren();
  preview.classList.toggle('practice-preview', practice);
  if (practice) {
    for (const n of [1, 2, 3]) {
      const tile = document.createElement('span');
      tile.className = 'preview-number'; tile.textContent = n;
      preview.append(tile);
    }
  } else {
    for (let row = 1; row <= 3; row++) for (let col = 1; col <= 3; col++) {
      const key = level.vocab.find(k => POS[k].r === row && POS[k].c === col);
      const tile = document.createElement('span');
      tile.className = key ? 'preview-tile' : 'preview-empty';
      if (key) {
        const word = spoken(key);
        // ななめの語は「ひだり／うえ」など意味の切れ目でだけ折り返す。
        const parts = word.match(/^(ひだり|みぎ)(うえ|した)$/);
        const label = document.createElement('span');
        if (parts) label.append(parts[1], document.createElement('wbr'), parts[2]);
        else label.textContent = word;
        tile.append(label);
      }
      preview.append(tile);
    }
  }

  const steps = document.querySelector('#intro-steps');
  steps.replaceChildren();
  const items = practice
    ? [['スタート', 'まわす'], ['ストップ', 'とめる']]
    : [[game === 'kioku' ? 'スタート' : 'スタート → ストップ', game === 'kioku' ? 'みて、おぼえる' : 'まわして、とめる'],
       ['ばしょをいう', 'カードのしるしをみる'], ['オーケー', 'めくる。「オッケー」でもOK']];
  for (const [word, hint] of items) {
    const li = document.createElement('li');
    const bubble = document.createElement('strong'); bubble.textContent = word;
    const caption = document.createElement('span'); caption.textContent = hint;
    li.append(bubble, caption); steps.append(li);
  }
  document.querySelector('#intro-touch').textContent = practice
    ? 'タッチでも：▶ でまわして、■ でとめられます。'
    : 'タッチでも：カードをえらび、もう一度タップ。または ✓ でめくれます。';
  dialog.showModal();
  dialog.scrollTop = 0;
}

export function closeLevelIntro() {
  document.querySelector('#level-intro').close();
}
