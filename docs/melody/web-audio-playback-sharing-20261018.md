# 他アプリへ共有：Web Audioの短い音欠けと再生設定の比較

2026-10-18／サエズリズムでの調査・Pixel 6aの本人確認に基づく。

## 先に伝えたいこと

ブラウザーの音声出力には、決められた時間までに次の音を用意する必要がある。音色が軽くても、瞬間的に間に合わなければ短い音欠けが起こる可能性がある。今回、音の準備に余裕を持たせる `latencyHint: 'playback'` を比較したところ、Pixel 6a／Chromeで、同じ曲の今回の再生は「途切れなし」と本人から報告された。

**改善の手掛かりであり、原因の確定や全条件での解決ではない。** 2オペFMだけに固有の対策ではなく、Web Audioで音を出すアプリの比較候補となる。音色・音符長・減衰・発音数は変えていない。事前合成への切替でもない。

## 実機で分かったこと

機種は本人申告のPixel 6a。提供記録のChromeは155、音声は48kHz。8小節、120 BPM、旋律28音、伴奏176イベント、カウント32発、全体音量200%で比較した。

| 項目 | 通常設定の不具合報告 | 今回の比較設定 |
|---|---|---|
| `latencyHint` | 既定の `interactive` | `playback` |
| `baseLatency`（内部処理の遅延） | 約2.67ms | 約21.33ms |
| `outputLatency`（出力側の遅延） | 21ms | 267ms |
| 本人の聞こえ方 | 瞬間的な歪み・途切れ。録画なしでも別の位置に出た | 今回の提供記録1件では「途切れなし」 |
| 出力不足のブラウザー統計 | 未計測 | 1回／合計約21.4ms |
| 再生終了 | 正常終了 | 正常終了 |

`baseLatency`と`outputLatency`は異なる指標であり、鍵盤を押してから聞こえるまでを直接測った値ではない。比較設定の出力側の遅延は大きいため、曲の試聴と鍵盤演奏を同じ条件で採用しないこと。

通常設定の提供動画では19.44秒付近に約2.58msのほぼ無音の区間があり、8秒前の同じフレーズにはなかった。今回の統計には発生時刻がなく、計測範囲には再生前の無音待ちと余韻も含む。**統計の1回を「曲の途中に21.4ms途切れた」と読み替えない。** 本人の聴感と統計値を別々に残す。

同時発音の注意：`maxOscillators: 264` は将来の事前予約と余韻を含む保持数で、264発振器が同時に音を出していた意味ではない。CPU使用率も測っていない。

## 他アプリでまず試す変更

既存の `AudioContext` を作っている箇所で、比較用に生成時の指定を変える。追加の `AudioContext` を並べて作る例ではない。

```js
// 曲の試聴用の比較設定
const audioContext = new AudioContext({ latencyHint: 'playback' });

// 比較元：通常の即応性を優先する設定
// const audioContext = new AudioContext({ latencyHint: 'interactive' });
```

これはブラウザーへの希望値。実際に採用される遅延は端末・ブラウザーが決めるため、`baseLatency`と`outputLatency`も記録する。`latencyHint`は生成時の指定であり、使用中の設定だけをそのまま書き換える前提にしない。

鍵盤・タップ録音・ハナウタ・伴奏ループとの併用では、反応と録音位置も実機で確認する。一つの音声処理を共有するアプリで用途ごとに切り替える場合は、古い音源の停止、録音の終了、時刻の基準と予約の作り直しを設計してから行う。今回はこの自動切替を本番へ採用したわけではない。

## 再生ごとの記録を取る最小例

以下はサエズリズムの診断部品と同じ処理。対応していないブラウザーや読み取り失敗を、出力不足0回と扱わない。音声データの保存・送信は不要。

```js
const counters = ['underrunEvents', 'underrunDuration', 'totalDuration'];

function readPlaybackStats(context) {
  try {
    const stats = context.playbackStats;
    if (!stats) return null;
    const result = Object.fromEntries(counters.map(key => [key, stats[key]]));
    return counters.every(key => Number.isFinite(result[key]) && result[key] >= 0)
      ? result : null;
  } catch {
    return null;
  }
}

function playbackStatsDelta(before, after) {
  if (!before || !after) return { status: 'unavailable' };
  if (counters.some(key => after[key] < before[key])) {
    return { status: 'counter-reset' };
  }
  return {
    status: 'measured',
    ...Object.fromEntries(counters.map(key => [key, after[key] - before[key]])),
  };
}

// 各再生を予約する直前に取得する。
const before = readPlaybackStats(audioContext);

// …既存の曲再生。音色・音符・音量は比較元とそろえる…

// 自然終了・手動停止の時点で、Contextを閉じる前に取得する。
const outputStats = playbackStatsDelta(before, readPlaybackStats(audioContext));
// outputStatsを既存の検証記録へ追加する。
```

`underrunEvents`は出力不足の報告回数、`underrunDuration`と`totalDuration`は秒。累積値の差を取り、その再生分だけを記録する。統計には更新間隔などの制限があり、0回でもあらゆる音欠けがなかった証明にはならない。描画の各フレームや音の合成処理に監視を入れず、まず開始／終了時の取得から試す。

## 別アプリ側の確認条件

- 同じ端末・曲・音色・音量・出力先で、通常設定と比較設定だけを変えて複数回聴く。各回の聴感、実際の遅延、出力不足の統計を対にする。
- 曲再生とリアルタイム入力を分けて評価する。音の高さ・長さ・余韻を変えたり、発音数を減らしたりする変更を同時に混ぜない。
- 未対応の統計は未計測として残す。Pixelでの今回の成功を、iPhone・別アプリ・長時間演奏の成功に広げない。

## 参照元と再利用先

- 公開した比較画面：<https://koekit.sikumilab.com/probe/saezuri/?audioLatency=playback>
- 比較元：<https://koekit.sikumilab.com/probe/saezuri/>
- 診断部品：`probe/saezuri/playback-diagnostics.js`
- 組み込み例：`probe/saezuri/audio.js`、`probe/saezuri/app.js`
- テスト：`scripts/test-saezuri-playback-diagnostics.mjs`、`scripts/test-saezuri-output-diagnostics-browser.cjs`
- 詳細な調査記録：[Pixelの瞬間的な音欠け](audio-dropout-20261018.md)
- 公開コミット：`7c9757747c7d10f9f630cbdf66abc50209794629`。比較版の実機確認時のBUILDは `v0.1.0-20261018091246-9ef79c3`。
- 一次資料：[Web Audioの遅延要求](https://webaudio.github.io/web-audio-api/#dom-audiocontextoptions-latencyhint)、[再生統計](https://webaudio.github.io/web-audio-api/#AudioPlaybackStats)。

## 別アプリの実装担当へ渡す依頼文

> この資料を読み、既存の音源・演奏・録音を保持したまま、`latencyHint: 'playback'` の比較設定と再生単位の出力不足統計を追加して検証してください。まず曲の再生で比較し、鍵盤・リアルタイム録音への適用は応答遅延と録音位置を確認してから判断してください。サエズリズムの1件の良好な聴感報告を、このアプリでも解決済みという意味で扱わないでください。
