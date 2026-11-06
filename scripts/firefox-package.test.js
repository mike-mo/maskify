'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const { unzipSync } = require('fflate');
const { buildFirefox, writeFirefox } = require('./firefox-package');
const { runtimeFiles, readCanonical } = require('./extension-package');

const ROOT = path.resolve(__dirname, '..');

function temp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-firefox-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('Firefox package changes only the manifest and includes the exact runtime allowlist', () => {
  const before = fs.readFileSync(path.join(ROOT, 'manifest.json'));
  const archive = unzipSync(buildFirefox().get('maskify-firefox.zip'));
  assert.deepEqual(Object.keys(archive), runtimeFiles());
  for (const file of runtimeFiles()) {
    if (file !== 'manifest.json') {
      assert(Buffer.from(archive[file]).equals(readCanonical(path.join(ROOT, ...file.split('/')))), file);
    }
  }
  const manifest = JSON.parse(Buffer.from(archive['manifest.json']));
  const chromium = JSON.parse(before);
  assert.deepEqual(chromium.background, { service_worker: 'background.js' });
  assert.deepEqual(manifest.background, { scripts: ['background.js'] });
  assert.deepEqual(manifest.browser_specific_settings.gecko, {
    id: '@maskify.mike-mo', strict_min_version: '140.0',
    data_collection_permissions: { required: ['none'] },
  });
  delete manifest.browser_specific_settings;
  assert.deepEqual({ ...manifest, background: chromium.background }, chromium);
  assert(fs.readFileSync(path.join(ROOT, 'manifest.json')).equals(before));
});

test('Firefox packages are deterministic and the reviewer source rebuilds identical bytes', t => {
  const first = buildFirefox();
  const second = buildFirefox();
  for (const [file, bytes] of first) assert(bytes.equals(second.get(file)), file);
  const source = temp(t);
  const archive = unzipSync(first.get('maskify-firefox-source.zip'));
  assert(archive['DEVELOPING.md'], 'Reviewer sources must retain the README development-guide link');
  for (const [file, bytes] of Object.entries(archive)) {
    assert(!/node_modules|^\.git\//.test(file), file);
    const target = path.join(source, ...file.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  // Use only the submitted sources, with dependencies resolved from this test installation.
  const result = execFileSync(process.execPath, ['-e',
    `process.stdout.write(require(${JSON.stringify(path.join(source, 'scripts', 'firefox-package.js'))})
       .buildFirefox().get('maskify-firefox.zip'));`,
  ], {
    env: { ...process.env, NODE_PATH: path.join(__dirname, 'node_modules') },
  });
  assert(Buffer.from(result).equals(first.get('maskify-firefox.zip')));
  const output = temp(t);
  writeFirefox(output);
  assert.throws(() => writeFirefox(output), /output must be empty/);
});

for (const namespace of ['browser', 'chrome']) {
  test(`shortcut uses the promise-capable ${namespace} API and saved settings`, async () => {
    let listener;
    const sent = [];
    const saved = [];
    const settings = { domain: 'demo.test', addNumber: false, addLastInitial: true, showAsterisk: false, maskCount: 3 };
    const api = {
      commands: { onCommand: { addListener: callback => { listener = callback; } } },
      tabs: {
        query: async () => [{ id: 12 }],
        sendMessage: async (...args) => { sent.push(args); },
      },
      storage: { sync: { get: async () => settings, set: value => { saved.push(value); } } },
    };
    const context = { [namespace]: api };
    if (namespace === 'browser') context.chrome = new Proxy({}, { get() { throw new Error('Firefox must use browser promises'); } });
    vm.runInNewContext(readCanonical(path.join(ROOT, 'background.js')).toString(), context);
    await listener('unrelated');
    assert.equal(sent.length, 0);
    await listener('mask-page');
    assert.deepEqual(JSON.parse(JSON.stringify(sent)), [[12, {
      domain: 'demo.test', addNumber: false, addLastInitial: true, showAsterisk: false,
    }]]);
    assert.deepEqual(JSON.parse(JSON.stringify(saved)), [{ maskCount: 4 }]);
  });
}
