# きおくめくり 設計メモ（薄い版）

**フルの基本設計は作らない。** どうぶつめくりで確立した設計（`implementation-guide.md` / `data-model.md` / `screens.md`）と実装をそのまま継承し、**差分だけ**をここに書く。入力である要件は `requirements-kioku.md`。

## 1. 方針

- コエキット2本目。**共通部品を最大限流用**（要件10.3）。抽選（スタート/ストップ・ルーレット）は無い。
- 先に**共有化リファクタ(A)**を行う（本メモの主目的）。今 `doubutsu/app.js` に閉じている UI/ゲーム部品を `src/` へ切り出し、どうぶつめくりも同じ共有モジュールを使う形にしてから、きおくめくりを組む。**二重管理と手戻りを防ぐ。**

## 2. 配置

```
/
├── index.html         コエキット一覧（S-01）に2枚目のカードを追加
├── doubutsu/          1本目（ルーレット＋計測）
├── kioku/             2本目（仮ディレクトリ名。正式名称未定 KR-01）
│   ├── index.html
│   └── app.js         きおくめくりのコントローラ
└── src/               ← 共有（両アプリが使う）
```

## 3. 共有化(A)：src/ へ切り出すモジュールと責務

| モジュール | 責務 | 主API（案） |
|---|---|---|
| `src/game/positions.js` | 位置キー→3×3セル(r,c)と矢印回転(deg)、ALL_POSITIONS | `POS`, `ALL_POSITIONS` |
| `src/ui/board.js` | 盤面ビュー：セルへ札配置・フォーカス/選択/めくり・前面内容の差替・図示（矢印/中点）・タップ | `class BoardView(boardEl, figureEl, {onCardTap})` : `render(keys)` / `setContent(key,node)` / `clearContent()` / `setFocus(key)` / `setSelected(key)` / `setFlipped(key,faceUp)` / `setCorrect(key,b)` / `flipAll(faceUp)` / `clearMarks()` / `showFigure(key)` |
| `src/ui/certificate.js` | 認定書：メダル＋星（文字なし） | `renderCertificate(medalEl, starsEl, {kind, stars})` |
| `src/ui/levelselect.js` | タイトルのレベル選択ボタン生成 | `buildLevelSelect(wrapEl, levels, onPick)` |
| `src/ui/micstate.js` | 受け付け状態表示（発光/斜線/点滅） | `setMicState(stateEl, stageEl, state)` |

**既に共有済み**：`src/speech/*`（入力層）、`src/game/phase.js`（区間）、`src/game/judge.js`（判定）、`src/game/levels.js`、`src/game/roulette.js`（doubutsu専用の使用）、`src/log/*`、`src/audio/sfx.js`。

**各アプリ固有（controller に残す）**：doubutsu＝ルーレット進行・計測パネル(S-07)・レベル0のログ計測・フォーカス枠の保持時間。kioku＝記憶フロー。

### board.js のカード構造（両対応）
`<div class="card"><div class="front"></div></div>`。`.card.flipped` で前面(`.front`)を表示。前面の中身は各アプリが `setContent` で差し込む：
- どうぶつめくり：正解時に**赤丸プレースホルダ**、外れは空。
- きおくめくり：**絵(`<img object-fit:contain>`)**。記憶提示＝全札 `flipAll(true)`、裏返し＝`flipAll(false)`、失敗開示＝`flipAll(true)`。

## 4. きおくめくり 新規モジュール（(A)の後に着手）

- `src/game/deal.js`：そのレベルの枚数ぶん、絵→セルを割当て、対象の絵を1つ選ぶ。**毎試行ランダム**（KM-010）。
- `kioku/app.js`：記憶提示(記憶秒)→`flipAll(false)`→対象提示(対象秒・認識停止)→位置語待ち→2段階確定→正解(赤丸＋正解音)/失敗(全開示＋正解位置)→次試行 or クリア/ゲームオーバー。
- **Judge 拡張**：`clearHits` 到達で「クリア済だが続行可・自動遷移しない」。現 `Judge` は到達で `clear` に遷移して止まるため、`continueAfterClear` オプション（到達後も5回まで `playing` を維持し `cleared` フラグを立てる）を足す。ゲームオーバーは従来どおり。

## 5. データ
配置マップ（メモリのみ）：`{ [cellKey]: 絵ID }` ＋ `targetId`。試行ごとに再生成。永続化しない。

## 6. タスク順

| ID | 内容 | 状態 |
|---|---|---|
| K-T01 | **共有化リファクタ(A)**：positions/board/certificate/levelselect/micstate を src/ へ。doubutsu を再配線し回帰確認 | ✅完了（共有CSSは styles.css へ集約。どうぶつめくりの回帰なしをブラウザ確認） |
| K-T02 | `src/game/deal.js`（配置・対象選定） | ✅（Nodeテスト） |
| K-T03 | `kioku/index.html`（盤面・記憶/対象提示・認定書・レベル選択・計器不要） | ✅ |
| K-T04 | `kioku/app.js` 記憶フロー | ✅（ブラウザ検証：記憶→CD→裏返し→対象→回答→正解） |
| K-T05 | 失敗時の全開示（KM-007） | ✅（全札公開＋対象を正解マーク） |
| K-T06 | Judge 拡張（クリア続行可） | ✅（continueAfterClear・Nodeテスト） |
| K-T07 | 認定書・レベル選択の組み込み | ✅（共有ビュー流用） |
| K-T08 | コエキット一覧(S-01)に2枚目 | ✅ |
| K-T09 | 実機確認（受入 K-a〜K-i・音の実機確認） | 🧪 発案者 |

**仮置き/音**: 絵＝A〜Iの文字（`card-letter`）。記憶提示のカウントダウン表示＋`playCountdownTick`、`playTimeUp`、正解`playCorrect`・不正解`playBlip(220)`（どうぶつめくり共通）。認識ログ(KR-03)は入れずに着手。
**注記**: `.card .front` はめくった時だけ表示（裏向きで文字を隠す）。ローカル検証中はペインのCSSキャッシュで一時的に裏の文字が見えたが、ファイルは正・本番（キャッシュバスター）で解消。

## 7. リスク
- **どうぶつめくりの回帰**が最大リスク。共有化後に `node scripts/test-logic.cjs` と、ブラウザでどうぶつめくりの盤面〜クリア・ルーレット・計測パネルを再確認する。
- board.js の前面差替でカードCSSが変わるため、どうぶつめくりの赤丸表示を新構造へ合わせる。
