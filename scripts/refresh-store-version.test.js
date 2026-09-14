'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { unzipSync } = require('fflate');
const { versionRefresh } = require('./refresh-store-version');
const { readCanonical, sha256 } = require('./release-assets');
const { makeArchive } = require('./store-assets');

const ROOT = path.resolve(__dirname, '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-version-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'store-assets'), path.join(root, 'store-assets'), { recursive: true });
  const inventory = JSON.parse(readCanonical(path.join(ROOT, 'store-assets', 'edge', 'asset-inventory.json')));
  for (const file of Object.keys(inventory.sources)) {
    const destination = path.join(root, ...file.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(ROOT, ...file.split('/')), destination);
  }
  const before = readCanonical(path.join(root, 'manifest.json'));
  const version = JSON.parse(before).version;
  const parts = version.split('.').map(Number);
  parts[2]++;
  fs.writeFileSync(path.join(root, 'manifest.json'), before.toString().replace(`"${version}"`, `"${parts.join('.')}"`));
  return { root, before };
}

test('version refresh changes only manifest provenance and ZIP inventories without touching PNGs or copy', t => {
  const { root, before } = fixture(t);
  const output = versionRefresh(root, before);
  assert.equal(output.size, 6);
  for (const store of ['edge', 'chrome', 'firefox']) {
    const file = `${store}/asset-inventory.json`;
    const oldInventory = JSON.parse(readCanonical(path.join(root, 'store-assets', store, 'asset-inventory.json')));
    const updated = JSON.parse(output.get(file));
    const expected = structuredClone(oldInventory);
    expected.sources['manifest.json'] = sha256(readCanonical(path.join(root, 'manifest.json')));
    assert.deepEqual(updated, expected);
    const name = `maskify-${store}-assets.zip`;
    const oldZip = unzipSync(fs.readFileSync(path.join(root, 'store-assets', name)));
    const newZip = unzipSync(output.get(name));
    assert.deepEqual(Object.keys(newZip), Object.keys(oldZip));
    for (const entry of Object.keys(newZip)) {
      assert(Buffer.from(newZip[entry]).equals(entry === 'asset-inventory.json' ? output.get(file) : Buffer.from(oldZip[entry])), entry);
    }
  }
});

test('version refresh tolerates Windows text line endings but rejects extra manifest edits', t => {
  const { root, before } = fixture(t);
  const manifest = path.join(root, 'manifest.json');
  fs.writeFileSync(manifest, readCanonical(manifest).toString().replace(/\n/g, '\r\n'));
  assert.equal(versionRefresh(root, Buffer.from(before.toString().replace(/\n/g, '\r\n'))).size, 6);
  fs.writeFileSync(manifest, fs.readFileSync(manifest, 'utf8').replace('"storage"', '"storage", "history"'));
  assert.throws(() => versionRefresh(root, before), /change only the version/);
});

test('version refresh rejects unchanged versions, downgrades, and mismatched baseline manifests', t => {
  const { root, before } = fixture(t);
  assert.throws(() => versionRefresh(root, readCanonical(path.join(root, 'manifest.json'))), /has not changed/);
  const future = Buffer.from(before.toString().replace(/"version": "[^"]+"/, '"version": "99.0.0"'));
  assert.throws(() => versionRefresh(root, future), /must increase/);
  assert.throws(() => versionRefresh(root, Buffer.from(before.toString() + '\n')), /including formatting/);
  for (const store of ['edge', 'chrome', 'firefox']) {
    const inventory = path.join(root, 'store-assets', store, 'asset-inventory.json');
    const value = JSON.parse(readCanonical(inventory));
    value.sources['manifest.json'] = 'f'.repeat(64);
    fs.writeFileSync(inventory, JSON.stringify(value));
  }
  assert.throws(() => versionRefresh(root, before), /baseline manifest/);
});

test('unrelated source changes cannot be silently rebaselined', t => {
  const { root, before } = fixture(t);
  fs.appendFileSync(path.join(root, 'scripts', 'copy.js'), '\n// Not approved\n');
  assert.throws(() => versionRefresh(root, before), /unrelated source changes require asset review/);
});

test('version refresh refuses mismatched existing artwork and ZIPs', t => {
  const { root, before } = fixture(t);
  const file = path.join(root, 'store-assets', 'maskify-edge-assets.zip');
  const contents = new Map(Object.entries(unzipSync(fs.readFileSync(file))));
  contents.set('en/01-result.png', Buffer.from('changed pixels'));
  fs.writeFileSync(file, makeArchive(contents));
  assert.throws(() => versionRefresh(root, before), /existing ZIP differs/);
});
