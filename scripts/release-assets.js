'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_ENTRIES = [
  'manifest.json', 'background.js', '_locales/', 'popup/', 'content-scripts/', 'data/',
  'icons/maskify16x16.png', 'icons/maskify32x32.png',
  'icons/maskify48x48.png', 'icons/maskify128x128.png',
];
const PROVENANCE = 'release-provenance.json';
const CHECKSUMS = 'SHA256SUMS';
const sha256 = data => createHash('sha256').update(data).digest('hex');
const diskPath = (root, file) => path.join(root, ...file.split('/'));
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

function readCanonical(file) {
  const bytes = fs.readFileSync(file);
  return /\.(md|txt|json|js|css|html|svg)$/i.test(file) || path.basename(file) === 'LICENSE'
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes;
}

function validateTag(tag, version) {
  assert(/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag),
    'Use an explicit stable vMAJOR.MINOR.PATCH tag');
  const [major, minor] = tag.slice(1).split('.').map(Number);
  assert(major > 1 || (major === 1 && minor >= 3),
    'Legacy releases before v1.3.0 are not modified by this workflow');
  if (version !== undefined) assert.equal(tag, `v${version}`, 'Manifest version does not match release tag');
}

function runtimeFiles(root = ROOT) {
  const files = [];
  function visit(file) {
    const stat = fs.lstatSync(diskPath(root, file));
    assert(!stat.isSymbolicLink(), `Runtime symlinks are not allowed: ${file}`);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(diskPath(root, file)).sort()) visit(`${file.replace(/\/$/, '')}/${child}`);
    } else {
      assert(stat.isFile(), `Not a runtime file: ${file}`);
      files.push(file);
    }
  }
  RUNTIME_ENTRIES.forEach(visit);
  return files.sort();
}

function buildAssets(root, output, tag, commit) {
  const { makeArchive } = require('./store-assets');
  const { selectAssets } = require('./release-screenshots');
  const version = JSON.parse(readCanonical(path.join(root, 'manifest.json'))).version;
  tag ||= `v${version}`;
  validateTag(tag, version);
  assert(/^[a-f0-9]{40}$/.test(commit), 'An exact source commit SHA is required');
  assert(!fs.existsSync(output) || fs.readdirSync(output).length === 0, 'Release output must be empty');
  const screenshots = selectAssets(root);
  assert.equal(screenshots.generation, 'composed', 'Modern releases require approved composed screenshots');
  const files = new Map([
    ['maskify.zip', makeArchive(new Map(runtimeFiles(root).map(file => [file, readCanonical(diskPath(root, file))])))],
    ['maskify300x300.png', fs.readFileSync(path.join(root, 'icons', 'maskify300x300.png'))],
    ...['edge', 'chrome', 'firefox'].map(store => [
      `maskify-${store}-assets.zip`, fs.readFileSync(path.join(root, 'store-assets', `maskify-${store}-assets.zip`)),
    ]),
    ['screenshots.zip', makeArchive(new Map(screenshots.files.map(file => [file, fs.readFileSync(diskPath(root, file))])))],
    ...screenshots.english.map(image => [image.asset, fs.readFileSync(diskPath(root, image.path))]),
  ]);
  files.set(PROVENANCE, json({
    tag, version, commit,
    files: [...files].map(([name, data]) => ({ name, bytes: data.length, sha256: sha256(data) })),
  }));
  files.set(CHECKSUMS, Buffer.from([...files].map(([name, data]) => `${sha256(data)}  ${name}\n`).join('')));
  fs.mkdirSync(output, { recursive: true });
  for (const [name, data] of files) fs.writeFileSync(path.join(output, name), data);
  return [...files.keys()];
}

