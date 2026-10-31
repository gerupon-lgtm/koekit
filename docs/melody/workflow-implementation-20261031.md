# 曲の選択と画面遷移 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 合意したスマホの曲選択・試聴・制作／連結・保存終了を既存アプリへ接続し、検証して公開する。

**Architecture:** 既存SongWorkflow、MelodyScreens、LibraryPlaybackと保存形式schemaVersion=1を再利用する。再開先と試聴対象の判定は純粋関数へ分ける。画面名は任意のnavigationとして曲のdataへ追加し、音符・登録フレーズ・配置・音声処理は維持する。

**Tech Stack:** 素のHTML/CSS/ES Modules、既存IndexedDB、Node、Playwright。ビルドや依存は追加しない。

**Spec:** [最新合意](workflow-agreement-20261031.md)、ML-007/011/012/016。

## Global Constraints

- 音声外部送信禁止、タッチ維持、候補→オッケー／取消／Undo、別作品不変更。
- 曲ごとの保存、別曲材料の独立コピー、最大10曲・16配置を維持。
- 320/390px、横向き、文字拡大、PC。44px操作・8px間隔、閉じる右上、停止中央。
- 既存の未公開差分を統合し、親チェックアウトとkoekit-storyを変更しない。
- デプロイ前にstamp-cache.cjs、版整合、必要回帰、公開ファイル一致と公開ブラウザを実行。
- デプロイは2026-10-31の発案者指示で承認済み。実機受入とは区別。

## Review Focus

- 同名2曲のひらく／試聴／エラーログが同じ対象IDを扱う。
- 画面切替と追加制作で保存世代・候補・登録材料・並びが混ざらない。
- 旧曲、登録だけ、制作中だけ、配置草稿の再開を壊さない。
- 保存失敗・保存待ち中の重複操作・別タブ競合・破棄確認取消でも保存を失わない。
- 一覧選択の取消・音源準備中の取消・旧い非同期完了で別曲を鳴らさない。

## Task 1: 再開と試聴対象の判定

Files: 新規 `probe/saezuri/workflow-state.js`、`scripts/test-saezuri-workflow-state.mjs`。
Interfaces: `songNavigation(data)`→{screen,mode}、`songPlaybackChoices(record)`→[{id,label,state,pattern,backing?,ending?}]。

- [x] 判定・互換・複数登録・確定／草稿の分離・保存不変の失敗試験を先に実行。
- [x] 既存restoreCheckpoint/entryPreview/sequencePlaybackを使って実装し、8件を成功確認。

## Task 2: 実画面・保存・試聴の接続

Files: `screens.js/css`、`song-workflow.js`、`library-playback.js`、必要なら専用の選択UIモジュール。`scripts/test-saezuri-workflow-browser.cjs`。
Interfaces: Task 1の判定関数を使用。既存保存dataへ任意の`navigation:{screen:'create'|'connect',mode:'input'|'edit'|'backing'}`を追加。

- [x] 新規ブラウザ試験でトップ2入口・直接切替・再開・試聴選択・追加取消・保存待ち／失敗／破棄取消を失敗確認。
- [x] 既存処理を維持して接続。空の連結へトップから入れず、通常終了は保存後に全作業セッションを閉じる。
- [x] 既存回帰の旧導線を新導線に合わせ、機能のアサーションは維持。関連ロジックとChromeブラウザを小さい直列バッチで成功確認。

## Task 3: レビュー・公開

- [x] 設計・要件・タスク・引継ぎを今回の合意と実装状態へ同期。
- [x] 固定点`fd25477ad1fac86911112feb1ebbb26bf2ac92d5`からの差分を別の目でレビューし、必要修正と試験を行う。
- [x] スタンプ・check-version・キャッシュ試験を実行し、対象ファイルのみcommit/push。
- [x] Pages公開完了、公開全ファイルのHTTPS・種別・長さ・SHA-256一致、公開ブラウザを確認。実機再生エラーは未解決の範囲を明記。

## Progress

