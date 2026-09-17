// 合格ライン判定（フェーズ0 / 要件11.1 / F-007 / data-model.md 5節）
//
// 閾値は要件0章のB区分（実測後に変更してよい。改訂履歴に1行追記）。
// 変更しやすいよう、閾値はこの1箇所の定数にまとめる（T-014）。

/** 合格ラインの閾値（要件11.1）。すべてB区分＝実測後に調整可。 */
export const THRESHOLDS = Object.freeze({
  successRateMin:     0.8,   // 認識成功率: 10回の発話で8回以上
  spuriousRateMax:    0.1,   // 誤発動: 10回の試行で1回以下
  elapsedMedianMaxMs: 1000,  // 反映までの時間: 中央値1.0秒以内
  elapsedMaxMs:       2000,  //               最大2.0秒以内
  minRunWithoutDrop:  20,    // 連続使用: 20回連続でセッションが落ちない
});

function median(nums) {
  if (nums.length === 0) return null;
  const a = [...nums].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * LogEntry配列から4指標を算出する。
 *
 * 指標の定義（要件11.1・data-model.md 5節）:
 * - successRate:   correct / (correct + wrong + 認識されなかった発話)
 *                  「認識されなかった発話」= 期待語があったのに一致しなかった（ignored かつ expected≠''）
 * - spuriousCount: outcome==='spurious'（発話がないのに認識された＝誤発動）の件数
 * - elapsedMedian/Max: 認識された（matchedKey≠''）エントリの所要msの中央値・最大
 * - maxRunWithoutDrop: セッションが落ちずに連続処理できた最大回数
 *                      （sessionRestart が変わらず連続したエントリの最長）
 *
 * @param {import('./recorder.js').LogEntry[]} entries
 */
export function computeMetrics(entries) {
  let correct = 0, wrong = 0, unrecognized = 0, spuriousCount = 0;
  const elapsed = [];

  for (const e of entries) {
    if (e.outcome === 'correct') correct++;
    else if (e.outcome === 'wrong') wrong++;
    else if (e.outcome === 'spurious') spuriousCount++;
    else if (e.outcome === 'ignored' && e.expected) unrecognized++;

    if (e.matchedKey && Number.isFinite(e.elapsedMs) && e.elapsedMs > 0) {
      elapsed.push(e.elapsedMs);
    }
  }

  const attempts = correct + wrong + unrecognized;

  // 連続使用: sessionRestart が同値で連続する最長ラン
  let maxRun = 0, run = 0, prev = null;
  for (const e of entries) {
    if (prev === null || e.sessionRestart === prev) run++;
    else run = 1;
    if (run > maxRun) maxRun = run;
    prev = e.sessionRestart;
  }

  return {
    successRate:       attempts === 0 ? null : correct / attempts,
    spuriousRate:      attempts === 0 ? null : spuriousCount / attempts,
    spuriousCount,
    elapsedMedian:     median(elapsed),
    elapsedMax:        elapsed.length ? Math.max(...elapsed) : null,
    maxRunWithoutDrop: maxRun,
    // 内訳（画面表示・デバッグ用）
    counts: { correct, wrong, unrecognized, spurious: spuriousCount, attempts, total: entries.length },
  };
}

/**
 * 4指標を閾値と突き合わせ、指標ごとと総合の合否を返す。
 * データ0件の指標は pass=null（「データなし」）とし、総合は不合格扱いにしない代わりに未判定にする。
 * @param {ReturnType<typeof computeMetrics>} m
 */
export function judge(m) {
  const items = {
    successRate: m.successRate === null ? null : m.successRate >= THRESHOLDS.successRateMin,
    spurious:    m.spuriousRate === null ? null : m.spuriousRate <= THRESHOLDS.spuriousRateMax,
    elapsedMedian: m.elapsedMedian === null ? null : m.elapsedMedian <= THRESHOLDS.elapsedMedianMaxMs,
    elapsedMax:    m.elapsedMax === null ? null : m.elapsedMax <= THRESHOLDS.elapsedMaxMs,
    // 連続使用はエントリが1件も無ければ未判定（ログ0件で全指標をデータなしにする）
    run:           m.counts.total === 0 ? null : m.maxRunWithoutDrop >= THRESHOLDS.minRunWithoutDrop,
  };
  const values = Object.values(items);
  const hasData = values.some(v => v !== null);
  const overall = hasData && values.every(v => v === true);
  return { items, overall, hasData };
}
