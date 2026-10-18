# 他アプリへ共有：Web Audioの短い音欠けと再生設定の比較

2026-10-18／サエズリズムでの調査・Pixel 6aの本人確認に基づく。

## 最新の採用結果

全曲分の音を先に接続せず、約1秒先まで順次接続する方式にすると、同じ20ms指定のまま保持する発振器が264から36に減った。Pixel 6a／Chrome155で、本人から約10回音切れなしと報告。提供された統計1件（`2026-10-18T10:50:10.668Z`）も出力不足0回・正常終了、内部約21.33ms＋出力側56msだった。和の目安約77.33msは操作から耳までの直接測定ではない。声OFF、120 BPM・保存曲8小節・旋律28音・伴奏176イベント・全体200%の条件。

サエズリズムの通常の曲再生は数値 `latencyHint: 0.02`＋約1秒先の順次予約へ変更する。鍵盤・単音・ループ・録音は反応優先のinteractiveと同じ録音時計を維持する。比較URL `?audioLatency=20ms&audioSchedule=window` は通常URLと同じ。旧条件は `?audioLatency=playback&audioSchedule=phrase` で8小節以内を再現できる。約1秒を超える画面停止への耐性、iPhone・声ON・録音併用は引き続き確認する。

この結果は遅延設定だけでなく、先に接続している音の量も確認する根拠になる。音色・音符・余韻は維持し、事前合成は採用していない。原因の完全な特定や他アプリの推奨値の保証ではない。別ゲームの30ms採用は本人からの情報共有で、こちらでの検証結果や変更指示とは区別する。詳細と標準変更後の検証・公開状況は[調査記録](audio-dropout-20261018.md)を参照。

以下は比較の経過。既定値や未確認の記述は当時の状態で、現在の採用条件は上記を優先する。

**さらに更新**：声OFFの保存曲再生で数値20msも途切れた。内部約21.33ms＋出力側57ms、出力不足4回・計85.3ms。次は20msを維持し、全曲分の音声ノードを先に接続する方式から、約1秒先まで順次接続する比較 `?audioLatency=20ms&audioSchedule=window` を追加。PCでは先の未発音の音を接続するだけでも処理時間が増え、実際の予約処理の比較で発振器保持数248→34と、音データの最大差約0.000000835を確認した。音色・音符・余韻を変えない比較であり、実機の解消は未確認。短い先読みでは長い画面停止への耐性も確認する。詳細と「伴奏は安定重視／演奏は反応優先」の未採用の検討案は[最新の調査記録](audio-dropout-20261018.md)を参照。

**最新追記**：Pixelで数値10ms指定を試した結果は、内部約10.67ms＋出力側36ms、出力不足3回・合計32ms、本人の聴感は「途切れあり」。100msより小さい報告値だけでは安定性を満たさなかった。次は曲だけ数値20ms指定 `?audioLatency=20ms` を比較する。playbackでの先の良好な1件、10msでの途切れの1件を区別し、他アプリでも同じ結果になるとは扱わない。鍵盤・録音はinteractiveを維持。原因特定・解消・20msの実機成功は未確認。

## 先に伝えたいこと

ブラウザーの音声出力には、決められた時間までに次の音を用意する必要がある。音色が軽くても、瞬間的に間に合わなければ短い音欠けが起こる可能性がある。今回、音の準備に余裕を持たせる `latencyHint: 'playback'` を比較したところ、Pixel 6a／Chromeで、同じ曲の今回の再生は「途切れなし」と本人から報告された。

**改善の手掛かりであり、原因の確定や全条件での解決ではない。** 2オペFMだけに固有の対策ではなく、Web Audioで音を出すアプリの比較候補となる。音色・音符長・減衰・発音数は変えていない。事前合成への切替でもない。

追記：本人の指示により、サエズリズムでは有限の曲の試聴に `playback` を標準採用し、鍵盤・伴奏ループ・録音には `interactive` を維持する。さらに「音欠けを抑え、音が出るまで100ms以内」を努力目標として、曲だけ内部10msを希望する `?audioLatency=10ms`（数値 `0.01`）の比較を追加した。10msや100msの実機での達成は未確認。以下の表の「通常」は比較開始時点の旧設定を指す。

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

