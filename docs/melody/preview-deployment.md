# サエズリズム 技術試作のHTTPS仮公開

2026-09-27、発案者のスマホ・マイク検証用の依頼により、既存GitHub Pagesの独立した試作パスへ公開する。

- URL: https://koekit.sikumilab.com/probe/saezuri/
- 内容: ML-T01の音色比較・五線譜・4小節のハナウタ取り込み。作品保存や本アプリは未実装。
- 配信対象: `probe/saezuri/`、`saezuri/document.js`、ロゴ、小鳥PNG。共通CSS・フォント・マイク設定モジュールは既存公開版を使用。
- 検索除外用にnoindexを指定。アクセス制限ではなく、URLを知っている人は閲覧できる。
- 音声は端末内のAudioWorklet／Workerで解析する。外部への音声送信や録音ファイル保存はしない。
- 公開手順に従いSWのBUILDだけを更新する。試作はSWを登録せず、事前キャッシュにも追加しない。トップページからの導線は追加しない。
- 既存の未コミット作業は別チェックアウトで保護し、公開に含めない。

## スマホでの確認

更新版ML-T01-v3では準備カウントを2分音符×2→4分音符×4へ復元し、小節頭のアクセントと試聴中のカウントを追加。[v3の変更と実機データ](humming-v3.md)。v2の音高のならし・遅延補正は維持。記録のprototypeが`ML-T01-v3`であることを確認する。

1. 上記URLをChromeまたはSafariで直接開く。
2. 「3. ハナウタを取り込む」でマイクONを確認し、「カウントして取り込む」を押す。ブラウザのマイク許可に応じる。
3. 8拍のカウント後、4小節ぶんハナウタを歌う。必要に応じてイヤホンを使う。
4. 取り込み候補の譜面と「候補を聴く」で結果を確認する。「停止・中断」でいつでも止められる。
5. 機種・ブラウザ・イヤホン有無・ずれや誤検出を「実機条件・所感」へ追記し、「記録を表示」の内容を報告する。自動送信はしない。

解析窓などは比較用の未確定値。スマホでの実声品質、Q1〜Q3、本アプリの方式採用は、この仮公開だけでは承認済みにしない。

## 公開確認

### v2更新（2026-09-27）

- コミット`eef526ddf3e6003158c84f83a1c3e6a0f451e250`、[GitHub Pages実行36278195846](https://github.com/gerupon-lgtm/koekit/actions/runs/36278195846)成功。
- 公開16ファイルの200応答・内容一致、secure context、ブラウザエラー0を確認。
- 公開URLで150ms遅れの7音の合成波形→7音・先頭tick0・24カウント・終了後track解放を確認。
- 公開URLで既存のChrome検証も成功（マイクOFF・遅延許可後の停止・4画面サイズ・外部要求0）。ローカルの純粋処理テストは57件成功。
- 修正版でのPixel／Windows実声、スピーカー回り込み、Safari実機は発案者の再確認待ち。

### 初回公開

- 公開コミット: `42eb758282cf271c23dac2e13d40f338a4b5fcf4`。
- [GitHub Pages実行36262227115](https://github.com/gerupon-lgtm/koekit/actions/runs/36262227115): success。
- HTTPSで15ファイルが200応答し、公開用チェックアウトと内容一致。テキストのCRLF/LFは正規化し、PNGはバイト一致。
- Chrome・390×844でsecure context、getUserMedia、AudioWorklet利用可、譜面表示、JavaScriptエラー0を確認。
- 公開URLに対して既存ブラウザ検証も成功。模擬マイクの4小節捕捉（48kHz・256000標本）、停止・マイクOFF・候補確定、4画面サイズを確認し、外部要求0。模擬入力でありスマホ実声の品質確認ではない。
- 実機の実声検証は未実施。発案者が上記手順で行う。

### 追加のWebKit確認と限界

`node scripts/test-saezuri-webkit.cjs` で既存Playwright 1.63.0のWindows版WebKitを検査。localhostの譜面表示は成功、JavaScriptエラー0。実行結果は`PARTIAL`であり、音声の合格ではない。このエンジンでは`AudioContext`・`AudioWorkletNode`・`navigator.mediaDevices.getUserMedia`がいずれもundefinedのため、音声再生／捕捉を検証できない。

同エンジンによる公開HTTPSへのアクセスは証明書検証エラーで失敗。証明書チェックを無効化して合格扱いにはしていない。前記ChromeのHTTPS検証成功と分け、iPhone Safari実機での確認を残す。Windows版WebKitの不足をiPhone Safariの非対応とは解釈しない。
