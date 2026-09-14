'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { unzipSync } = require('fflate');
const { STORES, makeArchive, check } = require('./store-assets');
const { readCanonical, sha256, validateTag } = require('./release-assets');

const ROOT = path.resolve(__dirname, '..');

function versionRefresh(root, previousManifest) {
  const before = Buffer.from(previousManifest.toString().replace(/\r\n/g, '\n'));
  const after = readCanonical(path.join(root, 'manifest.json'));
  const previous = JSON.parse(before);
  const current = JSON.parse(after);
  validateTag(`v${current.version}`);
  assert.notEqual(previous.version, current.version, 'Manifest version has not changed');
  const beforeParts = previous.version.split('.').map(Number);
  const afterParts = current.version.split('.').map(Number);
  const changedPart = afterParts.findIndex((value, index) => value !== beforeParts[index]);
  assert(afterParts[changedPart] > beforeParts[changedPart], 'Manifest version must increase');
  assert.equal(after.toString(), before.toString().replace(
    /("version"\s*:\s*")[^"]+(")/, (_match, prefix, suffix) => `${prefix}${current.version}${suffix}`),
  'Manifest edit must change only the version, including formatting');

  const output = new Map();
  for (const store of STORES) {
    const directory = path.join(root, 'store-assets', store.id);
    const inventoryFile = path.join(directory, 'asset-inventory.json');
    const inventoryBytes = readCanonical(inventoryFile);
    const inventory = JSON.parse(inventoryBytes);
    assert.equal(inventory.sources['manifest.json'], sha256(before),
      `${store.id}: baseline manifest does not match the approved inventory`);
    for (const [file, digest] of Object.entries(inventory.sources)) {
      if (file !== 'manifest.json') assert.equal(sha256(readCanonical(path.join(root, ...file.split('/')))), digest,
        `${file}: unrelated source changes require asset review, not a version refresh`);
    }
    const archive = unzipSync(fs.readFileSync(path.join(root, 'store-assets', `maskify-${store.id}-assets.zip`)));
    const expected = [...inventory.files.map(file => file.file), 'asset-inventory.json'];
    assert.deepEqual(Object.keys(archive).sort(), expected.sort(), `${store.id}: existing ZIP inventory differs`);
    for (const file of expected) {
      assert(Buffer.from(archive[file]).equals(readCanonical(path.join(directory, ...file.split('/')))),
        `${store.id}/${file}: existing ZIP differs from approved loose file`);
    }
    inventory.sources['manifest.json'] = sha256(after);
    const updated = Buffer.from(JSON.stringify(inventory, null, 2) + '\n');
    output.set(`${store.id}/asset-inventory.json`, updated);
    archive['asset-inventory.json'] = updated;
    output.set(`maskify-${store.id}-assets.zip`, makeArchive(new Map(Object.entries(archive))));
  }
  return output;
}

async function refresh(from) {
  assert(/^[a-f0-9]{40}$/.test(from), 'Pass --from with the exact approved baseline commit SHA');
  const before = execFileSync('git', ['show', `${from}:manifest.json`], { cwd: ROOT });
  const output = versionRefresh(ROOT, before);
  const staged = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-version-refresh-'));
  try {
    fs.cpSync(path.join(ROOT, 'store-assets'), staged, { recursive: true });
    for (const [file, bytes] of output) fs.writeFileSync(path.join(staged, ...file.split('/')), bytes);
    await check(staged);
    for (const [file, bytes] of output) fs.writeFileSync(path.join(ROOT, 'store-assets', ...file.split('/')), bytes);
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
  console.log('Updated only the manifest source hash and three ZIP inventories; all artwork and copy are unchanged.');
}

if (require.main === module) {
  const [flag, from, ...extra] = process.argv.slice(2);
  if (flag !== '--from' || !from || extra.length) {
    console.error('Use --from <exact-approved-baseline-commit> after a version-only manifest edit');
    process.exitCode = 1;
  } else {
    refresh(from).catch(error => { console.error(error); process.exitCode = 1; });
  }
}

module.exports = { versionRefresh };