`baseLatency`と`outputLatency`は異なる区間の指標であり、鍵盤を押してから聞こえるまでを直接測った値ではない。和は旧設定で約24ms、比較設定で約288msの目安になる。内部を半分にしても出力側が半分になるとは限らない。比較設定の出力側の遅延は大きいため、曲の試聴と鍵盤演奏を同じ条件で採用しないこと。

通常設定の提供動画では19.44秒付近に約2.58msのほぼ無音の区間があり、8秒前の同じフレーズにはなかった。今回の統計には発生時刻がなく、計測範囲には再生前の無音待ちと余韻も含む。**統計の1回を「曲の途中に21.4ms途切れた」と読み替えない。** 本人の聴感と統計値を別々に残す。

同時発音の注意：`maxOscillators: 264` は将来の事前予約と余韻を含む保持数で、264発振器が同時に音を出していた意味ではない。CPU使用率も測っていない。

## 他アプリでまず試す変更

既存の `AudioContext` を作っている箇所で、比較用に生成時の指定を変える。追加の `AudioContext` を並べて作る例ではない。

```js
// 曲の試聴用の比較設定
const audioContext = new AudioContext({ latencyHint: 'playback' });

// 内部10msを希望する別の比較（上の生成行と置き換える）
// const audioContext = new AudioContext({ latencyHint: 0.01 });

// 10msで途切れた後の比較（同じく上の生成行と置き換える）
// const audioContext = new AudioContext({ latencyHint: 0.02 });

// 比較元：通常の即応性を優先する設定
// const audioContext = new AudioContext({ latencyHint: 'interactive' });
```

これはブラウザーへの希望値。実際に採用される遅延は端末・ブラウザーが決めるため、`baseLatency`と`outputLatency`も記録する。`latencyHint`は生成時の指定であり、使用中の設定だけをそのまま書き換える前提にしない。

鍵盤・タップ録音・ハナウタ・伴奏ループとの併用では、反応と録音位置も実機で確認する。一つの音声処理を共有するアプリで用途ごとに切り替える場合は、古い音源の停止、録音の終了、時刻の基準と予約の作り直しを設計してから行う。サエズリズムの今回の実装では、停止した境目で切り替え、同じ設定なら再利用し、使い終わった処理は閉じる。ループ演奏・録音の途中には切り替えない。古い処理の終了通知や準備完了で、新しい曲・鍵盤を誤停止しないことも確認する。

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
- 内部10msを希望する比較：<https://koekit.sikumilab.com/probe/saezuri/?audioLatency=10ms>
- 内部20msを希望する次の比較：<https://koekit.sikumilab.com/probe/saezuri/?audioLatency=20ms>
- 内部20ms・約1秒先まで順次接続する比較：<https://koekit.sikumilab.com/probe/saezuri/?audioLatency=20ms&audioSchedule=window>
- 旧設定との比較：<https://koekit.sikumilab.com/probe/saezuri/?audioLatency=interactive>
- 通常URL（現在は有限の試聴にplayback）：<https://koekit.sikumilab.com/probe/saezuri/>
- 診断部品：`probe/saezuri/playback-diagnostics.js`
- 組み込み例：`probe/saezuri/audio.js`、`probe/saezuri/app.js`
- テスト：`scripts/test-saezuri-playback-diagnostics.mjs`、`scripts/test-saezuri-output-diagnostics-browser.cjs`、`scripts/test-saezuri-latency-routing-browser.cjs`
- 詳細な調査記録：[Pixelの瞬間的な音欠け](audio-dropout-20261018.md)
- 最初の比較版の公開コミット：`7c9757747c7d10f9f630cbdf66abc50209794629`。その実機確認時のBUILDは `v0.1.0-20261018091246-9ef79c3`。用途別設定と10ms比較のBUILDは `v0.1.0-20261018095008-c27f217`。最新の検証・公開状況は上記調査記録を参照。
- 一次資料：[Web Audioの遅延要求](https://webaudio.github.io/web-audio-api/#dom-audiocontextoptions-latencyhint)、[再生統計](https://webaudio.github.io/web-audio-api/#AudioPlaybackStats)。

## 別アプリの実装担当へ渡す依頼文

> この資料を読み、既存の音源・演奏・録音を保持したまま、`latencyHint: 'playback'` の比較設定と再生単位の出力不足統計を追加して検証してください。まず曲の再生で比較し、鍵盤・リアルタイム録音への適用は応答遅延と録音位置を確認してから判断してください。サエズリズムの1件の良好な聴感報告を、このアプリでも解決済みという意味で扱わないでください。
