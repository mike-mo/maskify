'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { assemble } = require('./pages');

const ROOT = path.resolve(__dirname, '..');

test('assembled Pages preserve public URLs and valid favicon paths', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-pages-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  assemble(ROOT, output);
  for (const file of ['privacy.html', 'testpage.html']) {
    const published = fs.readFileSync(path.join(output, file), 'utf8');
    const local = fs.readFileSync(path.join(ROOT, 'web', file), 'utf8');
    assert.equal(published, local.replaceAll('href="../icons/', 'href="icons/'));
    const icons = [...published.matchAll(/<link rel="icon"[^>]*href="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(icons, ['icons/maskify.svg', 'icons/maskify32x32.png', 'icons/maskify16x16.png']);
    for (const icon of icons) assert(fs.existsSync(path.join(output, icon)), `${file}: ${icon} missing`);
    for (const match of local.matchAll(/<link rel="icon"[^>]*href="([^"]+)"/g)) {
      assert(fs.existsSync(path.resolve(ROOT, 'web', match[1])), `${file}: ${match[1]} missing locally`);
    }
  }
  for (const file of ['README.md', 'icons/index.html', 'icons/gallery.css', 'screenshots/index.html',
    'screenshots/en/01-result.png', 'screenshots/es/03-controls.png']) {
    assert(fs.existsSync(path.join(output, file)), `${file} missing from Pages`);
  }
  for (const file of ['icons/index.html', 'screenshots/index.html']) {
    const html = fs.readFileSync(path.join(output, file), 'utf8');
    const base = new URL(file, 'https://example.test/maskify/');
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = new URL(match[1], base);
      if (url.hash) continue;
      assert(url.pathname.startsWith('/maskify/'), `${file}: ${match[1]} leaves the site`);
      assert(fs.existsSync(path.join(output, url.pathname.slice('/maskify/'.length))),
        `${file}: ${match[1]} missing from Pages`);
    }
  }
  assert.throws(() => assemble(ROOT, output), /Pages output must be empty/);
});
