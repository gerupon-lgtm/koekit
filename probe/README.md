# probe — 実機判定用ページ

`docs/field-check.md` の手順で使う。**GitHub Pages（HTTPS）で開くこと。**

| ファイル | 判定 | 開き方 |
|---|---|---|
| `coi.html` | 判定1-A/B | `.../koekit/probe/coi.html` と `...?coi=1` |
| `vosk.html` | 判定1-C/D | `...vosk.html`（素）／`...?coi=1`（分離あり）／`...?coi=1&model=<別オリジンURL>`（1-D） |
| `webspeech.html` | 判定2 | `.../koekit/probe/webspeech.html` |

## 準備

- `vosk.html` を使う前に、Vosk小型日本語モデルを `probe/model/model.tar.gz` に置く（同一オリジンで分離要否を切り分けるため）。モデルは Vosk 公式配布の `vosk-model-small-ja-*` を `model.tar.gz` にまとめたもの
- `?coi=1` を使う判定は、リポジトリ直下に `mini-coi.js` が必要（WebReflection/mini-coi のファイルをコピー配置）

## 注意

- これらは**判定専用の使い捨てページ**。本番の音声入力層（`src/speech/`）とは別。判定が済んだら本番実装へ結果を反映し、probe は残しても公開ナビからは切り離す
- `vosk.html` は手軽さ優先で vosk-browser を CDN 読み。**本番はオフライン対応のため `lib/` へ自前配置する**（CDN読みにしない）
