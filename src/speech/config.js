// 音声入力層の設定（方式C=Voskのモデル配信先など）
//
// モデル配信先は【想定】Cloudflare R2（実機検証で R2 公開URLから CORS設定なしで取得できることを実証済み。
// docs/field-check-results.md）。実際のR2公開URLは発案者の環境固有のため、下記の優先順で解決する。
//   1. URLクエリ  ?model=<URL>          （検証時の切り替え用）
//   2. グローバル  window.KOEKIT_MODEL_URL（HTMLで先に定義しておく手段）
//   3. 既定値      DEFAULT_MODEL_URL
//
// 既定値は placeholder。公開前に発案者のR2公開URL（または同梱するローカルパス）へ差し替える。
// モデルは `model/` を一段かませて tar.gz 化したものを指すこと（field-check-results.md）。

// 公開版のモデル配信先（Cloudflare R2 公開URL）。実機検証で github.io から CORS設定なしで取得できたバケット。
// 検証時は ?model= で別URLに上書きできる。
export const DEFAULT_MODEL_URL = 'https://pub-4c91bbf040094f6aab68bd9faf87468d.r2.dev/model.tar.gz';

export function resolveModelUrl() {
  try {
    const q = new URLSearchParams(location.search).get('model');
    if (q) return q;
  } catch { /* location 無い環境（テスト等）は無視 */ }
  if (typeof window !== 'undefined' && window.KOEKIT_MODEL_URL) return window.KOEKIT_MODEL_URL;
  return DEFAULT_MODEL_URL;
}

// 方式の識別子
export const METHODS = Object.freeze({
  WEBSPEECH:       'webspeech',        // 方式A（既定Web Speech）＝検証専用（C-1）
  WEBSPEECH_LOCAL: 'webspeech-local',  // 方式B（端末内処理）
  VOSK:            'vosk',             // 方式C（本命）
});
