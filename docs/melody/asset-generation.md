# 小鳥B・基本姿勢の生成記録

2026-09-27。組込み `image_gen` を使用（CLI/APIキー方式は不使用）。参照は `docs/melody/references/bird-concepts-abc.png` の中央B。`transparent_background: true`。

保存先：`assets/saezuri/bird-neutral-v1.png`。生成結果は1254px角の透過PNG。既存原画は変更していない。試作だけへ配置し、本番公開はしていない。

## 最終プロンプト

```text
Use the attached image as the exact character identity reference. Create one standalone transparent PNG asset for the Saezurhythm educational music app. Isolate and faithfully recreate ONLY the large central bird labeled B in its neutral standing pose: soft powder-blue round head and wings, cream face patches and lower belly, apricot breast gradient and small open orange beak, large dark-brown oval eyes with highlights, tiny orange feet, rightward blue tail, and the distinctive blue single musical-note-shaped crest. Preserve B's proportions, expression, colors, soft watercolor/plush texture and feather shape. Single full-body bird centered on a square 1024px canvas, modest 8% clear padding, feet aligned near lower edge. Actual alpha transparency surrounding the bird, no solid background, no checkerboard drawn, no ground plane or cast shadow, no text, no letters, no logo, no other birds or props. Do not change to the A or C character. This is a production cutout of the adopted B design, not a redesign.
```