function gh(args) {
  return execFileSync('gh', args, { maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function resolveTarget(repo, requestedTag, run = gh) {
  assert(/^[\w.-]+\/[\w.-]+$/.test(repo), 'A GitHub owner/repository is required');
  const api = endpoint => JSON.parse(run(['api', `repos/${repo}/${endpoint}`]).toString());
  const tag = requestedTag || api('releases/latest').tag_name;
  validateTag(tag);
  const release = api(`releases/tags/${tag}`);
  assert.equal(release.tag_name, tag, 'Release tag changed during resolution');
  assert.equal(release.prerelease, false, 'Use a stable release, not a prerelease');
  let object = api(`git/ref/tags/${tag}`).object;
  for (let depth = 0; object.type === 'tag' && depth < 8; depth++) object = api(`git/tags/${object.sha}`).object;
  assert.equal(object.type, 'commit', 'Release tag must resolve to a commit');
  assert(/^[a-f0-9]{40}$/.test(object.sha), 'Release commit SHA is invalid');
  return { tag, commit: object.sha, release };
}

function verifyBundle(directory, tag, commit) {
  const provenance = JSON.parse(fs.readFileSync(path.join(directory, PROVENANCE), 'utf8'));
  validateTag(tag, provenance.version);
  assert.equal(provenance.tag, tag, 'Artifact tag differs from selected release');
  assert.equal(provenance.commit, commit, 'Artifact commit differs from selected release');
  const expected = [
    'maskify.zip', 'maskify300x300.png', 'maskify-edge-assets.zip', 'maskify-chrome-assets.zip',
    'maskify-firefox-assets.zip', 'screenshots.zip', 'en-01-result.png', 'en-02-coverage.png', 'en-03-controls.png',
  ];
  assert.deepEqual(provenance.files.map(file => file.name).sort(), expected.sort(), 'Incomplete release inventory');
  const files = new Map();
  for (const file of provenance.files) {
    const bytes = fs.readFileSync(path.join(directory, file.name));
    assert.equal(bytes.length, file.bytes, `${file.name}: size mismatch`);
    assert.equal(sha256(bytes), file.sha256, `${file.name}: hash mismatch`);
    files.set(file.name, bytes);
  }
  files.set(PROVENANCE, fs.readFileSync(path.join(directory, PROVENANCE)));
  const sums = [...files].map(([name, bytes]) => `${sha256(bytes)}  ${name}\n`).join('');
  assert.equal(fs.readFileSync(path.join(directory, CHECKSUMS), 'utf8'), sums, 'Release checksums differ');
  files.set(CHECKSUMS, Buffer.from(sums));
  assert.deepEqual(fs.readdirSync(directory).sort(), [...files.keys()].sort(), 'Unexpected release output');
  return files;
}

function uploadAssets(repo, tag, commit, directory, run = gh) {
  const files = verifyBundle(directory, tag, commit);
  const target = resolveTarget(repo, tag, run);
  assert.equal(target.commit, commit, 'Release tag moved after validation; refusing upload');
  const missing = [];
  // Compare every existing asset before uploading anything. A retry can fill gaps, never replace history.
  for (const [name, bytes] of files) {
    const matches = target.release.assets.filter(asset => asset.name === name);
    assert(matches.length <= 1, `Duplicate release asset: ${name}`);
    if (matches.length === 0) {
      missing.push(path.join(directory, name));
      continue;
    }
    const asset = matches[0];
    assert.equal(asset.state, 'uploaded', `${name}: incomplete existing upload; inspect it manually`);
    const existing = run(['api', `repos/${repo}/releases/assets/${asset.id}`, '-H', 'Accept: application/octet-stream']);
    assert(Buffer.from(existing).equals(bytes), `${name}: existing release bytes differ; refusing to overwrite`);
  }
  if (missing.length) run(['release', 'upload', tag, ...missing, '--repo', repo]);
  const uploaded = resolveTarget(repo, tag, run);
  assert.equal(uploaded.commit, commit, 'Release tag moved during upload');
  assert.equal(uploaded.release.id, target.release.id, 'Release changed during upload');
  for (const [name, bytes] of files) {
    const asset = uploaded.release.assets.find(candidate => candidate.name === name);
    assert(asset && asset.state === 'uploaded', `Release asset not uploaded: ${name}`);
    const saved = run(['api', `repos/${repo}/releases/assets/${asset.id}`, '-H', 'Accept: application/octet-stream']);
    assert(Buffer.from(saved).equals(bytes), `Uploaded release asset differs: ${name}`);
  }
  console.log(`Verified ${files.size} release assets at ${tag} (${commit}); no store submission performed.`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'resolve' && args.length === 0) {
    const target = resolveTarget(process.env.GITHUB_REPOSITORY, process.env.RELEASE_TAG);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=${target.tag}\ncommit=${target.commit}\n`);
  } else if (command === 'build' && args.length === 1) {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    console.log(buildAssets(ROOT, path.resolve(args[0]), process.env.RELEASE_TAG, commit).join('\n'));
  } else if (command === 'upload' && args.length === 1) {
    uploadAssets(process.env.GITHUB_REPOSITORY, process.env.RELEASE_TAG, process.env.RELEASE_COMMIT, path.resolve(args[0]));
  } else {
    throw new Error('Use resolve, build <empty-output-directory>, or upload <artifact-directory>');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    if (error.stderr) console.error(error.stderr.toString());
    process.exitCode = 1;
  }
}

module.exports = {
  RUNTIME_ENTRIES, readCanonical, sha256, validateTag, runtimeFiles, buildAssets, resolveTarget, verifyBundle, uploadAssets,
};
