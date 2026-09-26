# コエキット

こえとタッチであそぶ、SIKUMI LABの小さなゲーム集。素のHTML/CSS/JavaScriptによるPWAです。

[コエキットをひらく](https://gerupon-lgtm.github.io/koekit/)

## 収録アプリ

| アプリ | あそび | 公開パス |
|---|---|---|
| ピタリズム | まわして、とめて。止まったカードの位置を当てる | [あそぶ](https://gerupon-lgtm.github.io/koekit/doubutsu/) |
| メモリズム | 場所：動物の位置を思い出す／順番：光った位置を順番にこたえる | [あそぶ](https://gerupon-lgtm.github.io/koekit/kioku/) |

3つの名称は2026-09-18に確定。旧仮称は「どうぶつめくり」「きおくめくり」で、公開済みのURLはそのまま使います。

音声とタッチのどちらでも遊べます。マイクを許可しなくても操作できます。位置を選んでから確定する2段階操作です。

## 開発・確認

ビルド工程はありません。静的サーバーで起動します。

```sh
python -m http.server 8000
node scripts/test-logic.cjs
node scripts/check-version.cjs
```

GitHub Pagesへの公開は `node scripts/stamp-cache.cjs` → commit → push。端末内音声認識にはVoskを使います。実機での受入確認の残件は `docs/tasks.md` に記録しています。

## 文書

- [引き継ぎ](docs/handoff.md)
- [実装ガイド](docs/implementation-guide.md)
- [ピタリズムの要件](docs/requirements.md)
- [メモリズムの要件](docs/requirements-kioku.md)
- [順番モード・記録・検証手順](docs/sequence-mode.md)
- [画面設計](docs/screens.md)
- [実装タスク](docs/tasks.md)

## 音声・プライバシー

通常のゲームは端末内Voskで認識します。公開版で音声を外部送信しない方針です。公開ゲームでは既定WebSpeech（方式A）を選べません。URLや旧保存設定からの指定もVoskへ戻します。方式Bは端末内処理を指定できる場合だけ開始し、非対応時もタッチで遊べます。音声そのものは保存せず、検証ログはその回限りで保持します。

© 2026 SIKUMI LAB

## デリバリズム

**デリバリズム**：声とタッチでロボットの道順を組み、荷物を届ける小品。`delivery/` に本編・練習・自作面・保存再開を実装し、アセット制作と自動検証を完了。2026-09-26に[公開](https://gerupon-lgtm.github.io/koekit/delivery/)しました。Android/iOSの実発話・PWA受入は継続します。[実装記録](docs/delivery/implementation-log.md)。[基本設計サマリ](docs/delivery/summary.md)／[要件書](docs/requirements-robot.md)。
