// マイク音声を16kHzのFloat32で取り込み、メインスレッドへ渡す AudioWorklet。
// 実機検証で通った方式（probe/vosk-worklet.js と同じ）:
// AudioContext を 16000Hz で作り、Float32 をそのまま送る。メイン側で AudioBuffer(16kHz) にして
// acceptWaveform へ渡す。Int16 を直接渡すと getChannelData is not a function になる
// （docs/field-check-results.md）。
class VoskCapture extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      // 入力バッファをコピーしてメインスレッドへ送る
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}
registerProcessor('vosk-capture', VoskCapture);