- 2026-10-31: 計画・仕様の一括反映に着手。独立実装のサブエージェントは使わず、最後のレビューのみ各スキルの明示指示で依頼する。
- 判定8件は未実装で失敗→実装後8/8。新規workflow-browserは旧トップ文言で失敗→基本経路の成功を確認。保存待ち・配置草稿終了・作例追加を追加検証中。
- 既存Chromeの一覧再生、登録だけの再生、改名、同名曲エラー導線、追加／コピー、配置編集、エンディングが成功。旧入口がなくなった試験は新しい実操作経路に更新し、保存・音符・コピー元・取消・Undoの確認は維持。
- Ruling: 作例から同じ曲へ追加する場合も既存テンポを保持するためapp.jsのonOpenPatternを対象へ追加。100→120へ変わる失敗を先に確認。新規曲の作例と独立したおてほんは従来のテンポを使う。
- ローカルChromeは通常サンドボックスからのループバック接続が制限されるため、承認レビューを通したローカル試験コマンドで実行。全ブラウザ／Nodeの一括終了は行わない。
- **レビュー**：固定点fd25477→不変tree `6d8795d0c14faa79d09206c367601e6803e7d212`を、code-reviewの仕様軸／規約軸で独立して読み取り専用確認。規約軸1件・仕様軸3件のImportant（重複を除き3課題）を確認。新規review-browserの未登録曲保護、手入力とイメージのテンポ、同一失敗の自動再送、再試行中の終了保護の5条件を修正前に失敗確認し、修正後5/5成功。
- **ロジック全体**：サエズリズム47 mjs＋共通logic/version/SW/cacheの計51ファイルを、最大5ファイル・並列度1の11バッチで実行し、全バッチexit 0。Nodeランナー計307件（共通スクリプト内の個別アサーション数とは別）。ログはignoredの`.local-tools/workflow-20261031/unit-1.log`〜`unit-11.log`。
- **Chrome回帰**：workflow／review、library-playback／shelf／error-open、song-rename／songs、phrase-tools／handoff、placement、ending、navigation、screens、storage-edges、chord-phrase／chords、controls、cache、keyboard、image-mode、loop、hummingが成功。保存競合・容量・8段階の練習・同名曲ID・配置修正版・320/390px・横向き・文字200%を各関連試験で確認。全既存ブラウザ試験の全件実行や実機受入とは区別する。
- **固定欄の重なり**：8小節で自動スクロールした試聴ボタンが固定の停止欄に覆われる失敗を確認。main内の操作に下側のスクロール余白を付け、試聴／確定が停止欄より上に収まることと、既存の4サイズの操作間隔を成功確認。
- **録音の境界**：loop試験のマイクOFFは、隠れたボタンへの自動操作待ちで録音完了後になっていた。録音中のマイクOFFイベントを直接発火する処理へ直し、元の確定音・候補・Undoを確認。Chrome標準の模擬入力と既知440Hz WAVの両方で成功。これはモデル上の取消検証で、実マイク操作の受入とはしない。hummingは既存の合成波形で7音、解析Workerとカウント／録音区間／停止を確認。
- **WebKit**：2336でsong-rename／phrase-tools／phrase-handoffの3スクリプトが成功。phrase-handoffは320×568のタップ、390×740のハナウタ由来保存データ、390×568のコードのみ、390×740のイメージ由来コードのみを確認。非同期の一覧表示は読み込み完了を待って容量メッセージを検証。AudioContextのない環境のため、画面・保存・操作の証拠であり、実音やiPhone受入とはしない。

## 実装時の判断とレビューで保留した点

- Ruling: 未登録の制作中の音を無言で置換すると保存曲が消える経路があったため、追加制作をいったん制作へ戻して明示登録を案内する。自動登録／確定はせず、元の作業を保持する。代償は未登録のときの確認・登録の一手間。
- Ruling: 失敗した同じ保存を再描画だけでは再送せず、明示再試行と新しい編集による自動保存を分ける。代償は保存環境だけ復旧しても再試行ボタンを押す必要があること。表示済みの案内と一致する。
- Ruling: 実機の音響・本人の再生エラーは今回のPC検証で解決扱いにしない。過去の全アプリMVPや実機受入を完成と表示しない。スマホ実機は継続確認。
- Ruling: 曲の長さ・秒数の一覧メタデータと、既存の汎用削除確認文言の具体化は、この差分が新たに変更した処理ではない。曲の保存IDへの結び付けと削除保護は維持して試験し、広い既存要件の全実装完了とは扱わない。
- Ruling: 一覧で配置済みの曲を聴く場合は確定した並びを使う。未確定の並びは既存の連結画面で試聴でき、今回承認されたフレーズ選択へ別の全曲選択肢を無断追加しない。

