# デリバリズムの素材と音

2026-09-26。B案の二足歩行型を元に新規制作。既存4作品の画像・音・ロゴ書出しコードは変更していない。

## 配信用ファイル

| ファイル | 内容 |
|---|---|
| `assets/brand/deliverhythm.svg` | ユーザー指定の参考ロゴを元にした青緑のデリバリ＋茶色のズム、799×196、透明背景 |
| `assets/delivery/robot-empty.webp` | 両手空、256×256、12,812 bytes |
| `assets/delivery/robot-one.webp` | 画面左側の片手に1個、256×256、13,742 bytes |
| `assets/delivery/robot-two.webp` | 両手に1個ずつ、256×256、12,466 bytes |
| `assets/delivery/package.svg` | オレンジ色の荷物、viewBox 64×64 |
| `assets/delivery/destination.svg` | 青緑の屋根とチェック印の届け先、viewBox 64×64 |
| `assets/delivery/obstacle.svg` | 灰色の岩、viewBox 64×64 |
| `assets/delivery/all-clear.webp` | 全面クリアの承認済み一枚絵、1254×1254、188,414 bytes |

盤面素材は透明余白を残す。セル全体を背景色で塗らず、足場や隣接セルのつながりを覆わない。所持状態はRuntimeのheldMaskから描画側で選ぶ。顔や足元を基準に画像ごとの拡大・切抜きを行わず、同じ画像枠へ`object-fit: contain`で表示する。

## ロボット制作と変換

組み込み`image_gen.imagegen`を使用。最初に`docs/delivery/references/robot-concepts-abc.png`を閲覧し中央Bを参考に空手状態を生成、そのPNGを編集対象として1個、続いて2個を各1回の編集で制作した。車輪・文字・床・影は追加しない。各編集で顔・体・向き・キャンバス・頭・足位置を維持するよう指示した。

全プロンプトは`assets/delivery/PROMPTS.json`。透明PNG原本は`assets/delivery/originals/robot-{empty,one,two}.png`。3枚とも1254×1254。生成ツールの原出力もCodexのgenerated_imagesに残しているが、公開・再変換にはリポジトリ内原本だけを使う。

`node assets/delivery/export-sprites.cjs`で再変換できる。既存のローカル検証用Playwright＋Chromeのcanvasを使用し、同じ正方形全体を256×256へ縮小、WebP quality=.92で保存。切抜き・背景除去・描き直し・位置補正は行っていない。アプリのビルド工程／実行時依存は追加していない。変換時の寸法・透明画素数・alpha>128のboundsは`assets/delivery/verification.json`に記録。

3枚とも透明画素と不透明画素が存在することを確認。足元の最下端は全てy=230、頭の最上端は空手y=28／1個・2個y=27（256px換算）。生成編集による輪郭差は1pxあり、全画素一致を主張しない。顔・頭・足の位置と見た目は同じ枠で目視比較済み。`sprite-preview.png`の160px／64px／32px表示で0・1・2個の違いを確認した。実機9×9盤面での認識しやすさは統合試遊で確認する。

## ロゴ

2026-09-26、ユーザー指定によりジントリズムに近い丸い筆画・茶色・サイズへ再調整。「デリバリ」の青緑 #56999B は維持し、「ズム」は落ち着いた茶色 #88634E を基準に編集生成した。参照は実装中の `assets/brand/jintorhythm.svg` をPNGに描画したもの。既存作品の素材は変更していない。

採用PNGは `assets/delivery/originals/wordmark-jintori-style.png`（2171×724）、制作プロンプトは `assets/delivery/wordmark-jintori-style-prompt.json`。それ以前の参考ロゴ・PNG・プロンプトも履歴として保持する。共通末尾そのものの複製ではなく、形と配色を寄せた生成素材である。

`node scripts/export-delivery-wordmark.cjs` は採用PNG全体をWebPに変換してSVGへ内包する。色・輪郭は再描画せず、透明余白をviewBoxで調整する。799×196の共通枠の内側x=8/y=13、783×175へ縦横比を維持して配置。寸法・透明画素数・境界は `wordmark-verification.json`。

実画面390×844ではジントリ／デリバリとも文字上端65.17px。文字幅345.01／348.14px、文字高72.14／68.55px。ロゴ枠上端58px・最大幅380pxを維持し、既存4作品と横並びでも確認した。完全同一の字形・寸法とは称さない。小品の独立アイコンは追加しない。

## 効果音API

2026-09-27：全面クリア絵は既存 `robot-empty.png` をキャラクター参照に組み込みimage_genで生成し、ユーザー承認を得た画像を採用。原本は `originals/all-clear.png`。生成の構図・色・内容は `all-clear-brief.json`。`node assets/delivery/export-all-clear.cjs` で全画素範囲を保ったままWebP quality=.9へ変換する。切抜き・再描画はしない。配信用WebPはSWに事前保存し、アプリは原本PNGを読み込まない。

`delivery/sound.js`は`DeliverySound`クラスをexportする。出力専用Web Audio合成、BGMなし、既存`sfx.js`には書き込まない。

```js
const sound = new DeliverySound();
await sound.prime(); // 初回タッチのハンドラで実行。Promise<boolean>
const durationMs = sound.play('move'); // 同期、音の末尾を含む待機時間
sound.stopAll(); // 再生中・未来に予約済みの音も停止
```

| event | 音 | durationMs |
|---|---|---|
| move | 軽いtriangleのピコ、歩ごとに2種交互 | 130 |
| pickup | 短い上昇音 | 250 |
| delivery | 明るい着地音 | 330 |
| failure | 小音量の柔らかな下降音 | 400 |
| clear | 最終配達の着地を含む面クリア音 | 830 |
| award | レベルクリアの和音付きジングル | 1180 |
| stageStart | 新しい盤面表示時の開始音 | 540 |
| start | オッケー後の出発音。終了後250ms待って歩行開始 | 約320 |
| allClear | 全面クリア絵の表示時。柔らかい旋律と和音を一度再生 | 4720 |

未知のeventは0ms。音を利用できない／resume拒否時にも有効eventの待機時間を返して進行を維持する。実行側で認識停止→再生→待機後に現在区間の認識再開を制御し、終了／非表示では`stopAll()`とイベント世代の無効化を合わせる。`play()`自体はマイクを操作しない。

最終配達では`delivery`と`clear`を重ねず、3面目は`award`を選ぶ。復元／再描画で回収音・配達音を鳴らさず、満杯通過／手ぶら通過でも対応SEを鳴らさない。負数表示は音を追加しない。

Nodeの模擬Web Audioで6イベントの待機時間、移動周波数の交互切替、予約音を含む全停止、未知event、AudioContext生成拒否を検証済み。実際の音色・音量・iOS/Androidの再生許可・マイクへの回り込みは実機試聴未実施。
