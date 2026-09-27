# ハナウタ試作v6 — 歌い出しの半音ずれと調号

2026-09-27。発案者が「F♯を頭から発音しているつもり」と明言。冒頭G→F♯は別々の音やレガート指定ではなく、一つのF♯の長音が期待値。さらに旋律全体からの調号推定と、ボタンでの切替を指示。

## 歌い出し

「長音を保つ」かつならしONで、連続して音高を検出できた区間の最初だけ、短い半音ずれを後続の長音へまとめる。初音300ms以下、次音300ms以上かつ初音の1.5倍以上、差がちょうど半音の場合に限る。次音の平均から丸めた音高を初音にも適用する。上下両方向を対象とし、F♯に固定する処理ではない。

無音や不明区間を跨がず、長い先行音・大きな跳躍をまとめない。意図した短い半音の歌い分けも同条件ならまとまるため、「細かい変化も拾う」またはならしOFFを比較用に残し、画面で説明する。自動的な意図判定ではなく長音向けの試案である。

先頭休符は既存の「頭の休符を詰める」で明示的に補正する。Gがtick1から2tick、F♯がtick3から4tickという形の模擬フレームは、F♯一音・tick1から6tickへまとまり、頭詰め後はtick0から6tickになる。提供された実機ログの波形はないため、同じ実声の再解析ではない。

`capture.onsetCorrections`に補正した元区間の秒数・変更前後MIDIを記録。これは頭詰め前の解析時間軸であり、頭詰め後の音符は`captureCandidate`で確認する。

## 調号とボタン

- 全音符の音高・長さを使い、音階内に含まれる長さの割合を優先し、主音／終音の支持と調号数を補助に15種類の調号を順位付けする。独自の比較用推定であり、調性の確定や転調分析ではない。
- 同じ調号を使う長調／短調は併記する。3種類未満の音高、または候補音階の被覆率が80%未満なら未推定とし、調号なしで表示する。近い候補がある場合は別の可能性も表示。
- 主譜面と取り込み候補それぞれに「♭側へ」「♯側へ」「自動推定に戻す」を設置。♭7個〜♯7個を切り替え、端では該当ボタンを無効化。操作中・録音中・再生中は切替不可。候補の調号は主譜面から独立し、採用時に引き継ぐ。
- 各段のト音記号の後に調号を描画。調号に沿った異名同音の綴り、必要な♮／♯／♭、小節での臨時記号リセット、段を跨ぐタイの臨時記号を扱う。C♭／B♯のオクターブも補正。
- ボタンは譜面の表示だけを変える。MIDI・開始位置・長さ・再生音を変更しない。診断の`scoreSignatures`に手動／推定と調号数を記録。

Windowsで提供された7音の例ではB長調／G♯短調（♯5）が第一候補となり、E長調／C♯短調なども候補になる。正答の判定とは扱わない。

表記の参照：[LilyPond公式・Displaying pitches](https://lilypond.org/doc/v2.26/Documentation/notation/displaying-pitches)。ライブラリやコードの追加採用ではなく、素のSVG実装を維持する。

## 検証

```powershell
$env:TZ='UTC'
node --test scripts/test-saezuri-sustain.mjs scripts/test-saezuri-key-signature.mjs scripts/test-saezuri-humming.mjs scripts/test-saezuri-capture-timing.mjs scripts/test-saezuri-boundaries.mjs scripts/test-saezuri-logic.mjs
node scripts/test-saezuri-score-browser.cjs
node scripts/test-saezuri-humming-browser.cjs
node scripts/test-saezuri-probe-browser.cjs
node scripts/check-version.cjs
```

Node67件成功。歌い出しの再現フレーム／波形、従来のビブラート・半音変更・大きな跳躍・休符保持、15調号、異名同音のMIDI一致を確認。譜面専用Chrome検証でボタンの境界・自動復帰・MIDI保持、調号／臨時記号・段跨ぎのタイを確認。実WorkerでG→F♯が一音にまとまり補正履歴が返ること、従来の遅延7音捕捉が7音のまま残ることを確認。実声の品質は引き続き再確認が必要。

公開状態は[HTTPS公開記録](preview-deployment.md)を参照。
