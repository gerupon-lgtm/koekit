// マイク音声を16kHzのFloat32で取り込み、メインスレッドへ渡すAudioWorklet
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
