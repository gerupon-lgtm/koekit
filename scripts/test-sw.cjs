const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
(async () => {
  const listeners = {}, deleted = [], added = [];
  let work;
  const existing = ['koekit-app-old', 'koekit-static-v1', 'vosk-model-cache', 'other-app-cache'];
  const cache = { match: async url => url.includes('lib/vosk') ? {} : undefined, add: async request => added.push(request.url) };
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), {
    self: { addEventListener: (type, fn) => listeners[type] = fn, skipWaiting() {}, clients: { claim() {} } },
    caches: { keys: async () => existing, delete: async key => deleted.push(key), open: async () => cache },
    Request: class { constructor(url) { this.url = url; } },
    URL, Promise,
  });
  listeners.activate({ waitUntil(p) { work = p; } }); await work;
  assert.deepEqual(deleted.sort(), ['koekit-app-old', 'koekit-static-v1'], 'preserve model and unrelated caches');
  listeners.install({ waitUntil(p) { work = p; } }); await work;
  const { ANIMAL_FILES } = await import('../src/game/animals.js');
  for (const file of ANIMAL_FILES) assert.ok(added.includes('./assets/animals/' + file), file + ' must be precached');
  assert.ok(added.includes('./src/speech/vosk-worklet.js'));
  assert.ok(added.includes('./sw-register.js'));
  assert.ok(!added.includes('./lib/vosk/vosk.js'), 'do not redownload unchanged library');
  console.log('SW cache ownership + full animal precache: passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
