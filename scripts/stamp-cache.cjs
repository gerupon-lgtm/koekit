// キャッシュバスターのスタンプ（各デプロイ前に実行する）。
// sw.js の `const BUILD = '...'` を、デプロイごとに一意な値へ置換する。
// これにより APP_CACHE 名が変わり、旧キャッシュが破棄され、アプリ本体が確実に最新化される。
//
//   node scripts/stamp-cache.cjs
//
// BUILD 値 = v<version>-<UTCタイムスタンプ>-<gitショートSHA(あれば)>

'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'sw.js');
const versionPath = path.join(root, 'version.json');

const version = JSON.parse(fs.readFileSync(versionPath, 'utf8')).version;
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDhhmmss(UTC)
let sha = '';
try { sha = '-' + execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch { /* gitなしでも可 */ }
const build = `v${version}-${ts}${sha}`;

let sw = fs.readFileSync(swPath, 'utf8');
const re = /const BUILD = '[^']*';/;
if (!re.test(sw)) {
  console.error('sw.js に `const BUILD = \'...\';` が見つかりません');
  process.exit(1);
}
sw = sw.replace(re, `const BUILD = '${build}';`);
fs.writeFileSync(swPath, sw);
console.log('stamped BUILD =', build);
