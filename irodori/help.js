// 初回の制作前だけ案内。いつでも？から再表示でき、作品データには触れない。
const SEEN_KEY = 'irodori:help-v1';
export function createHelp({ onOpen, onClose }) {
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* 保存不可でも使える */ }
  const dialog = document.createElement('dialog');
  dialog.className = 'ir-help';
  dialog.setAttribute('aria-labelledby', 'ir-help-heading');
  dialog.innerHTML = `
    <div class="ir-help-head"><h2 id="ir-help-heading">イロドリズムの つかいかた</h2><button class="ir-help-close" aria-label="説明を閉じる">×</button></div>
    <div class="ir-help-tabs" aria-label="説明の種類">
      <button data-help-tab="paint" aria-pressed="true">ぬりかた</button><button data-help-tab="voice" aria-pressed="false">話し方</button><button data-help-tab="range" aria-pressed="false">まとめて</button><button data-help-tab="save" aria-pressed="false">ほぞん</button>
    </div>
    <section data-help-panel="paint">
      <div class="ir-help-pixels" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <h3>ひとマスから、つくってみよう。</h3>
      <ol><li><strong>ばしょ</strong>を タッチ</li><li><strong>いろ</strong>を えらぶ</li><li><strong>オーケー</strong>で ぬる</li></ol>
      <p>声でつくるときは <b>「話し方」</b>へ。<br>説明は、いつでも <b>「？」</b>で見返せます。</p>
    </section>
    <section data-help-panel="voice" hidden>
      <h3>英字 → 数字。区切って、ひとつずつ。</h3>
      <div class="ir-help-phrase"><strong>えい いち</strong><span> → </span><strong>あか</strong><span> → </span><strong>オーケー</strong></div>
      <p>場所が動くのを見てから、色を言う。<br>塗る場所と色を見てから、<b>「オーケー」</b>。</p>
      <div class="ir-help-readings"><span><b>A</b> えい</span><span><b>B</b> びー</span><span><b>C</b> しー</span><span><b>D</b> でー</span><span><b>E</b> いー</span><span><b>F</b> えふ</span><span><b>G</b> じー</span><span><b>H</b> えっち</span><span><b>I</b> あい</span></div>
      <p><b>Aは「えい」、Dは「でー」、Hは「えっち」</b>がおすすめ。違う場所なら、確定する前に言い直せます。</p>
      <p class="ir-help-note">初回はマイクの許可と準備が必要です。うまく届かないときは「みぎ」「した に」やタッチでも移動できます。</p>
    </section>
    <section data-help-panel="range" hidden>
      <h3>はんいや線も、少しずつ話せます。</h3>
      <div class="ir-help-sequence"><strong>えい いち から</strong><span>A1を はじめに</span><strong>しー さん</strong><span>C3を おわりに</span><strong>あか → オーケー</strong><span>四角い はんいを ぬる</span></div>
      <p>線にしたいときは、確定する前に <b>「せん」</b>。<br>「まで」は、言っても言わなくても大丈夫。</p>
      <p class="ir-help-note">タッチなら「はんい」か「せん」を選び、はじめとおわりの2マスをタッチ。ぬった後は1マスに戻ります。</p>
    </section>
    <section data-help-panel="save" hidden>
      <h3>つくった絵を、またつづきから。</h3>
      <div class="ir-help-words"><strong>ほぞん</strong><span>作品を のこす</span><strong>さくひん</strong><span>ひらいて またつくる</span><strong>もどす</strong><span>ひとつ前に もどる</span></div>
      <p>声でも <b>「ほぞん」「もどす」</b>。<br>終わるときは <b>「やめる」「おわり」</b>。</p>
      <p class="ir-help-note">作品はこの端末・ブラウザに12件まで保存できます。制作途中は「かきかけを つづける」から戻れます。サイトのデータを消すと作品も消えます。</p>
    </section>
    <button class="ir-help-done">つくりはじめる</button>`;
  document.body.append(dialog);
  const select = key => {
    dialog.querySelectorAll('[data-help-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.helpTab === key)));
    dialog.querySelectorAll('[data-help-panel]').forEach(p => { p.hidden = p.dataset.helpPanel !== key; });
  };
  dialog.querySelectorAll('[data-help-tab]').forEach(b => { b.onclick = () => select(b.dataset.helpTab); });
  dialog.querySelectorAll('.ir-help-close,.ir-help-done').forEach(b => { b.onclick = () => dialog.close(); });
  dialog.addEventListener('close', () => {
    seen = true;
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* 次回は再表示 */ }
    onClose();
  });
  return {
    get seen() { return seen; },
    get open() { return dialog.open; },
    show(screen) {
      if (dialog.open) return;
      select(screen === 'list' || screen === 'preview' ? 'save' : 'paint');
      dialog.querySelector('.ir-help-done').textContent = screen === 'make' ? 'つくりはじめる' : 'わかった';
      onOpen();
      dialog.showModal();
    },
  };
}
