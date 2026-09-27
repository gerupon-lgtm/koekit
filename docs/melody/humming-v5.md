# ハナウタ試作v5 — カウントの高低と補正後の記録

2026-09-27。発案者から、Pixel 6aの先頭休符を詰め、冒頭Gと続くF♯をつなげた形が期待値との説明、およびカウントの高低の役割を逆にする指示を受領。

## カウント

小節頭を8.5〜10.5kHz、通常拍を6.5〜8.5kHzへ入れ替える。小節頭40ms・ピーク0.18、通常20ms・ピーク0.09の強弱は維持。準備の2分×2→4分×4、録音・試聴の4分カウントすべて同じ合成関数を使う。録音解析側でシェーカー帯域を抑える処理を維持する。

## 記録の見方

提供された記録はv4の同じ取り込み（sessionId 28、timestamp `2026-09-26T23:55:30.559Z`）を再試聴したもの。`captureAlignmentTicks: 1`なので頭詰め済み。`capture.notes`は元の解析結果のままであり、操作後にstartTick1が表示されても頭詰め失敗を意味しない。

v5では`captureCandidate`に現在の取り込み候補（譜面・試聴で使う音符列）を追加し、`capture.notes`と区別する。頭を詰めた今回の例では先頭Gがtick0・長さ2、F♯がtick2・長さ4になる。2音間に譜面上の休符は既になく、音程を一音へまとめることと、音程変化を保つレガート再生は別の変更になる。

v5公開時点では「一つのF♯長音にまとめる／G→F♯を保って切れ目なくつなぐ」の意図を確認中だった。その後「F♯を頭から発音しているつもり」と回答を受領。[v6](humming-v6.md)で歌い出しの半音ずれを後続の長音へまとめる調整を追加。

## 検証

```powershell
$env:TZ='UTC'
node --test scripts/test-saezuri-capture-timing.mjs
node scripts/test-saezuri-count-browser.cjs
node scripts/test-saezuri-humming-browser.cjs
node scripts/test-saezuri-probe-browser.cjs
node scripts/check-version.cjs
```

44.1/48kHzで小節頭の主帯域が高く通常拍が低いことを検査。両音の抑制、低・中・高音の旋律保持、カウント時刻、停止／OFFも確認する。公開状況は[公開記録](preview-deployment.md)を参照。

結果：Node9件成功。ローカルのカウント・7音合成捕捉・Chrome操作検証成功。`d6628c6`でHTTPS仮公開し、公開16ファイル一致・カウント／通常操作検証成功を確認。
