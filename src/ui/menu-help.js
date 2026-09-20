// タイトル専用。ゲームの音声入力や進行には触れない。
const title = document.querySelector('#title');
const memory = document.body.classList.contains('kioku');
const sequence = new URLSearchParams(location.search).get('mode') === 'sequence';
const open = document.createElement('button');
open.className = 'menu-help';
open.type = 'button';
open.textContent = '？';
open.setAttribute('aria-label', 'つかいかた');
const dialog = document.createElement('dialog');
dialog.className = 'menu-help-dialog';
dialog.setAttribute('aria-labelledby', 'menu-help-title');
const heading = document.createElement('h2');
heading.id = 'menu-help-title';
heading.textContent = 'つかいかた';
dialog.append(heading);
const paragraphs = memory
  ? [sequence ? 'ひかった じゅんばんを おぼえよう。おなじ じゅんばんで マスを えらんでね。' : 'どうぶつの ばしょを おぼえよう。おなじ どうぶつが いた マスを えらんでね。', 'こえでも、タッチでも えらべるよ。えらんだ こたえを たしかめて、「オッケー」で きめよう。']
  : ['「はじめから あそぶ」で スタート。まわる すうじを「ストップ」で とめよう。ボタンでも とめられるよ。', 'カードあそびは、とまった ばしょを こえか タッチで えらぼう。えらんだ マスを たしかめて、「オッケー」で めくろう。'];
for (const text of paragraphs) {
  const p = document.createElement('p'); p.textContent = text; dialog.append(p);
}
const touch = document.createElement('p');
touch.textContent = 'きめる ときも、チェックの ボタンを おせるよ。';
dialog.append(touch);
const close = document.createElement('button');
close.textContent = 'とじる'; close.autofocus = true;
close.addEventListener('click', () => dialog.close());
dialog.append(close);
// 既存のイベントとIDを保ち、計測パネルへの入口をヘルプ内へ移す。
const panel = document.querySelector('#to-panel');
if (panel) {
  panel.className = '';
  panel.textContent = '計測パネル（検証用）';
  panel.addEventListener('click', () => dialog.close());
  dialog.append(panel);
}
open.addEventListener('click', () => dialog.showModal());
title.append(open);
document.body.append(dialog);
