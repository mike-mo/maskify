'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zipSync } = require('fflate');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_ENTRIES = [
  'manifest.json', 'background.js', '_locales/', 'popup/', 'content-scripts/', 'data/',
  'icons/maskify16x16.png', 'icons/maskify32x32.png',
  'icons/maskify48x48.png', 'icons/maskify128x128.png',
];

function readCanonical(file) {
  const bytes = fs.readFileSync(file);
  return /\.(md|txt|json|js|css|html|svg)$/i.test(file) || path.basename(file) === 'LICENSE'
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes;
}

function runtimeFiles(root = ROOT) {
  const files = [];
  function visit(file) {
    const disk = path.join(root, ...file.split('/'));
    const stat = fs.lstatSync(disk);
    assert(!stat.isSymbolicLink(), `Runtime symlinks are not allowed: ${file}`);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(disk).sort()) visit(`${file.replace(/\/$/, '')}/${child}`);
    } else {
      assert(stat.isFile(), `Not a runtime file: ${file}`);
      files.push(file);
    }
  }
  RUNTIME_ENTRIES.forEach(visit);
  return files.sort();
}

function makeArchive(files) {
  return Buffer.from(zipSync(Object.fromEntries(files), { level: 6, mtime: new Date(2000, 0, 1) }));
}

module.exports = { RUNTIME_ENTRIES, readCanonical, runtimeFiles, makeArchive };
