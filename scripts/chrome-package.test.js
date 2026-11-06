'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { unzipSync } = require('fflate');
const { buildPackage, checkPackage } = require('./chrome-package');
const { runtimeFiles, readCanonical } = require('./release-assets');

const ROOT = path.resolve(__dirname, '..');
const ICON = 'icons/maskify128x128.png';

function temp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-chrome-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('Chrome ZIP is deterministic, root-level, runtime-only, with only the approved padded icon substituted', () => {
  const bytes = buildPackage();
  assert(bytes.equals(buildPackage()));
  const files = unzipSync(bytes);
  assert.deepEqual(Object.keys(files), runtimeFiles());
  for (const [file, data] of Object.entries(files)) {
    const source = file === ICON ? path.join(ROOT, 'store-assets', 'chrome', 'icon-128.png')
      : path.join(ROOT, ...file.split('/'));
    assert(Buffer.from(data).equals(readCanonical(source)), file);
  }
  assert(!Buffer.from(files[ICON]).equals(fs.readFileSync(path.join(ROOT, ...ICON.split('/')))),
    'Chrome clear-space icon must not change the Edge runtime icon');
  const manifest = JSON.parse(Buffer.from(files['manifest.json']));
  assert.equal(manifest.version, JSON.parse(readCanonical(path.join(ROOT, 'manifest.json'))).version);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert(!manifest.browser_specific_settings);
  for (const file of [manifest.background.service_worker, manifest.action.default_popup,
    ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(script => script.js),
    ...manifest.web_accessible_resources.flatMap(resource => resource.resources)]) {
    assert(files[file], `Manifest references missing file: ${file}`);
  }
});

test('Chrome packaging rejects an altered icon or Firefox-specific manifest without changing source files', t => {
  const root = temp(t);
  for (const file of [...runtimeFiles(), 'store-assets/chrome/icon-128.png', 'store-assets/chrome/asset-inventory.json']) {
    const target = path.join(root, ...file.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, ...file.split('/')), target);
  }
  const manifestPath = path.join(root, 'manifest.json');
  const original = readCanonical(manifestPath);
  const manifest = JSON.parse(original);
  manifest.browser_specific_settings = { gecko: { id: 'test@example.com' } };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => buildPackage(root), /Firefox manifest/);
  fs.writeFileSync(manifestPath, original);
  fs.appendFileSync(path.join(root, 'store-assets', 'chrome', 'icon-128.png'), 'changed');
  assert.throws(() => buildPackage(root), /differs from approved/);
});

test('Chrome verification rejects tampered packages before extraction or launching a browser', t => {
  const file = path.join(temp(t), 'tampered.zip');
  fs.writeFileSync(file, Buffer.concat([buildPackage(), Buffer.from('tampered')]));
  assert.throws(() => checkPackage(file), /differs from the current reproducible build/);
});

test('the actual extracted Chrome ZIP passes the bilingual runtime suite', { timeout: 240_000 }, t => {
  const file = path.join(temp(t), 'maskify-chrome.zip');
  fs.writeFileSync(file, buildPackage());
  checkPackage(file, { executablePath: process.env.MASKIFY_CHROME_EXECUTABLE });
});
