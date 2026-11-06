'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readCanonical } = require('./extension-package');

const isSha = value => typeof value === 'string' && value.length === 40 && /^[a-f0-9]{40}$/.test(value);
const isVersion = value => typeof value === 'string' && value === value.trim() &&
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);

function readRepositoryFile(root, file) {
  assert(typeof file === 'string' && /^[\w./-]+$/.test(file) && !file.split('/').includes('..') &&
    !path.isAbsolute(file), `Unsafe repository path: ${file}`);
  const resolvedRoot = fs.realpathSync(root);
  const target = fs.realpathSync(path.join(root, ...file.split('/')));
  assert(target.startsWith(resolvedRoot + path.sep), `Path leaves repository: ${file}`);
  return readCanonical(target);
}

function resolveCommit(root, commit, version, run = args =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()) {
  assert(isSha(commit), 'Use a full immutable commit SHA, not a branch or tag');
  assert(isVersion(version), 'Use the exact stable version');
  assert.equal(run(['rev-parse', `${commit}^{commit}`]), commit);
  run(['merge-base', '--is-ancestor', commit, 'origin/main']);
  const manifest = JSON.parse(run(['show', `${commit}:manifest.json`]));
  assert.equal(manifest.version, version, 'Requested version differs from the selected commit');
  return { commit, version };
}

function verifyCheckout(root, commit) {
  assert(isSha(commit), 'Use a full immutable commit SHA');
  const run = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(run(['rev-parse', 'HEAD']), commit, 'Checkout HEAD differs from requested source');
  assert.equal(run(['status', '--porcelain', '--untracked-files=normal']), '',
    'Source checkout must be clean, including canonical listing inputs');
}

module.exports = { isSha, isVersion, readRepositoryFile, resolveCommit, verifyCheckout };
