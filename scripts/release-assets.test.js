'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { unzipSync } = require('fflate');
const {
  readCanonical, validateTag, runtimeFiles, buildAssets, resolveTarget, verifyBundle, uploadAssets,
} = require('./release-assets');
const { selectAssets } = require('./release-screenshots');

const ROOT = path.resolve(__dirname, '..');
const COMMIT = 'a'.repeat(40);
const TAG = `v${JSON.parse(readCanonical(path.join(ROOT, 'manifest.json'))).version}`;
const REPO = 'mike-mo/maskify';

function temp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-release-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function bundle(t) {
  const directory = temp(t);
  buildAssets(ROOT, directory, TAG, COMMIT);
  return directory;
}

function github({ tag = TAG, commit = COMMIT, annotated = false, prerelease = false } = {}) {
  const calls = [];
  const assets = new Map();
  const run = args => {
    calls.push(args);
    if (args[0] === 'release') {
      assert.deepEqual(args.slice(0, 3), ['release', 'upload', tag]);
      assert.deepEqual(args.slice(-2), ['--repo', REPO]);
      for (const file of args.slice(3, -2)) {
        assert(!assets.has(path.basename(file)), 'An existing asset must never be uploaded again');
        assets.set(path.basename(file), fs.readFileSync(file));
      }
      return Buffer.from('');
    }
    assert.equal(args[0], 'api');
    const endpoint = args[1].replace(`repos/${REPO}/`, '');
    let result;
    if (endpoint === 'releases/latest') result = { tag_name: tag };
    else if (endpoint === `releases/tags/${tag}`) result = {
      id: 42, tag_name: tag, prerelease,
      assets: [...assets].map(([name], index) => ({ id: index + 1, name, state: 'uploaded' })),
    };
    else if (endpoint === `git/ref/tags/${tag}`) result = {
      object: { type: annotated ? 'tag' : 'commit', sha: annotated ? 'b'.repeat(40) : commit },
    };
    else if (endpoint === `git/tags/${'b'.repeat(40)}`) result = { object: { type: 'commit', sha: commit } };
    else if (/^releases\/assets\/\d+$/.test(endpoint)) {
      assert.deepEqual(args.slice(2), ['-H', 'Accept: application/octet-stream']);
      return [...assets.values()][Number(endpoint.split('/').pop()) - 1];
    } else throw new Error(`Unexpected GitHub request: ${args.join(' ')}`);
    return Buffer.from(JSON.stringify(result));
  };
  return { calls, assets, run };
}

test('modern release tags must be stable, v1.3.0+, and match the manifest exactly', () => {
  validateTag(TAG, TAG.slice(1));
  for (const invalid of ['', 'main', '1.3.0', 'v1.03.0', 'v1.2.0-screenshot-test', 'v1.3.0\n']) {
    assert.throws(() => validateTag(invalid), /stable/);
  }
  assert.throws(() => validateTag('v1.2.0'), /Legacy releases/);
  assert.throws(() => validateTag(TAG, '9.9.9'), /Manifest version/);
});

test('blank tag resolves GitHub stable latest, never the newest-created prerelease', () => {
  const server = github();
  assert.equal(resolveTarget(REPO, '', server.run).tag, TAG);
  assert.equal(server.calls[0][1], `repos/${REPO}/releases/latest`);
  assert(!server.calls.some(args => args.includes('list')));
});

test('explicit tags resolve their exact lightweight or annotated commit without latest lookup', () => {
  for (const annotated of [false, true]) {
    const server = github({ annotated });
    assert.equal(resolveTarget(REPO, TAG, server.run).commit, COMMIT);
    assert(!server.calls.some(args => args[1].endsWith('/latest')));
  }
  assert.throws(() => resolveTarget(REPO, TAG, github({ prerelease: true }).run), /not a prerelease/);
});

