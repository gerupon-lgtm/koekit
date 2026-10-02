# DX7II系ソフト音源の再利用調査

調査日: 2026-10-02（Asia/Tokyo）、試聴候補更新: 2026-10-03
対象: サエズリズムの再生用音源。音色編集UI・SysEx入出力UIは対象外。
状態: 採用検討。本アプリへの統合は未実施。2026-10-03の明示指示に基づき、独立した検証ページを公開した。

## 現時点の判断

**判断は「再生専用として条件付き採用可」。少数音色・少数パートからの試験導入を推奨する。** 既存の音符・コード・伴奏生成・保存を残し、発音部分に追加する構成が適する。実際の配布音源でNode検証とPCのChromeの旋律・和音・ベースの同時発音／即時停止が成功した。音色編集UIや新しいビルド工程は不要。

2026-10-03の発案者の指定により、MaribumbaとChoirは初期不採用。EbonyIvory・PianoBells・KnockRoad・BRASS 1・STRINGS 2を優先試聴する。5音色の比較用WAVを用意した段階で、採用音色はまだ未決。まず旋律・鍵盤の単音パート等から試し、スマホでの負荷・聴感・先頭／ループ／録音同期を確認して伴奏へ広げる。音楽のタイプを選んだだけで旧音色や保存曲を変更する採用は行わない。

提供Workletは予約時刻を受け取らないため、現行の150ms先行予約へ直接差し替えられない。音源bundleを使う小さな専用Workletにaudio clock基準の予約queue・取消・即時停止を加える設計が必要。全パートの常時FM化と、試聴ごとの曲全体事前合成は今回のPC実測では負荷／待ち時間が大きく、初期導入の既定動作には勧めない。公開する選定プリセットの配布条件も確認する。

