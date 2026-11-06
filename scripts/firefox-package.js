'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { unzipSync } = require('fflate');
const { runtimeFiles, readCanonical, makeArchive } = require('./extension-package');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILES = [
  'scripts/manifest.firefox.json', 'LICENSE', 'README.md', 'docs/DEVELOPING.md', 'docs/RELEASING.md',
  'docs/CHROME.md', 'docs/store-assets.md',
  'scripts/extension-package.js', 'scripts/firefox-package.js',
  'scripts/package.json', 'scripts/package-lock.json',
];
const LEGACY_SOURCE_FILES = [
  'manifest.firefox.json', 'LICENSE', 'README.md', 'DEVELOPING.md', 'RELEASING.md',
  'scripts/extension-package.js', 'scripts/firefox-package.js',
  'scripts/package.json', 'scripts/package-lock.json',
];
const diskPath = (root, file) => path.join(root, ...file.split('/'));

function sourceFiles(root) {
  const current = fs.existsSync(diskPath(root, 'scripts/manifest.firefox.json'));
  const legacy = fs.existsSync(diskPath(root, 'manifest.firefox.json'));
  assert.notEqual(current, legacy, 'Expected exactly one Firefox manifest overlay');
  return current ? SOURCE_FILES : LEGACY_SOURCE_FILES;
}

function firefoxFiles(root = ROOT) {
  const files = new Map(runtimeFiles(root).map(file => [file, readCanonical(diskPath(root, file))]));
  const manifest = JSON.parse(files.get('manifest.json'));
  const overlay = JSON.parse(readCanonical(diskPath(root, sourceFiles(root)[0])));
  assert.deepEqual(Object.keys(overlay).sort(), ['background', 'browser_specific_settings'],
    'Firefox overlay may change only background and browser-specific settings');
  const gecko = overlay.browser_specific_settings.gecko;
  assert.equal(manifest.manifest_version, 3, 'Firefox packaging expects Manifest V3');
  assert.deepEqual(overlay.background, { scripts: ['background.js'] });
  assert.equal(gecko.id, '@maskify.mike-mo', 'Keep the developer-chosen Firefox ID stable across updates');
  assert.equal(gecko.strict_min_version, '140.0');
  assert.deepEqual(gecko.data_collection_permissions, { required: ['none'] });
  files.set('manifest.json', Buffer.from(JSON.stringify({ ...manifest, ...overlay }, null, 2) + '\n'));
  return files;
}

function buildFirefox(root = ROOT) {
  const runtime = firefoxFiles(root);
  const source = new Map([
    ...runtimeFiles(root).map(file => [file, readCanonical(diskPath(root, file))]),
    ...sourceFiles(root).map(file => [file, readCanonical(diskPath(root, file))]),
  ].sort(([left], [right]) => left.localeCompare(right, 'en')));
  return new Map([
    ['maskify-firefox.zip', makeArchive(runtime)],
    ['maskify-firefox-source.zip', makeArchive(source)],
  ]);
}

function writeFirefox(output, root = ROOT) {
  assert(!fs.existsSync(output) || fs.readdirSync(output).length === 0, 'Firefox output must be empty');
  const files = buildFirefox(root);
  fs.mkdirSync(output, { recursive: true });
  for (const [file, data] of files) fs.writeFileSync(path.join(output, file), data);
  return [...files.keys()];
}

if (require.main === module) {
  const [output, ...extra] = process.argv.slice(2);
  if (!output || extra.length) {
    console.error('Use node scripts/firefox-package.js <empty-output-directory>');
    process.exitCode = 1;
  } else {
    try {
      if (output === '--lint') {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-firefox-lint-'));
        try {
          const archive = buildFirefox().get('maskify-firefox.zip');
          for (const [file, bytes] of Object.entries(unzipSync(archive))) {
            const target = diskPath(directory, file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, bytes);
          }
          execFileSync(process.execPath, [
            path.join(__dirname, 'node_modules', 'web-ext', 'bin', 'web-ext.js'),
            'lint', '--source-dir', directory,
          ], { stdio: 'inherit' });
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      } else {
        console.log(writeFirefox(path.resolve(ROOT, output)).join('\n'));
      }
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  }
}

module.exports = { firefoxFiles, buildFirefox, writeFirefox };
