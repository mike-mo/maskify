'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { COMPOSED, selectAssets } = require('./release-screenshots');
const { normalizeChromiumLangTag, pngDimensions } = require('./screenshot');
const { compositionHtml, demoHtml } = require('./templates');
const copy = require('./copy');
const { startServer } = require('./server');

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-assets-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const locale of ['en', 'es']) {
    fs.mkdirSync(path.join(root, '_locales', locale), { recursive: true });
    fs.mkdirSync(path.join(root, 'screenshots', locale), { recursive: true });
    for (const file of files) fs.writeFileSync(path.join(root, 'screenshots', locale, file), '');
  }
  return root;
}

test('release assets contain only the three finished frames per locale', t => {
  const root = fixture(t, [...COMPOSED.map(frame => frame.file), 'popup.png', 'unrelated.png']);
  const assets = selectAssets(root);
  assert.equal(assets.generation, 'composed');
  assert.equal(assets.files.length, 6);
  assert.deepEqual(assets.english.map(asset => asset.asset), ['en-01-result.png', 'en-02-coverage.png', 'en-03-controls.png']);
  assert(!assets.files.some(file => file.endsWith('popup.png') || file.endsWith('unrelated.png')));
});

test('older releases retain their popup and test-page assets', t => {
  const assets = selectAssets(fixture(t, ['popup.png', 'testpage.png']));
  assert.equal(assets.generation, 'legacy');
  assert.equal(assets.files.length, 4);
  assert.deepEqual(assets.english.map(asset => asset.asset), ['en-popup.png', 'en-testpage.png']);
});

test('an incomplete new set cannot fall back to otherwise complete legacy assets', t => {
  const root = fixture(t, ['popup.png', 'testpage.png']);
  fs.writeFileSync(path.join(root, 'screenshots', 'en', '01-result.png'), '');
  assert.throws(() => selectAssets(root), /Incomplete composed screenshots.*es\/03-controls\.png/);
});

test('an incomplete locale is rejected', t => {
  const root = fixture(t, COMPOSED.map(frame => frame.file));
  fs.unlinkSync(path.join(root, 'screenshots', 'es', '02-coverage.png'));
  assert.throws(() => selectAssets(root), /es\/02-coverage\.png/);
});

test('missing legacy output is reported', t => {
  assert.throws(() => selectAssets(fixture(t, ['popup.png'])), /Incomplete legacy screenshots/);
});

test('Chromium locale normalization preserves script, country, and numeric region tags', () => {
  assert.equal(normalizeChromiumLangTag('es_MX'), 'es-MX');
  assert.equal(normalizeChromiumLangTag('zh_hant_tw'), 'zh-Hant-TW');
  assert.equal(normalizeChromiumLangTag('es_419'), 'es-419');
});

test('PNG dimensions are read from IHDR and invalid data is rejected', () => {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(1280, 16);
  png.writeUInt32BE(800, 20);
  assert.deepEqual(pngDimensions(png), { width: 1280, height: 800 });
  assert.throws(() => pngDimensions(Buffer.from('not an image')), /Invalid PNG/);
});

test('each locale has editable demo content and all three compositions', () => {
  const images = Object.fromEntries(['before', 'after', 'summary', 'link', 'fields', 'popup'].map(key => [key, Buffer.from('image')]));
  for (const lang of ['en', 'es']) {
    assert(demoHtml(lang).includes('carla@team.example'));
    for (const { key } of COMPOSED) {
      const html = compositionHtml(lang, key, images);
      assert(html.includes(`<html lang="${lang}">`));
      assert(html.includes(copy[lang][key].headline[0]));
      assert(!html.includes('undefined'));
    }
  }
});

test('localized UI copy has matching keys, valid descriptions, and English HTML fallbacks', () => {
  const root = path.resolve(__dirname, '..');
  const en = JSON.parse(fs.readFileSync(path.join(root, '_locales', 'en', 'messages.json'), 'utf8'));
  const es = JSON.parse(fs.readFileSync(path.join(root, '_locales', 'es', 'messages.json'), 'utf8'));
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  for (const messages of [en, es]) {
    assert(messages.appDescription.message.length > 0 && messages.appDescription.message.length <= 132);
    for (const key of ['toastSingular', 'toastPlural']) assert(messages[key].message.includes('$1'));
  }
  const html = fs.readFileSync(path.join(root, 'popup', 'popup.html'), 'utf8');
  for (const key of [
    'popupTitle', 'popupDescription', 'labelDomain', 'labelAddNumber', 'labelAddLastInitial',
    'labelShowAsterisk', 'labelPreview', 'buttonMask', 'donateLink',
  ]) {
    const id = key === 'buttonMask' ? 'sendmessageid' : key;
    const match = html.match(new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</\\1>`));
    assert(match, `Missing English fallback for ${key}`);
    assert.equal(match[2], en[key].message, `English fallback differs for ${key}`);
  }
});

test('preview assets reflect regenerated files without restarting the server', async t => {
  const root = fixture(t, []);
  const file = path.join(root, 'preview.txt');
  fs.writeFileSync(file, 'first render');
  const server = await startServer(new Map([
    ['/live', ['text/plain', file]],
    ['/static', ['text/plain', Buffer.from('fixture')]],
  ]));
  t.after(() => server.close());
  assert.equal(await (await fetch(`${server.origin}/static`)).text(), 'fixture');
  assert.equal(await (await fetch(`${server.origin}/live`)).text(), 'first render');
  fs.writeFileSync(file, 'refined render');
  assert.equal(await (await fetch(`${server.origin}/live`)).text(), 'refined render');
});

test('missing preview files produce an explicit error response and log', async t => {
  const root = fixture(t, []);
  const log = t.mock.method(console, 'error', () => {});
  const server = await startServer(new Map([
    ['/missing', ['text/plain', path.join(root, 'missing.txt')]],
  ]));
  t.after(() => server.close());
  const response = await fetch(`${server.origin}/missing`);
  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'Unable to read asset');
  assert.equal(log.mock.calls.length, 1);
});
