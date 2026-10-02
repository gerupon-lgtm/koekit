# DX7II系音源：スマホでの同時発音の確認

2026-10-03。発案者指定の対象端末は **Pixel 6a／Chrome、iPhone XR／Chrome**。この環境から両端末を操作できず、スマホでの上限は未測定。PCや画面サイズのエミュレーションの測定をスマホの実測として扱わない。

**GitHub Pages公開への変更**：発案者の「githubへアップしてアクセスできるように」という明示指示に従い、公開先を[FM検証ページ](https://koekit.sikumilab.com/probe/fm-polyphony/)とした。両端末からHTTPSで直接開く。ベースをC3へ上げ、和音をド・ミ・ソの積み重ねへ変更。「ベース音色を聴きくらべる」にはC3〜G3で作り直した6件の比較WAVを置く。停止・切替・画面非表示は同じ停止処理を使う。本アプリへのFM統合は未実施。

## 用意した検証

[現在の公開用ソース](C:/Users/user/Documents/project/koekit/probe/fm-polyphony/index.html)、[操作・条件](C:/Users/user/Documents/project/koekit/probe/fm-polyphony/README.md)。原本音源を3音色に絞り、アプリとは独立した試験ページへ配置する。トップからのリンク・SWの事前キャッシュは追加しない。runtime・Voice・Zod表示を同梱し、提供全ZIP・SysEx・全catalog・source mapsは公開対象外。

[公開前のローカル検証用ZIP](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/fm-mobile-polyphony-20261003.zip)は旧C2条件の過去の12ファイル。現在のスマホ確認は上記HTTPSページを使う。過去のPC測定JSON・スクリーンショットは公開用ページには含めない。

- 処理時間：1／2／4／6／8／12／16音を各2秒、Dedicated Workerで実際のFM rendererに合成させる。平均・p95を音声frameの時間と比較する。
- 実際の発音：同じ音源を端末のAudioWorkletで12秒鳴らす。完成済みWAVの再生ではない。音切れ・プチプチ音・リズムの乱れの有無を聴いて記録する。
- 条件：「1音色」「旋律・和音・ベースの3音色」×「保持」「短く繰り返す」。余韻が重なる条件も比較する。
- 3音色の選択：EbonyIvory、PianoBells、SmoohBass。柔らかいベースの候補SmoohBassは試験用の仮選択で、本採用は未決。velocity 70・gain 0.08共通。表示音数は保持中の音数で、余韻の数とは異なる。
- 記録：機種名・User-Agent・sampleRate・条件・処理時間・PCM情報・本人による聴感をJSONとして端末へ保存する。通信による結果・音声の送信はない。

処理時間はWorkerの参考値で、AudioWorkletでのdeadline missやスピーカー出力の音切れ数を測ったものではない。PCMが非無音でも途切れなしとは判断しない。正式な上限は実機の聴感と、音声認識／ハナウタ／譜面／ドラムの併用・発熱を含む追加受入で決める。CPU p95を音声時間の50%以下にするのは余裕の仮目安で、発案者と確定した受入数値ではない。

## PC Chromeで確認できたこと

以下の表は公開前のベースC2・半音列条件で測った参考値。公開版のC3・ドミソ条件の測定値ではない。公開版は別の検証スクリプト・結果記録を用いる。

48kHz。CPU4条件×7音数＝28測定、実際のAudioWorkletは3音色2／6／16音の保持、6／16音の繰り返し、1音色16音の計6ケースを各2秒検証した。全ケースで予定frame数・有限非無音PCM・非クリップを確認。聴感欄は未評価のままで、自動的な「途切れなし」判定はしていない。

手動停止・画面非表示による停止・Worker取消・結果保存、320／390／844pxの横はみ出しなし・停止中央・ボタン間隔8px以上、JavaScriptエラー0も確認した。画面非表示イベントはPCの自動検証で模擬したもの。

| 3音色で保持する音数 | Worker平均／音声時間 | Worker p95／音声時間 |
|---:|---:|---:|
| 2 | 22% | 38% |
| 4 | 40% | 56% |
| 6 | 45% | 64% |
| 8 | 53% | 79% |
| 12 | 68% | 94% |
| 16 | 100% | 150% |

余韻を重ねる繰り返しは6音で平均71%／p95 105%。表は128frame単位でイベント境界の処理をまとめて測った最終検証のPC参考値。条件・その時の負荷によるばらつきがあり、6音の実機音切れを観測したという意味ではない。**PCでも余韻を含む処理の余裕を確認する必要があり、スマホを16音と決め打ちできない**ことを示す参考とする。2026-10-02のNode測定とは音色・velocity・実行環境が違う。

[PC測定JSON](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/mobile-polyphony/desktop-result.json)、[Chrome検証スクリプト](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/test-mobile-polyphony.cjs)、[原本コピー・hash記録](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/mobile-polyphony/asset-manifest.json)。ブラウザ検証はリポジトリrootのlocalhost:8018サーバーから実行する。

## 残る実機確認

両端末のOS／Chrome版、通常12秒試聴を同条件で再実行し、発音数の境界と余裕を記録する。最終的に連続使用と制作機能併用を確認し、端末ごとの値と全体の既定上限を区別する。重い音色や長いreleaseだけを増やした条件も追加する。

AudioWorkletは[secure contextで利用する](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/audioWorklet)ため、両端末は公開したHTTPSページから測定する。ローカル開発が必要な場合にはPixelで[Chrome公式のUSB port forwarding](https://developer.chrome.com/docs/devtools/remote-debugging/local-server)を使える。iOS Chromeの[WKWebView実装](https://chromium.googlesource.com/chromium/src/+/main/ios/web)はAndroidと異なるため、片方の合格を両方の合格とみなさない。
