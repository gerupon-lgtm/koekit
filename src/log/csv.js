// CSV生成（要件9.1 / F-006 / data-model.md 3節）
//
// - カンマ区切り。全フィールドをダブルクォートで囲む。
//   フィールド内のダブルクォートは2つ重ねてエスケープする。
// - 時刻は UTC 保持の Date を JST（Asia/Tokyo）へ変換して出力する。
//   固定オフセット +09:00 を埋め込まず、IANA ID で変換する（implementation-guide 8節）。

/** CSVの列見出し（data-model.md 3節） */
export const CSV_HEADER = [
  '時刻', '方式', 'レベル', '区間', '期待語',
  '認識文字列', '照合結果', '所要ms', '成否', '再開回数',
];

/**
 * UTCのDateを JST の "yyyy-MM-dd HH:mm:ss" に整形する。
 * 実行環境のローカルTZに依存しないよう Intl の timeZone で変換する
 * （CI/ロジックテストは TZ=UTC で走らせる。implementation-guide 8節）。
 * @param {Date} date
 * @returns {string}
 */
export function formatJst(date) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  // hour12:false は環境により深夜0時を "24" と返すことがあるため "00" へ正規化する
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day} ${hour}:${p.minute}:${p.second}`;
}

/**
 * 1フィールドをCSV用にエスケープする（必ずダブルクォートで囲む）。
 * @param {*} value
 * @returns {string}
 */
export function escapeField(value) {
  const s = value == null ? '' : String(value);
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * LogEntry配列をCSV文字列にする。
 * @param {import('./recorder.js').LogEntry[]} entries
 * @returns {string} 末尾に改行を含む CSV（CRLF区切り）
 */
export function toCSV(entries) {
  const rows = [CSV_HEADER];
  for (const e of entries) {
    rows.push([
      formatJst(e.at),
      e.method,
      e.level,
      e.phase,
      e.expected,
      e.rawText,
      e.matchedKey,
      e.elapsedMs,
      e.outcome,
      e.sessionRestart,
    ]);
  }
  // Excelに貼って崩れないよう CRLF 区切り。全フィールドをクォートする。
  return rows.map(cols => cols.map(escapeField).join(',')).join('\r\n') + '\r\n';
}
