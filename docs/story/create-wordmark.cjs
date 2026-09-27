// 既存のSVGロゴと同じ丸い線・配色・「ズム」を使う。ビルド工程ではなく素材の再生成用。
// 実行: node docs/story/create-wordmark.cjs
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/brand/irodorhythm.svg'), 'utf8');
const suffix = source.match(/<svg x="509"[\s\S]*?<\/svg>/)?.[0];
if (!suffix) throw new Error('共通の「ズム」が見つかりません');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="937" height="196" viewBox="0 0 937 196" role="img" aria-label="モノガタリズム">
<title>モノガタリズム</title>
<g fill="none" stroke="#e675a0" stroke-width="38" stroke-linecap="round" stroke-linejoin="round">
  <path d="M36 55 H111 M31 103 H116 M63 56 V143 Q63 157 80 157 H119"/>
  <path d="M235 44 Q228 121 168 158"/>
  <path d="M284 79 H369 L360 151 Q358 164 337 153 M328 43 Q327 118 281 159"/>
  <path d="M360 29 L367 41 M385 22 L392 34" stroke-width="17"/>
  <path d="M449 43 Q435 77 412 93 M446 55 H508 Q499 122 436 159 M436 94 L476 120"/>
  <path d="M557 44 V99 M628 44 V95 Q628 135 590 158" transform="translate(-12 0)"/>
</g>
${suffix.replace('x="509"', 'x="647"')}
</svg>
`;
fs.mkdirSync(path.join(root, 'story/assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'story/assets/monogatarhythm.svg'), svg);
console.log('story/assets/monogatarhythm.svg');
// 名称の相談用。アプリには組み込まず、プレビューだけを書き出す。
const katari = `<svg xmlns="http://www.w3.org/2000/svg" width="683" height="196" viewBox="0 0 683 196" role="img" aria-label="カタリズム">
<title>カタリズム（名称比較案）</title>
<g fill="none" stroke="#e675a0" stroke-width="38" stroke-linecap="round" stroke-linejoin="round" transform="translate(-254 0)">
  <path d="M284 79 H369 L360 151 Q358 164 337 153 M328 43 Q327 118 281 159"/>
  <path d="M449 43 Q435 77 412 93 M446 55 H508 Q499 122 436 159 M436 94 L476 120"/>
  <path d="M557 44 V99 M628 44 V95 Q628 135 590 158" transform="translate(-12 0)"/>
</g>
${suffix.replace('x="509"', 'x="393"')}
</svg>`;
fs.mkdirSync(path.join(root, 'docs/story/previews'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/story/previews/katarhythm.svg'), katari);
