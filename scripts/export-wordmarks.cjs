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
