// ロゴを更新するときだけ実行する素材書き出し。アプリのビルド工程ではない。
// node scripts/export-wordmarks.cjs
// 共通の「ズム」の画素・位置・倍率は全作品で同一。
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', 'assets', 'brand');
const parts = JSON.parse(fs.readFileSync(path.join(dir, 'components', 'layout.json'), 'utf8'));
const margin = 16, baseline = 176, prefixSlot = 400, gap = 12;
const suffixHeight = 160;
const scaledWidth = (part, height) => part.bounds.width / part.bounds.height * height;
const suffixWidthFactor = .78; // 幅広の生成文字を接頭部と同じ光学的な文字幅へ揃える。
const suffixWidth = scaledWidth(parts.zum, suffixHeight) * suffixWidthFactor;
const width = Math.ceil(margin * 2 + prefixSlot + gap + suffixWidth);
const height = 196;
function component(part, x, h, widthFactor = 1) {
  const b = part.bounds;
  const data = fs.readFileSync(path.join(dir, 'components', part.file)).toString('base64');
  return `<svg x="${x}" y="${baseline - h}" width="${scaledWidth(part, h) * widthFactor}" height="${h}" preserveAspectRatio="none" viewBox="${b.x} ${b.y} ${b.width} ${b.height}"><image width="${part.width}" height="${part.height}" href="data:image/webp;base64,${data}"/></svg>`;
}
const shared = component(parts.zum, margin + prefixSlot + gap, suffixHeight, suffixWidthFactor);
for (const [file, label, key, prefixHeight] of [
  ['pitarhythm.svg', 'ピタリズム', 'pitari', 160],
  ['memorhythm.svg', 'メモリズム', 'memori', 150],
]) {
  const prefix = parts[key];
  const x = margin + prefixSlot - scaledWidth(prefix, prefixHeight);
  if (x < 0) throw new Error('接頭部がロゴ枠を超えています: ' + key);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}"><title>${label}</title>${component(prefix, x, prefixHeight)}${shared}</svg>\n`;
  fs.writeFileSync(path.join(dir, file), svg);
  console.log(file, width + 'x' + height);
}

// 4文字の「イロドリ」は丸い筆画のベクター。末尾は既存2作と同じ部品・倍率。
// 共通ズムの約38pxの筆画に揃え、リの右端からズまでを既存2作と同じ12pxにする。
const irodoriSlot = 481;
const irodoriPrefix = `<g fill="none" stroke="#cb8c79" stroke-width="38" stroke-linecap="round" stroke-linejoin="round">
  <path d="M110 39 Q80 78 35 95 M83 72 V157"/>
  <path d="M158 53 H242 V151 H158 Z"/>
  <path d="M294 43 V157 M295 84 Q328 92 350 112"/>
  <path d="M339 35 L348 48 M364 28 L373 41" stroke-width="20"/>
  <path d="M419 44 V99 M490 44 V95 Q490 135 452 158" transform="translate(-12 0)"/>
</g><rect x="190" y="86" width="22" height="22" rx="5" fill="#e4bd91"/>`;
const irodoriWidth = Math.ceil(margin * 2 + irodoriSlot + gap + suffixWidth);
fs.writeFileSync(path.join(dir, 'irodorhythm.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${irodoriWidth}" height="${height}" viewBox="0 0 ${irodoriWidth} ${height}" role="img" aria-label="イロドリズム"><title>イロドリズム</title>${irodoriPrefix}${component(parts.zum, margin + irodoriSlot + gap, suffixHeight, suffixWidthFactor)}</svg>\n`);
console.log('irodorhythm.svg', irodoriWidth + 'x' + height);

// ジントリの丸い筆画にも、同じズム部品を接続する。
const jintoriPrefix = `<g fill="none" stroke="#65765a" stroke-width="38" stroke-linecap="round" stroke-linejoin="round">
  <path d="M35 54 L55 63 M31 103 L49 111 M37 157 Q100 157 113 80"/>
  <path d="M97 34 L104 45 M121 28 L129 39" stroke-width="20"/>
  <path d="M161 57 L187 76 M158 157 Q218 147 248 77" stroke="#c1ac87"/>
  <path d="M296 43 V157 M297 84 Q330 92 352 112"/>
  <path d="M419 44 V99 M490 44 V95 Q490 135 452 158" transform="translate(-12 0)" stroke="#c1ac87"/>
</g>`;
fs.writeFileSync(path.join(dir, 'jintorhythm.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${irodoriWidth}" height="${height}" viewBox="0 0 ${irodoriWidth} ${height}" role="img" aria-label="ジントリズム"><title>ジントリズム</title>${jintoriPrefix}${component(parts.zum, margin + irodoriSlot + gap, suffixHeight, suffixWidthFactor)}</svg>\n`);
console.log('jintorhythm.svg', irodoriWidth + 'x' + height);
