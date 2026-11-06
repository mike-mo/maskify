'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { unzipSync } = require('fflate');
const { runtimeFiles, readCanonical, makeArchive } = require('./extension-package');
const { sha256 } = require('./release-assets');
const { buildStoreFiles } = require('./store-assets');

const ROOT = path.resolve(__dirname, '..');
const ICON = 'icons/maskify128x128.png';

function buildPackage(root = ROOT) {
  const files = new Map(runtimeFiles(root).map(file => [
    file, readCanonical(path.join(root, ...file.split('/'))),
  ]));
  const manifest = JSON.parse(files.get('manifest.json'));
  assert.equal(manifest.manifest_version, 3, 'Chrome packaging requires Manifest V3');
  assert.equal(manifest.background?.service_worker, 'background.js', 'Chrome requires the background service worker');
  assert(!('browser_specific_settings' in manifest), 'Do not package Firefox manifest settings for Chrome');
  assert.equal(manifest.icons?.['128'], ICON, 'Chrome icon path changed');
  for (const locale of ['en', 'es']) {
    const messages = JSON.parse(files.get(`_locales/${locale}/messages.json`));
    const description = manifest.description.replace(/__MSG_(\w+)__/g, (_, key) => messages[key].message);
    assert(description.length > 0 && description.length <= 132, `${locale}: Chrome description exceeds 132 characters`);
  }
  files.set(ICON, buildStoreFiles(root, 'chrome').get('icon-128.png'));
  return makeArchive(files);
}

function checkPackage(file, { executablePath } = {}) {
  const bytes = fs.readFileSync(file);
  assert(bytes.equals(buildPackage()), 'Chrome ZIP differs from the current reproducible build');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-chrome-check-'));
  try {
    for (const [name, data] of Object.entries(unzipSync(bytes))) {
      const target = path.join(directory, ...name.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
    }
    const env = {
      ...process.env,
      MASKIFY_EXTENSION_PATH: directory,
      MASKIFY_CHROME_EXECUTABLE: executablePath || '',
    };
    // A nested Node test runner otherwise skips its files and exits successfully.
    delete env.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ['--test', 'masking.test.js'], {
      cwd: __dirname,
      env,
      stdio: 'inherit',
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log(`Verified Chrome ZIP contents and packaged English/Spanish runtime. SHA256 ${sha256(bytes)}`);
}

if (require.main === module) {
  try {
    const [command, file, ...extra] = process.argv.slice(2);
    assert(file && extra.length === 0 && ['build', 'check'].includes(command),
      'Use build <new-output.zip> or check <output.zip>');
    const target = path.resolve(ROOT, file);
    if (command === 'build') {
      const bytes = buildPackage();
      fs.writeFileSync(target, bytes, { flag: 'wx' });
      console.log(`Built ${target} (${bytes.length} bytes). SHA256 ${sha256(bytes)}`);
    } else {
      checkPackage(target, { executablePath: process.env.MASKIFY_CHROME_EXECUTABLE });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildPackage, checkPackage };
