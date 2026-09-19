import { METHODS } from './config.js';

// 公開ゲームの入口。旧設定やURLから方式A・未知の方式を持ち込まない。
export function publicMethod(value) {
  return value === METHODS.WEBSPEECH_LOCAL ? METHODS.WEBSPEECH_LOCAL : METHODS.VOSK;
}
