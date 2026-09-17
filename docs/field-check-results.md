# 実機検証の結果（証跡）

**実施日**: 2026-09-16（JST）
**端末**: Pixel 6a / Android 17 / Google Chrome 153.0.8010.37（64bit・公式ビルド）
**実施者**: たんたん（シクミラボ）
**配信**: アプリ＝GitHub Pages（gerupon-lgtm.github.io/koekit/）、モデル＝Cloudflare R2（pub-...r2.dev）

以下はすべて、上記の実機で画面表示を確認した**実測の事実**（推測ではない）。

---

## 判定2（T-007）方式B：端末内 Web Speech の日本語可否 → 不可

| 項目 | 結果 |
|---|---|
| `SpeechRecognition` 存在 | あり |
| `install()`（ja-JP, processLocally） | 完了する |
| 認識実行 | **失敗。`onerror: language-not-supported`（2回とも同じ）** |

**結論**: 方式B（端末内処理）は、この端末・この版では ja-JP 非対応。将来Chromeが対応すれば有利になる予備という位置づけ。

## 参考：方式A（既定 Web Speech）→ 動作する

- 「ストップ」を認識 → `onend` 正常。ja-JP の基本認識は通る。
- ただし公開版では使わない（要件C-1。外部送信の可能性があるため）。本人の検証用のみ。

## 判定1（T-004 / T-008）方式C：Vosk → **成功（本命として実証）**

### クロスオリジン分離

| 項目 | 結果 |
|---|---|
| `crossOriginIsolated` | **false** |
| `SharedArrayBuffer` | **なし** |
| Voskモデル読込 | **それでも成功** |

**結論**: Voskは分離なしで動く。**mini-coi 不要、CORS設定も不要。** GitHub Pages のヘッダ制限は問題にならない。

### モデル配信

- Cloudflare R2 の公開URL（`https://pub-....r2.dev/model.tar.gz`）から読み込み成功。
- **R2側のCORS設定なしで github.io から読めた**（追加設定不要）。
- モデル: vosk-model-small-ja-0.22（tar.gz で 47.3MB）。

### 認識

- 日本語の操作語を認識。画面に「確定: 右」「確定: down（英語モデル時）」等を表示。
- `result` と `partial` が正常に発火（partial が数百回、result が確定時に発火）。

### モデルの詰め方（重要・確定した事実）

- **正しい形: `model/` フォルダを一段かませて tar.gz 化する。**
  ```
  unzip vosk-model-small-ja-0.22.zip
  mv vosk-model-small-ja-0.22 model
  tar zcf model.tar.gz model
  ```
  → tar.gz を開くと最初に `model/` が1個見える。
- **誤り: `am` `conf` `graph` … を直下に置く形。** この形だと createModel は成功するが、
  **KaldiRecognizer の生成で失敗する**（`Recognizer ... Could not be created due to: <数値>` → 以降 `Not ready` 連発、認識結果は出ない）。
- 切り分け根拠: 公式デモの英語モデル（`ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz`）を同じprobeで読むと英語は認識できた。probeのコードは正しく、原因はモデルの詰め方だと確定した。

### キャッシュ挙動（本番設計に反映すべき事実）

- vosk-browser はモデルをブラウザに**キャッシュする**（Cache Storage）。2回目以降は再ダウンロードしない。
- **モデルを差し替えても、通常タブでは古いキャッシュが残る。** シークレットタブ、またはサイトのデータ削除で新しく読み直す。
  - 実測: キャッシュ有効時 `createModel` 1.3秒 → キャッシュ削除後 8.6秒（R2から再取得）。
- **本番では、モデルにバージョンを付け、更新時にキャッシュを切り替える仕組みが要る**（要件12・T-003・T-028）。
  一方で、この「一度読めば残る」性質はオフライン対応（再訪時に48MBを再取得しない）に直結する利点でもある。

### 使用ライブラリ

- vosk-browser v0.0.8（jsdelivr CDN、probe用）。
- **probeでは音声取り込みを AudioWorklet で実装**し、`AudioBuffer(16kHz)` を `acceptWaveform` に渡す形で認識できた。
  （`ScriptProcessorNode` は非推奨。Int16 を直接渡すのは不可＝`getChannelData is not a function` になる。AudioBufferを渡すのが正しい。）

---

## 総括

- **本命の方式C（Vosk）が、Pixel 6a 実機で日本語操作語を認識できることを実証した。** 検証の主目的を達成。
- 方式Bは現時点 ja-JP 非対応。方式Aは検証専用。→ **公開版はC で確定。**
- インフラ面の懸念（クロスオリジン分離、CORS）はいずれも**不要**と判明。構成が最も簡素な結果になった。
- 実装で必ず効く確定事項: (1) モデルは `model/` を一段かませて固める (2) モデルのキャッシュ更新の仕組みが要る (3) 音声は AudioWorklet → AudioBuffer(16kHz) で渡す。
