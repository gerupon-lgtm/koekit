# lib/vosk

vosk-browser（WebAssembly 版 Vosk）を**自前配置**したもの。オフライン対応のため CDN 読み込みにしない
（implementation-guide 2節・probe/README.md）。

- `vosk.js` — vosk-browser v0.0.8 の dist（UMD、`window.Vosk` を定義）。取得元:
  `https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js`
- ライセンス: vosk-browser は Apache License 2.0（本ファイル内に著作権・ライセンス表記を含む）。
  Vosk / Kaldi 由来部分もそれぞれの OSS ライセンスに従う。

**注意**: vosk-browser は最終公開が古く保守が止まっている（tasks.md T-008）。
不具合時は速やかに発案者へ報告する。日本語モデル本体はリポジトリに含めず、Cloudflare R2 から配信する
（`src/speech/config.js`）。
