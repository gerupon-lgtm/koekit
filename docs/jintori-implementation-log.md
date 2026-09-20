# ジントリズム 実装記録

計画・仕様：`docs/jintorhythm-design.md` v0.3（JT-T01〜06）。開始：2026-09-20。ローカル実装・自動検証済み。実機発話・PWA受入と公開は未実施。

## 進捗

- [x] JT-T01：純粋ルール・特殊色・終局テスト
- [x] JT-T02：座標／発話解析・番号プレビュー・取消・盤面（実発話はJT-T06）
- [x] JT-T03：規定局数／延長・チャレンジ・CPU・先後
- [x] JT-T04：保存・復帰・終了・競合
- [x] JT-T05：メニュー・色選択・案内・Chrome/WebKitでのレスポンシブ検証
- [ ] JT-T06：トップ・SW・版管理・既存回帰・受入記録

## 着手時の確認と判断

- 現在のブランチは `codex/progression-sequence`。文書と音声層に先行未コミット変更がある。既存変更を取り込むためこのチェックアウトで追加実装し、既存作業をリセットしない。無関係な変更をコミット・公開しない。
- ビルド工程・新しい実行時ライブラリは導入しない。素のES Modules、既存Vosk工場、既存12色パレットを使用する。
- UIはイロドリズムのクリーム・セージ・紫・ブラウン、M PLUS Rounded 1c、四辺座標ラベルを継承。メニューはメモリズムの切替方式を参考に条件をまとめる。
- 実機発話・Android/iOS PWAはブラウザ模擬検証と区別する。公開はローカル実装・検証の後に扱う。

## 接続の確認

| 生産側→利用側 | 契約／確認事項 |
|---|---|
| JT-T01→02/03 | 配置前盤面で解析し、通常・追加反転を別集合で返す。最多同数は方向候補を返す |
| JT-T02→03/04 | 選択・番号プレビューは未確定状態。確定操作だけが盤面・残数を更新 |
| JT-T03→04 | 各局先攻・規定局数・延長・連勝を1状態に集約し、結果二重計上を防ぐ |
| JT-T04→05 | 保存失敗・競合・正式終了を区別し、再開／新規の同じ枠は最新1件 |
| JT-T05→06 | タイトル版表示・新規資産一覧・各入力区間をSW／受入に反映 |

各タスクの成果と検証結果は以下へ追記する。

## 実装と検証（2026-09-20）

`jintori/app.js` が画面・音声区間・サイコロ・CPU Worker・保存を接続する。イロドリズムの12色と座標語彙、共通音声ファクトリ・マイク表示・消灯防止・効果音・ルーレットを使用。既存作品のコントローラは変更していない。メニューは切替ボタンにまとめ、クリーム・緑・紫の配色と共通ズム部品のロゴを追加した。

最強色は通常分＋飛び越え先の合計で最多方向を判定。同数なら追加効果0でも番号選択が必須。番号＋オッケーを一度に発話しても番号の選択までに留め、別操作で確定する。4×4では特殊色を使用不可。確定・取消で種類選択を解除する。

保存レビューの修正：旧対戦の遅延save/finishをleaseで拒否。両対戦構成の消化局数から出目と先攻を検算。規定局数前の総合結果、勝数と異なる勝敗、未終局盤面の結果、準備中の成績を拒否する。正式終了はロック解放まで待ち、連打を無視する。残数0はNO_ITEM、4×4はITEM_UNAVAILABLE。音声パーサー側でも使用不可アイテムを除外する。

最終レビューで、最高連勝更新時の保存失敗後に終了すると最新記録が落ちるケースを追加修正。`finish(lease, latestRun)` にメモリ上の最新状態を渡し、最高記録とactive=nullを同時保存する。再現テストを追加し、再レビューで重要残件なし。Chromeでふたり4×4の12手・CPU対戦を終局まで通し、正式終了まで確認した。

320×568の「続きから」があるメニューも縦スクロールなしを検証。再開／新規の2ボタンを横並びにして、通常のメニューと同じ高さに収めた。