## 公開確認（2026-10-31）

- 初回実装コミット `7a305bdca8dea2e9962eb424bbb52c1f77548762` をmainへ反映。初回BUILD `v0.1.0-20261031005919-fd25477`。末尾SHAはスタンプ実行時の親コミットを示す。最終公開版は下の追補を参照。
- [Pages 41153135767](https://github.com/gerupon-lgtm/koekit/actions/runs/41153135767)：build／report-build-status／deployの3ジョブsuccess。
- `verify-saezuri-release.cjs`：公開107ファイルのHTTPS・HTTP成功・内容種別・長さ・SHA-256がGit blobと一致。
- 通常の[公開URL](https://koekit.sikumilab.com/probe/saezuri/)でworkflow／workflow-review／library-playbackの3スクリプトが成功。実ブラウザの音の時計・準備取消と同名曲ID、確定／候補の試聴、保存待ち・失敗・再試行・未保存分だけ破棄、配置草稿の再開を確認。各試験は隔離したブラウザ保存領域を使い、本人の保存曲を変更しない。
- 最終スタンプ後も版整合・キャッシュスタンプ・SW・判定11件と、ローカルChromeのworkflow／workflow-review／cache／chordsが成功。
- 本人のPixel 6aで失敗した曲の実データと実音の受入は未確認。今回の画面変更・PC試験を、その再生エラーの解決や実機合格の証拠とはしない。

### 公開画像確認の追補・最終公開版

- 公開画像で一覧の「ひらく」が2列分を占め、「聴く」が縦に折れ「…」が次の行へ落ちることを発見。旧一覧用のgrid-column指定が新しい操作欄へ効いていた。320／390pxと横向きで3ボタンの位置・幅を調べる試験を追加して失敗確認し、旧指定を除去後に成功。行のflex指定を1か所へ整理し、強制上書きを除去。
- 修正コミット `05180313f7e29582a3432a7c583890ac7aaaa0d2`、最終BUILD `v0.1.0-20261031010401-7a305bd`、画面の識別番号 `20261031010401`。
- 最終スタンプ後に版整合・cache-stamp、Chromeのworkflow／library-playback／controls／cacheが成功。WebKitでも320／390／844pxで3操作が同じ行に収まり、横はみ出しがないことを確認。音符・保存処理・音源は追補で変更していない。
- [Pages 41153560672](https://github.com/gerupon-lgtm/koekit/actions/runs/41153560672)：3ジョブsuccess。公開107ファイルの内容種別・長さ・SHA-256とHTTPSが修正コミットに一致。通常の公開URLで追加した配置検査を含むworkflowも成功。
- 公開サイトのトップでSW（オフライン用の配信処理）を登録し、その制御下でサエズリズムを再読み込み。最終識別番号・JavaScriptエラー0件・390×844でトップ／作り方選択／保存一覧／つなげるの画像を確認。保存一覧の3操作が1行に収まることを画像でも確認。証拠はignoredの`.local-tools/workflow-20261031/public-*.png`と`public-snapshot.cjs`。実機受入とは区別する。
- この追補の後に行う文書だけの同期では、アプリの内容とBUILDは変更しない。

## 文書同期の対象

- 更新：最新合意、requirements-melody、専用design/summary、共通screensの参照、tasks、両handoff、本記録。
- 更新不要：共通データモデル・実装ガイド・README。共通の音声・保存規約や外部APIを変更せず、任意navigationの専用設計はmelody/designで定義。READMEに本作固有の古い操作説明はない。
