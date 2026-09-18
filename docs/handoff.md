# 引き継ぎ（Claude Code → Codex）

Claude Code が着手した部分の到達点と、続きに必要な情報をまとめる。**まず `AGENTS.md` → `docs/implementation-guide.md` → `docs/requirements.md`（0章A/B/C）→ `docs/tasks.md` を読むこと。** 本書はその上での現状スナップショット（最終更新 2026-09-18、コミット `6977aef`）。

---

## 0. 1分サマリ

### レベル境界の音声・正解札の演出（2026-09-18）

- 紹介の位置語は枠との接触を避けるため13〜18px（360px幅では14.4px）へ再調整し、カード内側に8pxの余白を確保。本文16px、手順の発話例18px、補足15.2px。両作品に反映し、説明スクロールと開始ボタンの固定表示を維持。

- 両作品：紹介を「オーケー／オッケー」、認定書を「つぎ」で操作。紹介は大きなチェック（104px高）、認定書は次へボタン（最小136×112px）。小画面では説明だけスクロールし、チェックは常に表示。
- 受付は `await_intro` / `await_next`。効果音後750msから再開し、画面移動時は予約を解除。共有制御は `src/ui/levelnavigation.js`。ゲームオーバー・延長クリア後の「つぎ」はタイトルへ戻る。
- ピタリズム：正解札の動物を中央へ460msで拡大。結果表示は実機フィードバックで1500ms→3000msに延長（不正解1800msは維持）。動きを減らす設定では移動なし。`src/ui/cardreveal.js`。
- Vosk：初期化待ちの共有・停止後の遅延結果破棄を追加。紹介をタッチで閉じても古い区間の認識を再開しない。
- 検証：ロジック139件通過。Chromeで音声結果を模擬し、両作品のクリア→次レベル→紹介確定、重複語の無視、マイク拒否時のタッチ、390×844／360×640表示を確認。全13紹介のボタンが画面内に収まること、不正解時は拡大しないこと、reduced-motion、演出途中の終了も確認。音声の実発話・Pixel 6aでの新語「つぎ」の精度は未測定。

### CodexでのUI更新（2026-09-18）

