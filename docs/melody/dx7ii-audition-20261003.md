# DX7II系音源：指定5音色の試聴

2026-10-03。発案者指定の5音色をローカルWAVに合成した。アプリへの組み込み・公開・音色の本採用は未実施。

Maribumba（`dx7ii-dx7iifdvoice32-s13`）とChoir（`dx7ii-dx7iifdvoice64-s05`）は初期不採用。

## 比較条件

全音色でA3 → C4 → E4（ラ・ド・ミ、MIDI 57／60／64）。各音を2秒保持し、離鍵後2秒の余韻を収録する。開始は0／4／8秒、全長12秒。48kHz・24bit・mono、velocity 100、共通の線形gain 0.5、最大4voice。音色ごとの音量正規化や追加エフェクトは行わない。聴感上の音量は音色によって異なる。

離鍵後の余韻を2秒で区切った比較用音源で、ループ素材ではない。音源内部の出力制御は元の実装のまま。

## 伴奏での使用方針（2026-10-03）

発案者の意向により、伴奏で使う際は今回の比較用velocity 100より控えめを基本とする。具体的な値は未確定で、音色ごとに和音・ベースを試聴して調整する。ベロシティによる音色変化と、既存の伴奏音量によるバランス調整を分けて扱い、伴奏のアクセントも保つ。この方針は後続の導入・試聴に適用するもので、上記比較WAVの生成条件は変更していない。

## 音源

| 正式名 | ID | WAV |
|---|---|---|
| EbonyIvory | `dx7ii-dx7iifdvoice32-s09` | [試聴](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/selected-voices-20261003/dx7ii-dx7iifdvoice32-s09.wav) |
| PianoBells | `dx7ii-dx7iifdvoice32-s15` | [試聴](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/selected-voices-20261003/dx7ii-dx7iifdvoice32-s15.wav) |
| KnockRoad | `dx7ii-dx7iifdvoice64-s18` | [試聴](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/selected-voices-20261003/dx7ii-dx7iifdvoice64-s18.wav) |
| BRASS 1 | `dx7-rom1a-s01` | [試聴](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/selected-voices-20261003/dx7-rom1a-s01.wav) |
| STRINGS 2 | `dx7-rom1a-s05` | [試聴](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/selected-voices-20261003/dx7-rom1a-s05.wav) |

「EbonyIvoly」「pianobells」は上記正式名へ、指定の `rom1a-s01`／`rom1a-s05` は提供物の `dx7-` 接頭辞付きIDへ照合した。

## 確認結果・再現

5件ともready、Voice検証成功。各音の保持区間が非無音、全PCM値が有限、共通gain適用後のpeakは約0.271〜0.490でWAV書き出し時のクリップなし。各WAVは576,000frame／1,728,044byteで、RIFF/WAVE・48kHz・mono・24bit・データ長の検査成功。音色の聴感評価・本採用は発案者の試聴後に決める。

[生成スクリプト](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/selected-voice-audition.mjs)をコエキットのルートから `node .local-tools/fmopelab-dx7ii-review-20261002/selected-voice-audition.mjs` で実行する。出力先はローカル調査フォルダ内に限定。元の提供Voice・DSP・アプリは変更しない。

[音源manifest](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/selected-voices-20261003/index.json)に生成条件・原本bank／slot・Voice JSONとWAVのSHA-256・peak／RMS・各音のpeakを記録した。[再利用調査](dx7ii-reuse-review.md)の2026-10-02実測とは条件が異なる。
