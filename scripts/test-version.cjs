const fs = require('node:fs');
const assert = require('node:assert/strict');
const { checkVersions } = require('./check-version.cjs');
const read = name => fs.readFileSync(name, 'utf8');
const version = JSON.parse(read('version.json')).version;
assert.deepEqual(checkVersions(read), []);
for (const name of ['manifest.json', 'sw.js', 'doubutsu/index.html', 'kioku/index.html', 'jintori/index.html']) {
  const changed = file => file === name ? read(file).replaceAll(version, version + '-mismatch') : read(file);
  assert.ok(checkVersions(changed).length, name + ': version mismatch must fail');
}
assert.ok(checkVersions(name => name === 'sw.js' ? read(name).replace(/const BUILD = '[^']*'/, "const BUILD = 'v9.9.9-stale'") : read(name)).length);
assert.ok(checkVersions(name => name === 'kioku/index.html' ? read(name).replace(/<footer[\s\S]*?<\/footer>/, '') : read(name)).length);
assert.ok(checkVersions(name => name === 'manifest.json' ? '{' : read(name)).length);
console.log('version checker mismatch/missing/malformed cases: passed');
