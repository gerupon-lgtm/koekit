# DX7II系音源：柔らかいベースを探す比較試聴

2026-10-03。SuperBassの硬さについての発案者の指摘を受け、提供物内の別ベース4件と、同じ条件のSuperBassをローカルWAVへ合成した。初期採用を確定するための比較素材で、本アプリへの組み込み・本採用は未実施。発案者の指示に基づき修正版WAVを検証ページへ公開した。

**音域修正**：発案者から「低すぎる」と指摘があり、最初のC2〜G2から1オクターブ上のC3〜G3で6件を作り直した。音高以外の比較条件は同じ。元のC2版は過去の検証記録としてローカルに保持する。修正版は[検証ページのベース試聴](https://koekit.sikumilab.com/probe/fm-polyphony/#bass-samples)にも配置した。

## 候補と原本

提供物の[音色catalog](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/presets/catalog.json)から、名前が滑らかさを示唆するもの、弦・フレットレス・ウッド系のものを選んだ。名前だけで音の柔らかさは断定しない。発案者による聴感確認はこれから行う。

| 音色 | ID | 原本bank／slot | 選んだ理由 | WAV |
|---|---|---|---|---|
| SmoohBass | `dx7ii-dx7iifdvoice32b-s02` | dx7iifdvoice32b.syx／2 | 滑らかなベースの候補。表記は提供物のまま | [velocity 70](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/soft-bass-c3-20261003/dx7ii-dx7iifdvoice32b-s02-v70.wav) |
| StringBass | `dx7ii-dx7iifdvoice32-s27` | dx7iifdvoice32.syx／27 | 弦系ベースの候補 | [velocity 70](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/soft-bass-c3-20261003/dx7ii-dx7iifdvoice32-s27-v70.wav) |
| FRETLESS 1 | `dx7-rom3a-s18` | rom3a.syx／18 | フレットレス系ベースの候補 | [velocity 70](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/soft-bass-c3-20261003/dx7-rom3a-s18-v70.wav) |
| Wood Bass | `dx7crt-vrc1002_a64-s27` | vrc1002_a64.syx／27 | ウッド系ベースの候補 | [velocity 70](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/soft-bass-c3-20261003/dx7crt-vrc1002_a64-s27-v70.wav) |
| SuperBass | `dx7ii-dx7iifdvoice32-s06` | dx7iifdvoice32.syx／6 | 同じ条件の比較基準 | [velocity 70](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/soft-bass-c3-20261003/dx7ii-dx7iifdvoice32-s06-v70.wav) |
| SuperBass | 同上 | 同上 | 弱く弾いた場合の別比較 | [velocity 45](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/soft-bass-c3-20261003/dx7ii-dx7iifdvoice32-s06-v45.wav) |

名前・ID・bank・slot・Voiceは、各JSONを直接読んで確認した。[SmoohBass](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/presets/voices/dx7ii-dx7iifdvoice32b-s02.json)、[StringBass](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/presets/voices/dx7ii-dx7iifdvoice32-s27.json)、[FRETLESS 1](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/presets/voices/dx7-rom3a-s18.json)、[Wood Bass](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/presets/voices/dx7crt-vrc1002_a64-s27.json)、[SuperBass](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/FMopelab-DX7II-BGM/presets/voices/dx7ii-dx7iifdvoice32-s06.json)を一次資料とする。

## 共通の比較条件

MIDI 48 → 52 → 55（C3 → E3 → G3、ド・ミ・ソ。MIDI 60をC4と呼ぶ表記）。各音を1秒保持して1秒の余韻を収録する。開始0／2／4秒、離鍵1／3／5秒、全長6秒。48kHz・24bit・mono、線形gain 0.5、最大4voice、追加エフェクト・音色別の音量正規化なし。候補4件と基準SuperBassはvelocity 70。SuperBassのvelocity 45は別条件の参考として扱う。

全体のgainを揃えても、音色の聴感上の音量は揃わない。試聴は音量差と音色の硬さを分けて判断する。離鍵後の余韻は1秒で区切っており、ループ素材ではない。[先の指定5音色](dx7ii-audition-20261003.md)のMIDI・velocity・保持時間とは条件が異なる。

## 検証結果

[生成スクリプト](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/soft-bass-audition-c3.mjs)で提供runtimeの`assertBgmVoice`・`renderSequence`・`encodePcm24MonoWav`を使用した。5種類ともreadyでVoice検証成功、診断項目なし。6個のWAVは全PCMが有限、3音それぞれの保持区間が非無音、共通gain適用後および24bitエンコード後にクリップなし。RIFF/WAVE・PCM・48kHz・mono・24bit・データ長・全体長・エンコード後peak一致の検査に合格した。各WAVは288,000frame／864,044byte。

| 音色／velocity | 共通gain適用後peak | RMS |
|---|---:|---:|
| SmoohBass／70 | 0.433168 | 0.069053 |
| StringBass／70 | 0.393793 | 0.047053 |
| FRETLESS 1／70 | 0.311033 | 0.064591 |
| Wood Bass／70 | 0.251036 | 0.092757 |
| SuperBass／70 | 0.354585 | 0.058425 |
| SuperBass／45 | 0.253780 | 0.041889 |

peakやRMSは音の柔らかさの判定ではない。人間による試聴評価・スマホでの発音負荷測定もこの生成検査には含まない。[manifest](C:/Users/user/Documents/project/koekit/.local-tools/fmopelab-dx7ii-review-20261002/soft-bass-c3-20261003/index.json)に原本bank／slot、Voice JSONとWAVのSHA-256、生成条件、peak／RMS／各音peakと検証結果を記録した。

再生成はコエキットのルートから`node .local-tools/fmopelab-dx7ii-review-20261002/soft-bass-audition-c3.mjs`。元の提供物・アプリ・既存の試聴素材は変更しない。