本資料は同梱文書・実ソース・ローカル実測に基づく調査。2026-10-02の調査時にはFM音源・音色JSONをGitHubへ公開していない。2026-10-03、発案者の明示指示に基づき[独立した検証ページ](https://koekit.sikumilab.com/probe/fm-polyphony/)へruntime・3音色・修正したベース比較WAVを配置した。本アプリの発音部分への統合は未実施。

## 参照した一次資料

元の[引き継ぎ書](C:/Users/user/Documents/音源シミュレーター/docs/T-557_DX7IIソフト音源_BGM組込引継ぎ.md)。提供ZIPの展開先を以下の `P` とする。

`P = C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/`

| 根拠 | 確認する内容 |
|---|---|
| [README.md](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/README.md:153) | 演奏API、実装範囲、利用条件、同梱検証の限界 |
| [bgm-integration.ts](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/src/bgm-integration.ts:1) | export、Voice検証、offline譜面合成、mix検査 |
| [performance-audio-renderer.ts](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/src/application/performance-audio-renderer.ts:63) | mono発音、controller、enqueue、resampler、limiter |
| [fm-performance-worklet.ts](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/src/audio/fm-performance-worklet.ts:22) | 受信message、実時間processor、復旧 |
| [DEPENDENCIES.json](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/DEPENDENCIES.json:1) | Zod MIT、自作コード許諾未追加、factory配布未確認 |
| [factory-presets-inventory.md](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/reference-docs/factory-presets-inventory.md:1) | 原本の取得位置、復元用backupとしての用途、hash照合 |
| [現行audio.js](C:/Users/user/Documents/project/koekit/probe/saezuri/audio.js:1) | 素のWeb Audio発音、先行予約、ループ、停止 |

## 再生機能の適合

| 要素 | 提供実装 | サエズリズム側の対応 |
|---|---|---|
| MIDI音高・長さ | noteOn/noteOff、velocity 1〜127 | 既存midi/startTick/durationTickから変換できる |
| 同時発音 | 1rendererに1Voice、最大16音 | 和音の発音は可能。複数音色はパート別renderer |
| ピッチ・表現 | pitchBend、modulation、volume、expression、sustain、aftertouch | 通常の譜面再生には必須でない。将来拡張可能 |
| PCM出力 | renderのFloat64Array、renderIntoのFloat32/64Array、mono | AudioBufferまたはAudioWorkletから既存ミキサーへ接続可能 |
| 停止 | noteOff、allNotesOff、allSoundOff、reset | 通常離鍵と即時停止を区別できる。予約済みPCM／イベントの取消はホスト側 |
| テンポ・譜面・ループ | ホストの責務 | 既存曲データとtransportの音楽位置を再利用する |
| ドラム | 一般的なGM打楽器チャンネル管理なし | 現行kick/snare/hatの発音を継続する案が適する |
| パン・リバーブ・全体音量 | ホストの責務 | 現行melody/backing/masterのGainNodeを再利用する |
| 音色編集・機器接続 | ソースは同梱されるが発音にUI不要 | 採用範囲から外せる |

根拠: `P/src/application/performance-intent.ts`、`P/src/application/performance-audio-renderer.ts`、`P/README.md` 5〜7節。

同じrendererで同音高を重ねると既存slotが再triggerするため、同音を独立に重ねる必要があるパートは分ける（`P/src/dsp/voice-allocator.ts`、README 5節）。16音を超えるreleaseの重なりについて、voice stealingを含む聴感確認が必要。

## 時刻指定についての設計制約

現行 `ProbeTransport` は音楽時刻を `AudioContext.currentTime` と同じ秒単位で計算し、通常150ms先まで発音を予約する。`scheduleVoice` は `OscillatorNode.start(time)`、Gainの時刻指定を使う。一方、提供Workletのmessageは `configure`、`intents`、`reset` だけで、`intents` の `timingId` は診断用IDである。予約時刻ではない。rendererのenqueueはイベントを全て `sampleOffset: 0` でpendingへ追加する。

したがって、現行pumpから150ms先の音符をそのままWorkletへpostMessageすると、予約時刻を待たず次の発音blockへ渡る。選択肢は次の2つ。

1. 曲／フレーズをWorkerで事前PCM合成し、AudioBufferSourceの時刻指定で再生する。最初の導入は既存のaudio clockを保ちやすい。ただし生成待ち、キャッシュ、録音中の音符差し替え、余韻を含むループ継ぎ目を設計する必要がある。
2. Workletへaudio clock基準のイベント予約queueを追加する。鍵盤の生演奏も同じ音色で鳴らせるが、processor側の予約・取消・停止・voice区分の実装と、スマホのCPU実測が必要。

`renderSequence` はoffline用の秒指定イベントを受けるが、64 source-frameのresampler先読みは残る。sample単位の厳密な発音時刻を保証するAPIではない。音符列を短い断片ごとにrendererを作り直すとEG・位相・余韻が切れるため、フレーズ／パートの合成中は同一rendererを維持する。

根拠: [現行先行予約](C:/Users/user/Documents/project/koekit/probe/saezuri/audio.js:62)、[即時pending登録](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/src/application/performance-audio-renderer.ts:95)、[Worklet受信](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/src/audio/fm-performance-worklet.ts:70)、[offline実装](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/src/bgm-integration.ts:39)。

## 同梱ファイルを全部配る必要はない

コエキットへビルド工程を導入せず、提供されたビルド済みES moduleを使える。実行用bundleにはZodも含まれており、React・Vite・npm installは不要。以下のbyte数は今回の展開物を測定した値で、圧縮転送量ではない。

| 導入方式 | 実行に必要な提供物 | 現在の大きさ |
|---|---|---|
| Workerで事前合成 | `runtime/fmopelab-dx7ii.mjs`、選定Voice JSON、Zod MIT文面 | bundle 708,181byte＋各JSON約10.8kB |
| 提供Workletを直接使用 | `runtime/fm-performance-worklet.mjs`、選定Voice JSON、Zod MIT文面 | bundle 687,071byte＋各JSON約10.8kB |
| 完成音声だけを配信 | 用途に合わせ生成した音声ファイル | 音源JS・Voiceは端末に不要。ただし自由作曲の譜面差し替えには別途合成が必要 |

ホストadapter／Workerは利用先が追加する。2つのbundleは独立したbundleなので、一方の経路だけを使う場合に両方を配る必要はない。リアルタイムとofflineを併用する場合には両方を検討する。

`src/`、ビルド設定、全768音色catalog、原本SysEx、VCED、参考資料、サンプルWAV、検証記録、source mapは発音の実行依存ではない。原本・ソース・hashは内部の追跡資産として残せる。source mapには元ソースを含むため、配布対象から外す場合は末尾sourceMappingURLの扱いも決める。

Voice JSONはmetadataやSysEx再変換用の155値も含む。再生は `voice` オブジェクトで行うため、公開用に選定Voice＋id／版だけの小さなmanifestを別途生成する選択肢がある。これは必要なら追加する加工であり、今回の提供物を改変したものはまだ作っていない。

根拠: [bundle作成設定](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/scripts/build.mjs:1)、[export入口](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/src/bgm-integration.ts:1)、`P/runtime/`の実ファイル、`P/presets/voices/*.json`。

## 現在の試聴候補（2026-10-03指定）

| 正式音色名 | 提供物の正式ID | 現状 |
|---|---|---|
| EbonyIvory | `dx7ii-dx7iifdvoice32-s09` | 発案者指定・比較WAV作成済み |
| PianoBells | `dx7ii-dx7iifdvoice32-s15` | 発案者指定・比較WAV作成済み |
| KnockRoad | `dx7ii-dx7iifdvoice64-s18` | 発案者指定・比較WAV作成済み |
| BRASS 1（原本名 `BRASS   1`） | `dx7-rom1a-s01` | 発案者指定・比較WAV作成済み |
| STRINGS 2 | `dx7-rom1a-s05` | 発案者指定・比較WAV作成済み |

指定名の「EbonyIvoly」「pianobells」と、指定の `rom1a-s01`／`rom1a-s05` は上記の正式名／IDへ照合した。5件とも `status: ready` で、Voice検証成功。試聴候補としての指定であり、本採用やアプリへの組み込みは未実施。

**初期不採用**：Maribumba / `dx7ii-dx7iifdvoice32-s13`、Choir / `dx7ii-dx7iifdvoice64-s05`。2026-10-02の技術実測に含まれるMaribumbaは過去の検証用音色で、現在の初期候補を表さない。前回提案のFullTines・SuperBass・VibraPhone・Warm Stg Aは、今回の指定では採否変更なし。

比較音源の条件・各WAVは[5音色の試聴記録](dx7ii-audition-20261003.md)に記載。元の音源・Voiceは変更していない。

伴奏で使う際は、発案者の2026-10-03の意向により、比較用velocity 100より控えめを基本とする。具体値は音色ごとの和音・ベースの試聴で決める。ベロシティによる音色変化と既存の伴奏音量調整を分け、アクセントを保つ。比較WAVは従来のvelocity 100固定のまま。

同日、SuperBassが硬いという指摘に対応し、[柔らかいベースを探す4候補とSuperBassの比較WAV](dx7ii-soft-bass-20261003.md)を追加。最初のC2〜G2は低すぎるという指摘を受け、C3〜G3へ1oct上げて再生成した。採用は未決。[スマホ同時発音の検証ページ・手順](dx7ii-mobile-polyphony-20261003.md)も用意。対象はPixel 6a／ChromeとiPhone XR／Chromeで、実機上限はまだ未測定。PCでは余韻が重なる条件で負荷が増えたため、保持音数だけで決めない。

根拠：発案者の2026-10-03指定、`P/presets/catalog.json`、`P/presets/voices/<上記ID>.json`。

## DX7II再現として期待できる範囲

6オペレータ、32 algorithm、基本EG、鍵盤／velocity scaling、feedback、LFO、ratio/fixed周波数等はDSPに実装される。内部rateは49,096Hzで、出力rateへresampleする。AMEMの拡張は一部実装に限られ、portamento、unison、random pitch、EG bias等の全面再現ではない。

提供factory24bankはVMEMのみ。AMEMを含まず、128のDX7II候補にもextensionはない。基本AMSを維持するため、利用先で `createInitialDx7iiExtension()` を無条件に足さない。AMEM未実装機能は単純な譜面再生の障害になりにくいが、DX7IIFD実機との全音響一致を保証する採用理由にはしない。

WAV helperは24bit monoかつ48/96kHz。PCM生成をAudioBufferへ接続する場合はそのwriter制約を受けず、stereo/panはホストで扱える。各rendererの出力制御が0.98を目標としても、複数パートの合算後のclipは別問題。現行の伴奏／カウント／全体音量を合わせて調整する。

根拠: `P/README.md` 4・6・8節、`P/src/dsp/engine.ts`、`P/src/application/performance-audio-renderer.ts:260`。

## 配布条件について確認できた事実

`DEPENDENCIES.json` は自作applicationについて `privateProject: true`、`licenseGrantAdded: false`、factoryAssetsについて `publicRedistributionPermissionEstablished: false` と明示する。`package.json` も `private: true` であり、公開用license欄はない。READMEは、新しいコード許諾を付与しておらず、factoryデータの一般公開／再配布許諾を確認した資料ではないと述べる。

同梱licenseはZodのMIT文面1つ。この部分は著作権表示・許諾文面を配布物へ残す条件を確認できるが、ZodのMITを自作DSPやfactoryデータの許諾へ拡張しない。

factory台帳は、利用者workspaceの `DX/FactoryPresets/` が復元用backup・テスト照合用資産であり、既存bankとのhash一致等を記録する。配布元ZIPとの一致検査は記載されるが、公開再配布の許諾書・配布条件URL・権利者による許諾範囲を示す記録は見当たらない。原本の整合性と配布許諾は別の確認事項である。

資料の `licenseGrantAdded: false` だけを根拠に、発案者の自作コード再利用を拒むことはしない。本件の指示に基づきローカル評価を実施した。実装・公開へ進む際は音源コードの権利者・利用範囲と、別資産である選定factory Voiceデータの公開配布条件を区別する。factoryデータの許諾資料がなければ、利用条件が明確な自作Voiceへ置き換える案がある。完成WAVだけを配る場合も、利用条件が本資料で確認できたとは扱わない。本節は提供物にある記録の確認結果で、一般的な著作権上の可否の断定ではない。

根拠: [依存・許諾の宣言](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/DEPENDENCIES.json:1)、[READMEの留保](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/README.md:293)、[Zod MIT](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/licenses/Zod-MIT.txt:1)、[資産用途](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/reference-docs/factory-presets-inventory.md:1)。

## 実測・後続判断

2026-10-02、Windows PC／Node v24.18.0／48kHzで実測。ブラウザはPCのChrome。スマホ実機やVosk・ハナウタ解析との同時負荷を測った結果ではない。

| 検証 | 結果 | 判断への影響 |
|---|---|---|
| 配布物の整合性 | manifest対象1,636ファイルのbyte数・SHA-256一致 | 展開時の改変・欠損なし |
| 同梱 `examples/verify.mjs` | 有効761音色・VCED往復761件、除外7件、DX7II128音色発音、bank24／元source41 hash、異常入力・sustain・resetが成功 | 提供時の検証を受け取り側でも再実行できた |
| PC Chromeの実Worklet | マレット旋律1音＋エレピ和音4音＋ベース1音を3node同時に発音、全パート非無音、全音停止後は約1.49e-9以下、診断／JSエラー0 | 発音・既存GainNodeへの接続・停止の技術的入口は成立 |
| Node：エレピ1／4／8／16音 | 2秒の合成に約0.20／0.51／0.93／1.80秒 | 音数に伴うCPU増加が大きい |
| Node：16音時の128frame処理 | p95約3.28ms、最大約4.15ms（48kHzの128frame相当時間は約2.67ms） | PCの同期関数ベンチでも余裕が小さい。ブラウザでの音切れを実測した値ではないが、スマホ全面採用の根拠にはできない |
| 制作フレーズの事前合成 | 下記の3パート、4小節120BPM＝8秒＋余韻2秒に約5.03秒、8小節＝16秒＋余韻2秒に約8.26秒 | 試聴のたびに全曲を生成する方式は待ちが長い。Worker化だけでは計算量は減らない |
| 合成PCM | 4小節peak約0.314、8小節も同値、全sample有限。mono Float32で1.92MB／3.456MB | 複数音色の混合は可能。別々の音量操作には旋律・伴奏のbufferを分ける必要がある |
| 秒指定のoffline API | 44.1／48kHzで125ms指定の最初の有効sampleは約125.147／125.146ms、指定前の音なし | この音色・条件での観測。任意Voiceのsample精度・ハードウェア遅延の保証ではない |

事前合成には実際の `accompanimentEvents()`（Am／ロック・はやい・かっこいい）の和音・ベースを使い、エレピとSuperBassで鳴らした。旋律はMaribumbaの動作確認用音列（2026-10-03に初期不採用とした音色。以下の実測は過去の検証記録として保持）。ドラムは除外。gainは和音0.12／ベース0.10／旋律0.15。人間向けの完成編曲や現行音色との音量合わせをした比較ではない。4小節の和音52音・ベース32音、8小節の和音104音・ベース64音で、保持中の同音高衝突はこの2ケースでは0。離鍵後の余韻はポリ数に加算され得る。

記録は[測定JSON](C:/Users/user/Documents/project/koekit/docs/melody/dx7ii-reuse-measurements.json)。再現用の[Nodeベンチ](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/review-bench.mjs)と[ブラウザ検証](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/review-browser.cjs)は隔離した調査フォルダに置いた。[10秒の動作確認WAV](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/fm-saezuri-review.wav)も生成した。

bundleのgzip相当は約112kB（汎用音源）／108kB（提供Worklet）。これはローカル圧縮の参考値で、実際の配信サイズ測定ではない。初期導入は数個のVoiceだけを選び、全10.6MBのZIPを公開・読み込みする必要はない。

## 導入前に残る確認と推奨手順

1. 2026-10-03指定の5音色を試聴し、採用候補を絞る。音色データの公開条件または自作Voiceの採用方針を決める。
2. ビルド済み `fmopelab-dx7ii.mjs` を小さな専用Workletから使う。まず1パートを対象に、音高・velocity・開始frame・離鍵frame・全音停止・世代IDによる予約取消を既存audio clockへ接続する。ポリ数はスマホの実測に基づいて決める。提供Workletの最大16固定設定をそのまま全パートへ拡大しない。
3. 現行のメロディー／伴奏／カウント／全体音量の経路を維持する。カウントとドラムは既存音源を継続し、録音入力・保存・2段階確定の処理は再利用する。再生・マイク準備の完了後に共通anchorを決め、先頭1音目を予約し、録音待機は次の先頭へ接続する。
4. スマホでVoskの限定受付・ハナウタ録音・鍵盤の長押しを同時に使い、遅延・CPU・停止・譜面追従を確認する。録音で得たmidi／tickデータに音源固有のDSP状態を混ぜない。
5. 同音反復、同音高の重なり、離鍵後の余韻、4／8小節の周回を検証する。同音高をrenderer内で重ねる時はnoteOffが別の同音を消さないよう、音を分けるか重複管理が必要。PCM方式では余韻を含むbufferの単純な切り詰めループを避け、周期ごとの先頭と前周期の余韻を重ねる等の設計が必要。
6. 選定VoiceのID・音源版・hashを保存データで追跡し、既存のpiano／wood／soft等を新FM音色へ無断で置き換えない。音源の読込失敗時はタッチ操作と既存音源を利用できる状態を保つ。

負荷を優先する場合は、この音源で音階別サンプルを事前生成し、端末ではAudioBufferとして再生する代案もある。曲全体を固定WAVにする方式と区別し、可変の音高・長さ・長押し・離鍵音を扱うためのattack／sustain／release等を設計する。固定9秒の同梱試聴WAVをそのまま鍵盤素材として流用する案ではない。

これらは採用の提案と残る受入事項であり、今回サエズリズムへ実装した機能ではない。

Web Audio側の根拠：AudioWorkletは音声render threadでblockごとに呼ばれるため、各block内の処理時間に余裕が必要。PCM再生を選ぶ場合は `AudioBufferSourceNode.start(when)` が同じAudioContext時刻で開始を予約できる。[MDN：AudioWorkletProcessor.process](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process)、[MDN：AudioBufferSourceNode.start](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start)。
