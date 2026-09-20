// T-026。ビルド工程なしで、正典と各表示・キャッシュの同値を確認する。
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

function checkVersions(read = name => fs.readFileSync(path.join(root, name), 'utf8')) {
  const errors = [];
  const check = (ok, label) => { if (!ok) errors.push(label); };
  try {
    const version = JSON.parse(read('version.json')).version;
    check(/^\d+\.\d+\.\d+$/.test(version), 'version.json: バージョン形式が不正');
    check(JSON.parse(read('manifest.json')).version === version, 'manifest.json: 正典と不一致');
    const sw = read('sw.js');
    check(sw.match(/^const VERSION = '([^']+)';/m)?.[1] === version, 'sw.js VERSION: 正典と不一致');
    const build = sw.match(/^const BUILD = '([^']+)';/m)?.[1] || '';
    check(build.startsWith(`v${version}-`) && /^v\d+\.\d+\.\d+-\d{14}(?:-[\da-f]+)?$/.test(build), 'sw.js BUILD: 正典と不一致または未刻印');
    check(/^const APP_CACHE = 'koekit-app-' \+ BUILD;/m.test(sw), 'sw.js APP_CACHE: BUILDを参照していない');
    for (const name of ['doubutsu/index.html', 'kioku/index.html', 'jintori/index.html']) {
      const html = read(name);
      const footers = [...html.matchAll(/<footer\b[^>]*class="title-footer"[^>]*>([\s\S]*?)<\/footer>/g)];
      const title = html.match(/<section\b[^>]*id="title"[^>]*>([\s\S]*?)<\/section>/)?.[1] || '';
      check(footers.length === 1 && footers[0][1].match(/\bv([^\s<&]+)/)?.[1] === version, `${name}: フッタの版が不一致／欠落／重複`);
      check(footers.length === 1 && title.includes(footers[0][0]), `${name}: フッタがタイトル画面内にない`);
      check(footers.length === 1 && footers[0][1].includes('© 2026 SIKUMI LAB'), `${name}: 著作権表記が不一致`);
    }
  } catch (error) { errors.push('読み込み失敗: ' + error.message); }
  return errors;
}
module.exports = { checkVersions };
if (require.main === module) {
  const errors = checkVersions();
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('version.json / manifest / SW / title footers: 一致');
}
