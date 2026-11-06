'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function assemble(root, output) {
  assert(!fs.existsSync(output) || fs.readdirSync(output).length === 0, 'Pages output must be empty');
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  const pendingMoves = [
    'docs/CHROME.md', 'docs/DEVELOPING.md', 'docs/RELEASING.md', 'docs/store-assets.md',
    'web/privacy.html', 'web/testpage.html', 'scripts/manifest.firefox.json',
  ];
  const movedPaths = new Set(['CHROME.md', 'DEVELOPING.md', 'RELEASING.md', 'store-assets.md',
    'manifest.firefox.json']);
  for (const file of new Set([...tracked, ...pendingMoves])) {
    const source = path.join(root, ...file.split('/'));
    if (!fs.existsSync(source)) {
      assert(movedPaths.has(file), `Missing Pages source: ${file}`);
      continue;
    }
    const target = path.join(output, ...file.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  for (const file of ['privacy.html', 'testpage.html']) {
    const source = fs.readFileSync(path.join(root, 'web', file), 'utf8');
    fs.writeFileSync(path.join(output, file), source.replaceAll('href="../icons/', 'href="icons/'));
  }
}

if (require.main === module) {
  try {
    const [output, ...extra] = process.argv.slice(2);
    assert(output && !extra.length, 'Use node scripts/pages.js <empty-output-directory>');
    assemble(ROOT, path.resolve(output));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { assemble };
