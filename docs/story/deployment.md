# モノガタリズム 公開記録

2026-09-27、発案者がロゴ・画面・トップカードを承認し、デプロイを指示。

- 公開先：https://koekit.sikumilab.com/story/
- トップ：https://koekit.sikumilab.com/
- 配信：GitHub Pages、main ブランチ直下。
- 状態：公開・本番検証完了。実装コミット `1b5677efda3c98c1f05b2313c861c6c3cae056fc`。GitHub Pages の `built`（エラーなし）を確認。公開完了日時は2026-09-27 20:45 JST。
- SW BUILD：`v0.1.0-20260927113915-0c56d40`。共通版数0.1.0を維持。
- 対象：明るいローズの正式ロゴ、既存作品に合わせた画面・導線、トップの本作カード、サエズリズムのリンクなし「近日公開予定」カード、SW事前キャッシュ。

## 検証

- `node scripts/test-story.mjs`：6,000通り成功。
- `node scripts/test-speech-policy.mjs`、`node scripts/test-sw.cjs`、`node scripts/check-version.cjs`：成功。
- `docs/story/verify-ui.cjs`：320/390/768px、声の結果注入・タッチ、ヘルプ・終了・戻る、自動進行、遅延読み上げ取消、マイク拒否、読み上げ非対応をChromeで確認。
- `docs/story/verify-release.cjs`：7カード、近日公開予定、オフラインで本作の初回表示・物語生成・トップ帰還をローカルと本番URLのChromeで確認。
- 公開HTML・CSS・JS・SVG・SWの7ファイルがローカルと一致することを確認（改行コードを正規化）。
- 実機の発話・読み上げ、Android/iOS PWAの今回分の受入は未確認。

ブラウザ検証は既存Playwrightを `STORY_PLAYWRIGHT` で指定。公開先の検証では `STORY_BASE=https://koekit.sikumilab.com` を指定する。アプリへの追加依存はない。
