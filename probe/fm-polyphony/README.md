# FM音源・同時発音の検証ページ

公開URL（2026-10-03の発案者の公開指示に基づく）: https://koekit.sikumilab.com/probe/fm-polyphony/

Pixel 6a／Chrome、iPhone XR／Chromeから直接開く。機種名を入力し、まず4音または6音で「この音数を聴く」、聴感を記録する。「音を保つ」と「短く繰り返す」の両方を比較し、1／2／4／6／8／12／16音で余裕を確認する。機種別に「結果を保存（JSON）」を使う。

「処理時間を測る」はDedicated Workerの参考測定。「この音数を聴く」は同じ音源のAudioWorkletで端末上にリアルタイム合成する。音切れの有無は利用者が聴いて記録する。WorkerのCPU比率・PCMの非無音は実音の途切れなしの証明ではない。マイク・Vosk・ハナウタ・譜面・ドラムの同時負荷は含まない。

「ベース音色を聴きくらべる」に、C3 → E3 → G3（MIDI48／52／55）へ上げた比較WAVを置く。4候補と基準SuperBassはvelocity70、SuperBass45は別条件の参考。各1秒保持＋1秒余韻、6秒、48kHz・24bit・mono、gain0.5共通。WAV再生はFM合成負荷の測定対象外。

負荷試験はvelocity70・gain0.08、旋律72、ベース48、和音は48からド・ミ・ソをオクターブで積む。16音を超える余韻はパートごとのrenderer最大16slotで元音源のvoice stealingに従う。公開前のローカル試験はベース36と半音列で測った過去の条件であり、この公開版の測定値と混同しない。

停止は全機能で同じ中央の「■ とめる」。別のベース候補を押すと切り替わる。画面非表示ではWAV・Worker・AudioWorkletを停止する。データ／音声の外部送信、SW登録、トップからのリンクは追加しない。noindexはアクセス制限ではない。

`runtime/fmopelab-dx7ii.mjs`・3件のVoiceは提供物をそのまま配置し、ZodのMIT表示を`licenses/Zod-MIT.txt`へ同梱。原本のbank、Voice ID、hashは`asset-manifest.json`、修正WAVの条件・hashは`samples/index.json`に記録する。提供物全ZIP／元SysEx／全catalog／source mapsは配置しない。音色の本採用は未決。
