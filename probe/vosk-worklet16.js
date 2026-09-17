// マイク音声を Vosk が期待する Int16 の 16kHz モノラルに整えて送る AudioWorklet。
// AudioContext を 16000Hz で作っている前提なので、ここでのリサンプルは不要。
// Float32(-1..1) を Int16(-32768..32767) に変換して postMessage する。
class VoskCapture16 extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const f32 = input[0];
      const i16 = new Int16Array(f32.length);
      let peak = 0;
      for (let i = 0; i < f32.length; i++) {
        let s = f32[i];
        if (s > 1) s = 1; else if (s < -1) s = -1;
        const a = Math.abs(s); if (a > peak) peak = a;
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      // Int16 のバッファと、音量メーター用のピークを一緒に送る
      this.port.postMessage({ pcm: i16, peak }, [i16.buffer]);
    }
    return true;
  }
}
registerProcessor('vosk-capture16', VoskCapture16);
