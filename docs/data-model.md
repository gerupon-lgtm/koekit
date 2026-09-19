# データモデル

**データベースを使わない。** サーバーを持たず、永続化も原則行わない。

## 1. 永続化の方針

| データ | 保持 | 理由 |
|---|---|---|
| 認識ログ | **メモリのみ。画面を閉じたら破棄** | 要件9.1。その回限り |
| 進捗・到達レベル | **保存しない**【想定】 | 要件9.2。毎回タイトルから始める |
| 方式の選択 | `localStorage`（検証の利便のため）【想定】 | 検証中に方式を切り替えて比較する |
| 音声データそのもの | **保存しない** | 要件11.2 |
| Voskモデル | Service Worker の Cache Storage | オフライン対応（要件12） |

`localStorage` は方式の選択のみ。**子どもの利用記録は一切残さない。**

## 2. 認識ログ（メモリ）

UI遷移用に `await_intro`（確定語）と `await_next`（つぎ）を使用する。加えて正解画像の先送り用に `await_result_next`（つぎ・確定語）を使用する。これらはゲームの試行・認識計測ログに含めず、既存のログ列は変えない。

```js
/** @typedef {Object} LogEntry */
{
  at:            Date,     // UTCで保持。出力時にJSTへ変換
  method:        string,   // 'webspeech' | 'webspeech-local' | 'vosk'
  level:         string,   // '0' | '1'..'5' | 'extra'
  phase:         string,   // 'await_start'|'await_stop'|'await_position'|'await_confirm'
  expected:      string,   // その時点で正解となる語のキー。なければ ''
  rawText:       string,   // 音声認識が返した文字列そのもの
  matchedKey:    string,   // 照合結果のキー。一致なしは ''
  elapsedMs:     number,   // 発話終了検知から処理までの経過ミリ秒
  outcome:       string,   // 'correct' | 'wrong' | 'ignored' | 'spurious'
  sessionRestart: number   // このエントリまでの認識セッション再開回数
}
```

| outcome | 意味 |
|---|---|
| `correct` | 動物が表示された（正解） |
| `wrong` | 止まった位置と違うカードをめくった（失敗） |
| `ignored` | 登録語に一致せず何もしなかった。**カウント対象外** |
| `spurious` | 発話がないのに認識された（誤発動） |

**`rawText` を残すのは、表記揺れを見て `vocabulary.js` の同義語表を後から補強するため**（要件8.7）。

## 3. CSV出力

**カンマ区切り。全フィールドをダブルクォートで囲む。フィールド内のダブルクォートは2つ重ねてエスケープする。**

```
"時刻","方式","レベル","区間","期待語","認識文字列","照合結果","所要ms","成否","再開回数"
"2026-09-16 21:03:11","vosk","1","await_position","right","みぎ","right","820","correct","0"
"2026-09-16 21:03:44","vosk","1","await_position","left","道","","0","ignored","0"
"2026-09-16 21:04:02","vosk","1","await_position","up","""うえ""","up","910","correct","1"
```

- 時刻は **JSTへ変換して出力**（`yyyy-MM-dd HH:mm:ss`）
- クリップボードへコピーする。ファイルダウンロードは行わない
- `navigator.clipboard.writeText()` が使えない場合は、テキストエリアに出して手動コピーできる状態にフォールバックする

## 4. レベル定義（静的データ）

```js
// src/game/levels.js
[
  { id:'0',     layout:'roulette', cards:0, vocab:[] },
  { id:'1',     layout:'lr',       cards:2, vocab:['left','right'] },
  { id:'2',     layout:'ud',       cards:2, vocab:['up','down'] },
  { id:'3',     layout:'plus',     cards:5, vocab:['up','down','left','right','center'] },
  { id:'4',     layout:'corners',  cards:4, vocab:['upleft','upright','downleft','downright'] },
  { id:'5',     layout:'grid3x3',  cards:9, vocab:[/* 9語すべて */] },
  { id:'extra', layout:'grid3x3',  cards:9, vocab:[/* 同上 */], speedFactor:1.5 }
]
```

**レベル4（四隅）は斜め4語を切り出して測るために設けた段。** レベル3から直接9枚へ進めない（要件8.6）。

## 5. 合格ライン判定（フェーズ0）

```js
// src/log/metrics.js が LogEntry[] から算出する
{
  successRate:   number,  // correct / (correct + wrong + 認識されなかった発話)
  spuriousCount: number,  // outcome === 'spurious' の件数
  elapsedMedian: number,
  elapsedMax:    number,
  maxRunWithoutDrop: number  // セッションが落ちずに continuous に処理できた回数
}
```

判定の閾値は要件11.1。**数値は要件0章のB区分（実測後に変更してよい。改訂履歴に1行追記）。** 閾値はコード内の定数として1箇所にまとめ、変更しやすくする。

## 2026-09-20 クリア記録（旧「永続化なし」の一部を置換）

音声ログは従来どおりその回のみ。以下のクリアIDのみlocalStorageへ保存する。

| キー | 対象 | 通常ID | スピードID |
|---|---|---|---|
| `koekit.progress.v1.doubutsu` | ピタリズム | `1`〜`5` | `extra` |
| `koekit.progress.v1.kioku-place` | メモリズム・場所 | `1`〜`5` | `extra` |
| `koekit.progress.v1.kioku-sequence` | メモリズム・順番 | `1`〜`5` | `s1`〜`s5` |

値はJSON文字列配列。全スピードクリア時に `@speed:5` を保存し、既得最高称号を保持する。通常全IDが揃うまでスピードはロック。過去の未記録クリアを補完しない。破損データは無視し、保存拒否時はセッション内保持へ退避してタイトルに知らせる。出題列・回答列・動物配置は保存しない。