- ロゴ：コエキットのアイコンと、小品の文字ロゴを制作。**ピタリ／メモリが個別、ズムが共通**。柔らかなアプリコット・セージ・ブラウンへ調整。素材は `assets/brand/`、共通部品の書き出しは `scripts/export-wordmarks.cjs`、方針は `docs/brand.md`。
- 名称・ロゴ更新 `a2d3d22` は [GitHub Pages run 35350213833](https://github.com/gerupon-lgtm/koekit/actions/runs/35350213833) で公開成功。公開13ファイル（ページ・CSS・manifest・SW・ロゴ・アイコン）が手元と一致することを確認。次作候補「ヌリリズム」は `docs/ideas.md` に発案者の回答を記録（3×3、声の相対移動、マスとパレットのタッチ対応、少数色、画像共有）。新作実装は未着手。

- 公開確認：UI変更 `c784cfd` は GitHub Pages [run 35348322274](https://github.com/gerupon-lgtm/koekit/actions/runs/35348322274) で成功。公開URLのHTML・コントローラ・CSS・開始案内・manifest・SWの9ファイルがローカルと一致することを確認済み。端末上の実発話確認は別途。

- 名称：器は「コエキット」、1本目は「ピタリズム」（旧：どうぶつめくり）、2本目は「メモリズム」（旧：きおくめくり）で2026-09-18に発案者が確定。既存の公開パスは維持。

- 一覧・両アプリのタイトル・盤面・操作ボタン・開始案内を共通配色で更新。開始案内を `src/ui/levelintro.js` へ共通化し、各コントローラの `LEVEL_INTRO` は置換済み。
- 「オーケー／オッケー」は既存語彙で認識可能と確認。案内の主表記を変更し、配置図に各レベルの位置語を表示。認識語・ゲームルールは変更していない。
- 詳細は `screens.md` 冒頭の現行UI記述を参照。GitHub Pagesへの反映には従来どおり stamp → commit → push が必要（公開反映はGitHub Actionsの成功と配信中のBUILD値で確認）。
- 検証：`TZ=UTC` の既存Nodeテスト120項目通過。Chromeの390×844／360×640表示、全13レベルの案内・戻る／Escape、きおくの選択→確定、どうぶつの同じ札を2回タップ→3回正解でクリア、選択時の盤面位置維持、動きを減らす設定を確認。ブラウザの未処理JS例外0件。音声の実発話・スマートフォン実機・オフラインは今回再検証していない。

- **コエキット** = 音声認識検証のPWA試作群。素のHTML/CSS/JS・ES Modules・**ビルド工程なし**。GitHub Pages 公開。
- 収録アプリは2本、どちらも**動作・公開済み**：
  - **ピタリズム**（`doubutsu/`）= 1本目。音声ルーレット（レベル0）＋位置語で当てる本編（レベル1〜5・延長）。
  - **メモリズム**（`kioku/`）= 2本目。9枚の絵を記憶→対象を探して位置を当てる。
- **フェーズ0の関門（要件11.1）は方式C=Voskで実機合格済み**（`docs/field-check-results.md`）。公開版はVoskで確定。
- 音声入力層は**方式差し替え可能な共通部品**（`src/speech/`）。これがこの案件の技術的な核。
- **前任のコードを作り直さない。** A区分は即変更可。C区分と確定5〜9は緩めない（`implementation-guide.md` 5節）。

- リポジトリ: https://github.com/gerupon-lgtm/koekit
- 公開: https://gerupon-lgtm.github.io/koekit/ （`/doubutsu/` `/kioku/`、音デモ `/demo/sounds.html`）

---

## 1. デプロイ手順（重要・毎回これ）

ビルドは無い。デプロイは **stamp → commit → push**。GitHub Pages が自動ビルドする。

```
node scripts/stamp-cache.cjs   # ← 必須。sw.js の BUILD を更新（キャッシュバスター）
git add -A && git commit -m "..." && git push
```

- **`stamp-cache.cjs` を実行し忘れると、アプリ本体のキャッシュが更新されない。** 各デプロイ前に必ず実行。
- ローカル確認は静的サーバで: `python -m http.server 8000`（または `npx serve .`）。**マイク・SWはHTTPSまたはlocalhostのみ。**
- 認証は `gh`（`gerupon-lgtm`）が通っている。push はそのまま可。`git` の LF→CRLF 警告は無害。

### キャッシュ方針（`sw.js`）
- **アプリ本体**（HTML/CSS/JS/フォント/アイコン）= network-first。オンラインなら常に最新。`APP_CACHE` 名に `BUILD` を含み毎デプロイ更新。
- **大きい静的資産**（`lib/vosk/vosk.js`、`assets/animals/`）= cache-first（`STATIC_CACHE = koekit-static-v1`）。毎デプロイでは再取得しない。**これらを差し替えたら `STATIC_CACHE` の版を上げる**（`sw.js`）。
- **Voskモデル（R2・別オリジン・約48MB）** = SW非対象。vosk-browser 側がキャッシュ。

---

## 2. テスト

決定的ロジックは Node スクリプトで検証（実装AIに毎回推論させない方針・`implementation-guide.md` 10節）。

```
node scripts/test-logic.cjs         # 語彙照合/CSV・JST/metrics/区間/判定/フェイント/deal（120項目）
TZ=UTC node scripts/test-logic.cjs  # JST依存の混入検出
```

実機・ブラウザ確認が主。**音声の実発話・ルーレットのアニメ・オフライン起動・PWA単独起動は実機（Pixel 6a）でのみ確認**。

---

## 3. アーキテクチャ / 主要ファイル

```
index.html            コエキット一覧(S-01)。2アプリへ遷移
styles.css            共有デザイントークン＋共有UIコンポーネントのCSS
sw.js / sw-register.js  Service Worker（キャッシュバスター）
version.json          バージョン正典(v0.1.0)
manifest.json         PWA
doubutsu/  index.html + app.js   ピタリズム（コントローラ）
kioku/     index.html + app.js   メモリズム（コントローラ）
demo/sounds.html      合成音の試聴デモ
lib/vosk/vosk.js       vosk-browser 自前配置（唯一の依存・約5.8MB）
assets/animals/        動物画像11枚（差し替え=src/game/animals.js の ANIMAL_FILES）
assets/fonts/ icons/   M PLUS Rounded 1c サブセット、PWAアイコン
probe/                 実機判定用の使い捨てページ（field-check.md 手順）
src/                   共有モジュール（下記）
scripts/               test-logic.cjs / stamp-cache.cjs
```

### src/（共有モジュール。両アプリが使う。アプリ専用実装にしない）
- **音声入力層（核）**：`speech/index.js`（ファクトリ）・`webspeech.js`(方式A/B)・`vosk.js`(方式C)・`config.js`（R2モデルURL）・`vocabulary.js`（同義語表＝データ・照合）・`vosk-worklet.js`。IFは `implementation-guide.md` 6節。
- **ゲーム**：`game/phase.js`（受け付け区間ステートマシン＝常時認識にしない）・`roulette.js`（ルーレット/フォーカス移動・フェイント）・`judge.js`（成否・回数）・`levels.js`・`positions.js`（位置→グリッド/矢印）・`deal.js`（きおく配置）・`animals.js`（画像マニフェスト）。
- **ログ**：`log/recorder.js`（メモリのみ）・`csv.js`（全クォート・JST）・`metrics.js`（合格ライン判定・閾値1箇所）。
- **UI（共有ビュー）**：`ui/board.js`（盤面）・`certificate.js`（認定書）・`levelselect.js`・`micstate.js`。
- **音**：`audio/sfx.js`（正解/不正解/クリア/GO/カウントダウン/タイムアップ）・`cries.js`（合成鳴き声・乗り物音）。
- `util/emitter.js`。

各アプリの `app.js` は上記を組み合わせるコントローラ。**盤面描画・図示・2段階確定・認定書・レベル選択・マイク表示は `src/ui/*` に共通化済み**（重複させない）。

---

## 4. 守る設計（緩めない）

`implementation-guide.md` 5節・要件0章C を必読。要点：

- **C-1**：公開版で利用者の音声を外部送信しない（→方式Vosk/端末内。方式A=既定WebSpeechは検証専用）。
- **C-2**：タッチのみで全機能操作可（マイク未許可でも遊べる）。
- **C-3**：2段階確定（位置をマーク→確定）を省略しない。タッチはダブルタップ（同じ札の再タップ）で確定できるが、これも2操作。
- **C-4**：コロガリズム不変更。
- **確定5〜9**：常時認識にしない（区間ごと開始/停止）／ゲームオーバー廃止しない（5回中3回、易しいレベルは回数を下げるのは可＝B区分）／確定待ちで周囲音を拾う問題に対策を入れない／認識なしはカウントしない／**子ども向けゲーム画面は文字を使わない**（版・©・数字・保護者向けの説明を除く）。

### 実機検証で確定した実装事実（`field-check-results.md`）
1. Voskモデルは `model/` を一段かませて tar.gz 化（直下配置は KaldiRecognizer 生成失敗）。
2. クロスオリジン分離は不要（mini-coi・CORS入れない）。
3. モデルはCache Storageにキャッシュ。更新戦略が要る。
4. 音声は AudioWorklet → AudioBuffer(16kHz) を acceptWaveform に渡す。
5. モデルは Cloudflare R2 公開URLから取得（`src/speech/config.js` の `DEFAULT_MODEL_URL` に設定済み。実ブラウザで取得〜Recognizer生成まで確認済み）。

---

## 5. 完了状況

### フェーズ0（関門・T-001〜T-014）
**方式C=Voskで4指標を全通過し合格**（`field-check-results.md`「フェーズ0 合格ライン計測」）。骨組み・フォント・PWA/SW・入力層・語彙・区間・ルーレット・ログ・CSV・計測パネル(S-07)まで実装・本番確認済み。詳細は `tasks.md` の「フェーズ0 実装状況」。

### フェーズ1（T-015〜T-025）
盤面・フォーカス移動（フェイント）・図示・2段階確定・成否/回数・レベル遷移・延長・認定書・タッチ・レベル選択まで実装。`tasks.md`「フェーズ1 実装状況」。

### メモリズム（2本目）
要件 `docs/requirements-kioku.md`（v1.4）、設計 `docs/kioku-design.md`。記憶提示→対象提示→回答→判定、失敗時の全開示、スタート導入まで実装・本番確認済み。

### 共通UX（A区分・両アプリ）— `tasks.md` に記録
- 各試行は**スタートで始まる**（ピタリズム=スタート/ストップ、きおく=スタートで券面表示＋カウントダウン）。「つぎ」ボタンは無し（スタートが次への合図）。結果は少し見せてスタート待ちへ。
- 図示は**カード自体をマーク**（矢印は使わない）。タッチは**ダブルタップで直接めくる**。
- 確定ボタンは**常時表示・選択前は非活性**（レイアウトシフト防止）。コントロール行の高さ固定。
- **クリア演出**（メダルのポップイン＋後光＋星）。タイトルに**コエキット トップへ戻る導線**。
- **各レベルの最初に保護者向けの概要**（`LEVEL_INTRO`、子に教える用なので文字あり）。
- **ピタリズムレベル0**：ルーレットを**3回止めたらレベル1へ**自動遷移。
- 動物画像11枚を実装（`src/game/animals.js`）。**鳴き声はWeb Audioの正解音で代用**（発案者方針）。

---

## 6. 未決事項・次の候補（Codexへの申し送り）

| 項目 | 内容 | 参照 |
|---|---|---|
| 実機受入（フェーズ1） | 1-a〜1-i、特に**未就学児の被験者**での確認（T-031）。iPhone XR は副対象で結果記録 | 要件14.2 |
| 公開版で方式A封じ | 計測パネルは検証用に方式A(既定WebSpeech)を選べる。**公開版では方式Aを選べないようにする**（C-1の実装的担保・T-029） | 要件11.2 / tasks T-029 |
| オフライン実機 | 機内モードで起動・プレイ（アプリシェル/画像/モデル）の実機確認（T-028） | 要件12 |
| 正式名称 | **確定済み**：コエキット／ピタリズム／メモリズム。公開済みパス `doubutsu/` `kioku/` は維持 | 要件 R-01 / KR-01 |
| 公開判断 | どの状態でSIKUMI LABとして公開するか（R-04） | 要件17 |
| 音の実素材 | 踏切・目覚まし等の実在音は合成で再現困難→**録音サンプル方式**が有力。`assets/sounds/` に置いて `sfx`/`cries` の該当を差し替える下地を作る、が未着手 | 会話ログ |
| 画像の調整 | 枚数・差し替えは `ANIMAL_FILES` 更新＋`STATIC_CACHE`版上げ。大きさ/余白の実機調整 | — |
| 秒数など | 記憶/対象提示秒・フォーカス枠の保持時間・クリア回数・フェイント確率はB区分。実機で調整 | requirements-kioku 8.5 等 |

**【想定】の扱い**：`implementation-guide.md` 4節に残る【想定】のうち確定したものは、該当文書へ確定として書き4節から外すこと（モデル配信先は確定済みで削除済み）。

---

## 7. 既知の落とし穴

- **ルーレットのアニメは `requestAnimationFrame` 駆動**。バックグラウンドのタブ/非表示のプレビューでは rAF が止まり回らない（自動テストで回せないことがある）。実機・前面では動く。
- **vosk-browser は保守が止まっている**（最終公開が古い）。動かない場合は速やかに発案者へ報告（tasks T-008 注意）。
- **方式A/B/Cはブラウザ機能に依存**。方式B（端末内WebSpeech）は実機で ja-JP 非対応と判明済（将来対応すれば予備）。
- **静的資産（画像/vosk.js）を差し替えたら `STATIC_CACHE` の版を上げる**（cache-first のため古いものが残る）。
- 計測パネル(S-07)の合格ライン判定は**レベル0のログ**で行う（`renderPanel` が level '0' でフィルタ）。

---

## 8. 参照文書

| ファイル | 内容 |
|---|---|
| `AGENTS.md` | Codex 入口（最初に読む順） |
| `docs/implementation-guide.md` | 実装指示の正典（技術スタック・**5節=変更禁止**・6節=音声入力層IF・8節=TZ・9節=版・10節=スクリプト・11節=コマンド） |
| `docs/requirements.md` | ピタリズム 要件（**0章A/B/C**・機能ID F-001〜） |
| `docs/requirements-kioku.md` | メモリズム 要件（機能ID KM-・KR-要確認・改訂履歴v1.4） |
| `docs/data-model.md` | LogEntry・CSV・レベル定義・metrics |
| `docs/screens.md` | 画面・遷移・デザイントークン |
| `docs/tasks.md` | 実装順・完了条件・**実装状況/検証済みの事実**・トレーサビリティ |
| `docs/field-check.md` / `field-check-results.md` | 実機判定の手順 / 結果（フェーズ0合格の証跡） |
| `docs/kioku-design.md` | メモリズムの薄い設計メモ（共有化・新規モジュール・タスク） |
| `docs/archive/` | 旧版・上流構想メモ（履歴。公開リポジトリには push していない＝ローカル保管、`.gitignore`） |

## 2026-09-19 音声ルーレットの効果音

- レベル0の数字の回転にも、カード移動と同じ `playTick(interval)` を使用。
- 完全停止ごとに `playCorrect()` を鳴らす。3回目も同じ正解音に統一。
- 停止後は従来どおり700ms待って受付再開、3回目は1000ms待ってレベル1へ。正解音中の認識停止を維持。
- 回転音を有効にした状態での実発話精度は実機確認が必要。
