# 実機判定手順書（フェーズ0の最初に行う）

対象端末: **Pixel 6a / Chrome**（副で iPhone XR / Safari も記録）。
判定はコードを書く前に行い、結果で T-006〜T-008 の方針が変わる。
**すべて `https://` で行う**（マイクと端末内認識はHTTPSまたはlocalhostが必須）。手軽なのは probe 一式を `koekit` リポジトリに置いて GitHub Pages で開く方法。

各判定の最後に「記録テンプレート」がある。埋めて `docs/tasks.md` の「検証済みの事実」へ転記する。

---

## 判定1（T-004）: Vosk がクロスオリジン分離を必要とするか

**なぜ測るか** — vosk-browser は WebWorker で WASM を動かす。WASMスレッドが `SharedArrayBuffer` を使う場合、ブラウザはクロスオリジン分離（`crossOriginIsolated === true`）を要求する。GitHub Pages はレスポンスヘッダを設定できないため、必要なら `mini-coi.js` を挟む必要があり、さらにモデル配信元に CORS/CORP 設定が要る。ここが後続の構成を左右する。

### 手順1-A: 素の状態を見る

`probe/coi.html` を GitHub Pages 経由で開き、画面に出る2値を記録する。

- `crossOriginIsolated` … 素のGitHub Pagesでは **false** のはず
- `SharedArrayBuffer available` … true か false か

### 手順1-B: mini-coi を挟んで見る

同じページを `?coi=1` 付きで開く（`probe/coi.html?coi=1`）。`mini-coi.js` が読み込まれ、初回は自動リロードが入る。リロード後に：

- `crossOriginIsolated` が **true** に変わるか
- `SharedArrayBuffer available` が true になるか

### 手順1-C: 実際に Vosk を動かして本当に必要か確かめる

`probe/vosk.html` を、まず **mini-coi なし**、次に **mini-coi あり（`?coi=1`）** で開く。「モデル読込」ボタンで小さな日本語モデルを読み、マイクで「みぎ」等を話す。

- mini-coi なしで認識まで動く → **分離は不要**。mini-coi を本番に入れない
- mini-coi なしは失敗し、ありで動く → **分離が必要**。mini-coi を本番に採用し、判定2Aへ進む前にモデル配信のCORSを設計に追加

> モデルは Vosk 公式の小型日本語モデル（`vosk-model-small-ja-*`）を使う。probe 段階では GitHub Pages 上（同一オリジン）に置いて分離要否だけを切り分け、配信元CORSの検証（判定1-D）と分ける。

### 手順1-D（1-Cで分離が必要だった場合のみ）: 別オリジン配信のCORS

モデルを別ホスティング（Cloudflare 等）に置き、`probe/vosk.html?model=<別オリジンのURL>&coi=1` で開く。

- 取得が成功し認識まで動く → 配信元のCORS/CORPが足りている
- Networkパネルに `blocked:NotSameOriginAfterDefaultedToSameOriginByCoep` → 配信元に `Cross-Origin-Resource-Policy: cross-origin`（または CORS の `Access-Control-Allow-Origin`）が必要。設定して再試行

### 記録テンプレート（判定1）

```
[T-004] 2026-__-__ Pixel 6a / Chrome __版
- 素:      crossOriginIsolated=___  SAB=___
- mini-coi: crossOriginIsolated=___  SAB=___
- Vosk mini-coiなし: 動いた / 失敗（____）
- Vosk mini-coiあり: 動いた / 失敗（____）
- 結論: 分離は【不要 / 必要】。→ mini-coiを【入れない / 入れる】
- （必要時）別オリジン配信CORS: OK / 要設定（____）
- モデル読込時間=__秒  / 概算メモリ=__MB（判定材料。T-008で再測）
```

---

## 判定2（T-007）: 方式B（端末内 Web Speech）が ja-JP で使えるか

**なぜ測るか** — 使えるならモデルの自前配布（48MB）が不要になり、方式Bが本命Cより有利になる。実験的機能で対応言語はブラウザ依存、かつChromeの版で挙動が揺れた経緯があるため、実機と版を固定して確かめる。

### 手順2-A: 可否を問い合わせる

`probe/webspeech.html` を開き、「B: 端末内の可否確認」を押す。内部で次を行う（結果を画面表示）：

1. `SpeechRecognition`（または `webkitSpeechRecognition`）が存在するか
2. 端末内モードの可否確認APIが存在するか（`SpeechRecognition.available?.({ langs:['ja-JP'], processLocally:true })` 相当）。**存在しない場合はこの時点で「B不可」**
3. 可否の戻り値（`available` / `downloadable` / `unavailable` など）

### 手順2-B: 言語リソースを導入して認識する

2-Aが `downloadable` 以上なら「B: 導入して認識」を押す。`install()` 相当でja-JPを入れ、`processLocally = true` で認識を開始。「ストップ」を話す。

- 認識結果が出る → **B可**。オフライン（機内モード）でも試して結果を残す
- APIが無い／例外 → **B不可**。方式Cを本命に据える

### 手順2-C: 版と日付を必ず残す

`chrome://version` の Chrome バージョンを記録。B可否はChromeの版で変わりうるため、版なしの結果は使えない。

### 記録テンプレート（判定2）

```
[T-007] 2026-__-__ Pixel 6a / Chrome __版
- SpeechRecognition 存在: yes / no
- 端末内 可否API 存在: yes / no
- ja-JP 可否: available / downloadable / unavailable / API無し
- 導入後の認識: 成功 / 失敗（____）
- オフラインでの認識: 成功 / 失敗 / 未試験
- 結論: 方式Bは【採用可 / 不可】。→ 本命は【B / C】
```

---

## 判定後の分岐（設計へ反映）

| 判定1 | 判定2 | 本番の方式 | mini-coi | モデル配信 |
|---|---|---|---|---|
| 分離不要 | B可 | **B**（Cは予備） | 不要 | 不要 |
| 分離不要 | B不可 | **C** | 不要 | 別オリジン（CORS任意） |
| 分離必要 | B可 | **B**（Cは予備） | 予備のCのみ必要 | Cを使う時だけCORS |
| 分離必要 | B不可 | **C** | **必要** | **別オリジンにCORS/CORP必須** |

**方式A（既定Web Speech）は本人の検証用に常に用意する。** 公開版では外す（要件C-1 / T-029）。

反映先: この結果で `docs/tasks.md` T-004/T-007/T-008 の状態、`implementation-guide.md` 4節の【想定】（モデル配信先）、`基本設計サマリ.md` 6節の【要確認】を更新する。