test('packaging uses the selective runtime allowlist including the background worker and every runtime byte', t => {
  const directory = bundle(t);
  const archive = unzipSync(fs.readFileSync(path.join(directory, 'maskify.zip')));
  assert.deepEqual(Object.keys(archive), runtimeFiles());
  assert(archive['background.js']);
  assert(archive['popup/popup.html']);
  for (const [file, bytes] of Object.entries(archive)) {
    assert(Buffer.from(bytes).equals(readCanonical(path.join(ROOT, ...file.split('/')))), file);
    assert(!/^(scripts|screenshots|store-assets|design)\//.test(file), `Development asset leaked into runtime: ${file}`);
    assert(!/maskify(?:64x64|300x300)\.png$/.test(file), `Non-runtime icon in extension: ${file}`);
  }
});

test('release artwork and store bundles are copied exactly and both screenshot locales are complete', t => {
  const directory = bundle(t);
  for (const store of ['edge', 'chrome', 'firefox']) {
    const name = `maskify-${store}-assets.zip`;
    assert(fs.readFileSync(path.join(directory, name)).equals(fs.readFileSync(path.join(ROOT, 'store-assets', name))));
  }
  assert(fs.readFileSync(path.join(directory, 'maskify300x300.png'))
    .equals(fs.readFileSync(path.join(ROOT, 'icons', 'maskify300x300.png'))));
  const selected = selectAssets(ROOT);
  const archive = unzipSync(fs.readFileSync(path.join(directory, 'screenshots.zip')));
  assert.deepEqual(Object.keys(archive), selected.files);
  for (const file of selected.files) {
    assert(Buffer.from(archive[file]).equals(fs.readFileSync(path.join(ROOT, ...file.split('/')))));
  }
  for (const image of selected.english) {
    assert(fs.readFileSync(path.join(directory, image.asset)).equals(fs.readFileSync(path.join(ROOT, ...image.path.split('/')))));
  }
});

test('all release bytes are deterministic and cannot be mixed with stale output', t => {
  const first = bundle(t);
  const second = bundle(t);
  for (const name of fs.readdirSync(first)) {
    assert(fs.readFileSync(path.join(first, name)).equals(fs.readFileSync(path.join(second, name))), name);
  }
  assert.throws(() => buildAssets(ROOT, first, TAG, COMMIT), /output must be empty/);
  assert.throws(() => buildAssets(ROOT, temp(t), 'v9.9.9', COMMIT), /Manifest version/);
  assert.throws(() => buildAssets(ROOT, temp(t), TAG, 'main'), /exact source commit/);
});

test('bundle verification rejects tampered bytes or a different source commit', t => {
  const directory = bundle(t);
  assert.equal(verifyBundle(directory, TAG, COMMIT).size, 11);
  assert.throws(() => verifyBundle(directory, TAG, 'c'.repeat(40)), /commit differs/);
  fs.appendFileSync(path.join(directory, 'maskify.zip'), 'tampered');
  assert.throws(() => verifyBundle(directory, TAG, COMMIT), /size mismatch/);
});

test('upload fills partial releases, verifies the saved bytes, and retries without reuploading', t => {
  const directory = bundle(t);
  const server = github();
  server.assets.set('maskify.zip', fs.readFileSync(path.join(directory, 'maskify.zip')));
  uploadAssets(REPO, TAG, COMMIT, directory, server.run);
  assert.equal(server.assets.size, 11);
  assert.equal(server.calls.filter(args => args[0] === 'release').length, 1);
  uploadAssets(REPO, TAG, COMMIT, directory, server.run);
  assert.equal(server.calls.filter(args => args[0] === 'release').length, 1);
  assert(!server.calls.flat().includes('--clobber'));
});

test('conflicting historical assets and moved tags fail before any upload', t => {
  const directory = bundle(t);
  const server = github();
  server.assets.set('en-03-controls.png', Buffer.from('different approved image'));
  assert.throws(() => uploadAssets(REPO, TAG, COMMIT, directory, server.run), /refusing to overwrite/);
  assert(!server.calls.some(args => args[0] === 'release'));
  const moved = github({ commit: 'c'.repeat(40) });
  assert.throws(() => uploadAssets(REPO, TAG, COMMIT, directory, moved.run), /tag moved/);
  assert(!moved.calls.some(args => args[0] === 'release'));
});

test('only one workflow handles published releases, with reused checks and no store submission or recapture', () => {
  const workflow = name => fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');
  const publish = workflow('publish.yml');
  const screenshots = workflow('screenshots.yml');
  const ci = workflow('ci.yml');
  assert.match(ci, /pull_request:/);
  assert.match(ci, /\n  push:/);
  assert.match(ci, /workflow_call:/);
  assert.match(ci, /npm --prefix scripts test/);
  assert.match(ci, /npx playwright install chromium --with-deps/);
  assert.match(ci, /release-assets\.js build/);
  assert.match(publish, /types: \[published\]/);
  assert.match(publish, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(publish, /needs: \[resolve, verify\]/);
  assert.match(publish, /ref: \$\{\{ needs\.resolve\.outputs\.commit \}\}/);
  assert.match(publish, /group: maskify-release-artifacts/);
  assert.match(screenshots, /uses: \.\/\.github\/workflows\/publish\.yml/);
  assert.doesNotMatch(screenshots, /\n  release:/);
  for (const source of [publish, screenshots, ci]) {
    assert.doesNotMatch(source, /PlasmoHQ|BPP_KEYS|--clobber|node screenshot\.js|npm run screenshot/);
  }
});
