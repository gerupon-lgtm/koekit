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
      <button data-help-tab="paint" aria-pressed="true">ぬりかた</button><button data-help-tab="voice" aria-pressed="false">こえ</button><button data-help-tab="range" aria-pressed="false">まとめて</button><button data-help-tab="save" aria-pressed="false">ほぞん</button>
    </div>
    <section data-help-panel="paint">
      <div class="ir-help-pixels" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <h3>ひとマスから、つくってみよう。</h3>
      <ol><li><strong>ばしょ</strong>を タッチ</li><li><strong>いろ</strong>を えらぶ</li><li><strong>オーケー</strong>で ぬる</li></ol>
      <p>こえの コツは <b>「こえ」</b>へ。<br>いつでも <b>「？」</b>で みられるよ。</p>
    </section>
    <section data-help-panel="voice" hidden>
      <h3>A → 1 の じゅんに、ゆっくり。</h3>
      <div class="ir-help-phrase"><strong>えい いち</strong><span> → </span><strong>あか</strong><span> → </span><strong>オーケー</strong></div>
      <p>ばしょが うごいたら、いろを いう。<br>ばしょと いろが あっていたら <b>「オーケー」</b>。</p>
      <div class="ir-help-readings"><span><b>A</b> えい</span><span><b>B</b> びー</span><span><b>C</b> しー</span><span><b>D</b> でー</span><span><b>E</b> いー</span><span><b>F</b> えふ</span><span><b>G</b> じー</span><span><b>H</b> えっち</span><span><b>I</b> あい</span></div>
      <p><b>A・D・H</b> は、この よみかたが コツ。<br>ちがったら、ぬるまえに いいなおそう。</p>
      <p class="ir-help-note">「みぎ」「した に」でも うごくよ。<br>タッチでも だいじょうぶ。</p>
    </section>
    <section data-help-panel="range" hidden>
      <h3>まとめて ぬろう。せんも ひけるよ。</h3>
      <div class="ir-help-sequence"><strong>えい いち から</strong><span>A1を はじめに</span><strong>しー さん</strong><span>C3を おわりに</span><strong>あか → オーケー</strong><span>しかくく ぬる</span></div>
      <p>せんに するときは、ぬるまえに <b>「せん」</b>。<br>「まで」は、いわなくても だいじょうぶ。</p>
      <p class="ir-help-note">タッチなら「はんい」「せん」を えらんで、<br>はじめと おわりの マスを おそう。</p>
    </section>
    <section data-help-panel="save" hidden>
      <h3>つくった えを、また つづきから。</h3>
      <div class="ir-help-words"><strong>ほぞん</strong><span>えを のこす</span><strong>さくひん</strong><span>ひらいて またつくる</span><strong>もどす</strong><span>ひとつ もどる</span></div>
      <p>こえでも <b>「ほぞん」「もどす」</b>。<br>おしまいは <b>「やめる」「おわり」</b>。</p>
      <p class="ir-help-note">この ブラウザに <b>12こ</b>まで のこせるよ。<br>とちゅうの えは「かきかけを つづける」へ。<br>※ サイトの データを けすと、えも きえるよ。</p>
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
