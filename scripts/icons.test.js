'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { chromium } = require('playwright');
const { SIZES, filename, assetInventory, verifyExports, render } = require('./icons');
const { RUNTIME_ENTRIES } = require('./release-assets');

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

  const entries = RUNTIME_ENTRIES;
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

test('saved icons match the approved SVG/export hashes and the gallery supports native sizes and Windows line endings', async t => {
  const readFile = fs.readFileSync;
  const writeFile = fs.writeFileSync;
  const gallery = path.join(ROOT, 'icons', 'index.html');
  t.mock.method(fs, 'readFileSync', (file, ...options) => {
    const content = readFile(file, ...options);
    return file === gallery && typeof content === 'string' ? content.replace(/\r?\n/g, '\r\n') : content;
  });
  t.mock.method(fs, 'writeFileSync', (file, ...options) => {
    if (typeof file === 'string') {
      assert(!path.resolve(file).startsWith(path.join(ROOT, 'icons') + path.sep),
        'Icon verification must not rewrite exports or approve a new inventory');
    }
    return writeFile(file, ...options);
  });
  const launch = chromium.launch.bind(chromium);
  t.mock.method(chromium, 'launch', async options => {
    const browser = await launch(options);
    const newPage = browser.newPage.bind(browser);
    t.mock.method(browser, 'newPage', async options => {
      const page = await newPage(options);
      t.mock.method(page, 'screenshot', () => {
        throw new Error('Icon verification must not recapture approved artwork');
      });
      return page;
    });
    return browser;
  });
  await render({ check: true });
});

test('every SVG and PNG byte is checked against the approved inventory without rasterizer tolerances', () => {
  const source = fs.readFileSync(path.join(ROOT, 'icons', 'maskify.svg'));
  const outputs = new Map(SIZES.map(size => [filename(size), fs.readFileSync(path.join(ROOT, 'icons', filename(size)))]));
  const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'icons', 'asset-inventory.json'), 'utf8'));
  verifyExports(source, outputs, inventory);
  assert.deepEqual(assetInventory(Buffer.from(source.toString().replace(/\r?\n/g, '\r\n')), outputs), inventory);
  assert.throws(() => verifyExports(Buffer.concat([source, Buffer.from(' ')]), outputs, inventory), /Approved icon source/);
  for (const [file, bytes] of outputs) {
    const changed = new Map(outputs);
    const mutated = Buffer.from(bytes);
    mutated[mutated.length - 1] ^= 1;
    changed.set(file, mutated);
    assert.throws(() => verifyExports(source, changed, inventory), /Approved icon source/, file);
  }
});

test('retired icon-selection flags cannot regenerate alternative artwork', () => {
  for (const flag of ['--all', '--install-selected']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'icons.js'), flag], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Use --preview/);
  }
});
