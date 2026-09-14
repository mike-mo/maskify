'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { SIZES, filename, render } = require('./icons');

const ROOT = path.resolve(__dirname, '..');

test('the icon directory contains one canonical design and its exports', () => {
  const artwork = fs.readdirSync(path.join(ROOT, 'icons'))
    .filter(file => /\.(png|svg|ico|jpg|jpeg|webp|gif)$/i.test(file));
  assert.deepEqual(artwork.sort(), ['maskify.svg', ...SIZES.map(filename)].sort());
  assert.equal(fs.existsSync(path.join(ROOT, 'design', 'icon-options')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'icon-options.js')), false);
});

test('runtime icons and release packaging use only the current production exports', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const expected = Object.fromEntries([16, 32, 48, 128].map(size => [size, `icons/${filename(size)}`]));
  assert.deepEqual(manifest.icons, expected);
  if (manifest.action.default_icon) assert.deepEqual(manifest.action.default_icon, expected);

  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'publish.yml'), 'utf8');
  const zip = workflow.match(/zip -r maskify\.zip\s+\\\r?\n([\s\S]*?)(?:\r?\n\s*\r?\n)/);
  assert(zip, 'Missing extension package build');
  const entries = zip[1].split(/[\s\\]+/).filter(Boolean);
  assert.deepEqual(entries.filter(entry => entry.startsWith('icons/')), Object.values(expected));
  const resources = [
    'manifest.json', manifest.background.service_worker, manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css || [])]),
    ...manifest.web_accessible_resources.flatMap(resource => resource.resources),
    ...fs.readdirSync(path.join(ROOT, '_locales')).map(locale => `_locales/${locale}/messages.json`),
  ];
  for (const file of resources) {
    assert(entries.some(entry => entry.endsWith('/') ? file.startsWith(entry) : file === entry),
      `${file} is missing from the extension package`);
    assert(fs.existsSync(path.join(ROOT, ...file.split('/'))), `${file} does not exist`);
  }
});

test('the popup, toast, favicons, and screenshot gallery reference production icons', () => {
  const production = [16, 32, 48, 128].map(size => `icons/${filename(size)}`);
  for (const file of [
    ['popup', 'popup.html'], ['content-scripts', 'content.js'], ['privacy.html'],
    ['testpage.html'], ['screenshots', 'index.html'],
  ]) {
    const source = fs.readFileSync(path.join(ROOT, ...file), 'utf8');
    const references = source.match(/icons\/[^"'\s<>]+\.png/g) || [];
    assert(references.length > 0, `No icon reference in ${file.join('/')}`);
    for (const reference of references) assert(production.includes(reference), `${file.join('/')}: ${reference}`);
  }
});

test('saved icons match the SVG and the gallery supports native sizes and Windows line endings', async t => {
  const readFile = fs.readFileSync;
  const gallery = path.join(ROOT, 'icons', 'index.html');
  t.mock.method(fs, 'readFileSync', (file, ...options) => {
    const content = readFile(file, ...options);
    return file === gallery && typeof content === 'string' ? content.replace(/\r?\n/g, '\r\n') : content;
  });
  await render({ check: true });
});

test('retired icon-selection flags cannot regenerate alternative artwork', () => {
  for (const flag of ['--all', '--install-selected']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'icons.js'), flag], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Use --preview/);
  }
});