| 検証 | 結果・範囲 |
|---|---|
| 新規Nodeテスト7ファイル | 55ケース成功。ルール19、CPU11、発話解析5、対局進行6、保存8、音声区間3、効果音3 |
| `test-jintori-browser.cjs` | Chrome・WebKit成功。色選択、同色禁止、発話スタート、プレビューと確定の分離、取消、再開、終了。320×568・390×844・768×1024で横はみ出しなし・確定ボタンが画面内 |
| `test-jintori-integration.cjs` | Chrome成功。8×8 hardの実Worker着手、別タブ排他、到達可能盤面の最多同数・番号プレビュー、初回SW事前キャッシュ後のオフライン起動・CPU/タッチ対戦 |
| `test-jintori-faults.cjs` | Chrome成功。マイク拒否時のタッチ、キーボード選択のフォーカス維持、容量不足時の終了失敗と再試行、到達可能な引分結果からの延長、終了連打 |
| 保存の通し検証 | 4/6/8、毎局補充/持越、規定局数/連勝の組合せでCPUが合法手を打ち、各手・局境界を保存・復元。終局・先後・在庫の整合性を検証 |
| 既存回帰 | `test-logic.cjs` 171件、progression、sequence、public-speech、offlineの各ブラウザテスト成功。public-speech初回は待機タイムアウト、単独再実行で成功 |
| イロドリズム回帰 | `test-jintori-irodori-regression.cjs` 成功。既存自由制作で色選択→プレビュー→確定→取消を実DOMで確認 |
| SW・版 | `test-sw.cjs`、`check-version.cjs`、`test-version.cjs` 成功。新タイトル版表示も検証対象。共通版番号0.1.0を維持 |

Chrome/WebKitはいずれもWindows上の自動ブラウザであり、iPhone SafariやAndroid実機を検証したという意味ではない。音声は区間のモックまたは認識不可状態で検証し、実発話精度・モデル取得済み音声オフライン動作は未検証。

## 再実行

1. プロジェクト直下で `python -m http.server 8000 --bind 127.0.0.1` を起動。ローカル画面は `http://127.0.0.1:8000/jintori/`。
2. Node検証：`node --test scripts/test-jintori-commands.mjs scripts/test-jintori-cpu.mjs scripts/test-jintori-rules.mjs scripts/test-jintori-run.mjs scripts/test-jintori-storage.mjs scripts/test-jintori-voice.mjs`。
3. ブラウザ検証：`node scripts/test-jintori-browser.cjs`、`node scripts/test-jintori-integration.cjs`、`node scripts/test-jintori-faults.cjs`、`node scripts/test-jintori-irodori-regression.cjs`。検証専用Playwrightは `.local-tools/node_modules/playwright`、Chromeを使用。
4. WebKit：PowerShellで `$env:PLAYWRIGHT_BROWSERS_PATH="$PWD\.local-tools\browsers"`、`$env:JINTORI_ENGINE='webkit'` を設定し、`node scripts/test-jintori-browser.cjs`。テスト用ブラウザのみローカル導入済み。ゲームの実行時依存には追加しない。

スクリーンショットは `.local-tools/jintori-title-320.png`、`jintori-game-{320,390,768}.png`、`jintori-direction-320.png`。共有ロゴの再生成で既存3作品のSVGに変更が出ていないことも確認した。

## 残る受入・公開

2026-09-20発案者が公開を承認。あわせて効果音の種類追加と、固定4×4の「毎局補充／持ち越し」の非活性化を指定。専用音源モジュールを追加し、9種類の音の実波形生成・クリッピングなし・予約音取消・認識との区間分離を `test-jintori-sound-browser.cjs` で確認した。固定4×4→6×6→4×4の非活性／有効切替と選択値の維持を結合テストへ追加。

- Android/iOSで12色、A/E/H座標、きょうか／さいきょう、方向番号、オッケー、取消、終了の実発話を確認。
- 取得済みモデルで機内モード音声・PWA起動を確認。
- 実機8×8の操作感・CPU応答・表示密度を確認し、必要なら設定値を調整。公開前の調整内容は記録する。
- 公開は未実施。先行する未コミット文書・Vosk変更が同じチェックアウトにあるため、公開対象を整理し、stamp・版検証・公開後ファイル確認を行う必要がある。
- JT-T06とスレッドの全体目標は未完了。ローカル自動検証の成功を実機受入・公開完了の代わりにしない。
