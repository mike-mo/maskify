'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, after } = require('node:test');
const { unzipSync } = require('fflate');
const { chromium } = require('playwright');
const { startServer } = require('./server');
const {
  STORES, imageSpecs, plainText, section, validateImage, validateChromePadding, makeArchive, check, previewRoutes,
  buildStoreAssets, buildStoreFiles, writeStoreAssets, verifyArtwork, sourceHashes, artworkFile, policyText,
} = require('./store-assets');
const { promoHtml, amoHtml } = require('./store-templates');
const { captureSourceImages } = require('./screenshot');
const copy = require('./copy');

const ROOT = path.resolve(__dirname, '..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-store-build-'));
after(() => fs.rmSync(OUT, { recursive: true, force: true }));
writeStoreAssets(ROOT, OUT);

function sourceFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-store-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of Object.keys(sourceHashes(ROOT))) {
    const target = path.join(root, ...file.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, ...file.split('/')), target);
  }
  return root;
}

test('store builds use canonical sources without committed copies, browsers, or artwork recapture', t => {
  t.mock.method(chromium, 'launch', () => { throw new Error('Artifact builds must not start a browser'); });
  assert.equal(fs.existsSync(path.join(ROOT, 'store-assets')), false);
  const first = buildStoreAssets();
  const second = buildStoreAssets();
  assert(first.get('scripts/assets/Manrope-OFL.txt').toString('utf8').includes('SIL OPEN FONT LICENSE'));
  assert.deepEqual([...first.keys()], [...second.keys()]);
  for (const [file, bytes] of first) assert(bytes.equals(second.get(file)), file);
  assert.equal(new Set(imageSpecs().map(artworkFile)).size, 14, '22 store images have 14 shared source images');
  for (const store of STORES) {
    const files = buildStoreFiles(ROOT, store.id);
    for (const spec of imageSpecs().filter(spec => spec.store === store.id)) {
      assert(files.get(spec.file).equals(fs.readFileSync(path.join(ROOT, ...artworkFile(spec).split('/')))));
    }
  }
});

test('version-only builds preserve approved images without rebaselining source checks', t => {
  const root = sourceFixture(t);
  const approval = fs.readFileSync(path.join(root, 'store-artwork', 'approved.json'));
  const manifest = path.join(root, 'manifest.json');
  const value = JSON.parse(fs.readFileSync(manifest));
  value.version = '1.3.1';
  fs.writeFileSync(manifest, JSON.stringify(value, null, 2).replace(/\n/g, '\r\n'));
  const changed = buildStoreAssets(root);
  for (const spec of imageSpecs(root)) {
    assert(changed.get(`${spec.store}/${spec.file}`).equals(fs.readFileSync(path.join(OUT, spec.store, ...spec.file.split('/')))));
  }
  assert(fs.readFileSync(path.join(root, 'store-artwork', 'approved.json')).equals(approval));
  value.permissions.push('history');
  fs.writeFileSync(manifest, JSON.stringify(value));
  assert.throws(() => buildStoreAssets(root), /Artwork source inputs changed/);
});

test('all runtime inputs, added files and modified approved image bytes fail closed', t => {
  const root = sourceFixture(t);
  for (const file of ['background.js', 'data/names-en.js', 'data/domain-utils.js', 'icons/maskify32x32.png']) {
    const target = path.join(root, ...file.split('/'));
    const before = fs.readFileSync(target);
    fs.appendFileSync(target, 'changed');
    assert.throws(() => verifyArtwork(root), /Artwork source inputs changed/, file);
    fs.writeFileSync(target, before);
  }
  const added = path.join(root, 'data', 'unexpected.js');
  fs.writeFileSync(added, 'unapproved');
  assert.throws(() => verifyArtwork(root), /Artwork source inputs changed/);
  fs.unlinkSync(added);
  const removed = path.join(root, 'data', 'names-en.js');
  const original = fs.readFileSync(removed);
  fs.unlinkSync(removed);
  assert.throws(() => verifyArtwork(root), /Artwork source inputs changed/);
  fs.writeFileSync(removed, original);
  fs.appendFileSync(path.join(root, 'store-artwork', 'firefox-01-result.png'), 'changed');
  assert.throws(() => verifyArtwork(root), /approved artwork bytes differ/);
});

test('shared privacy text is derived from canonical HTML and unsupported markup fails explicitly', t => {
  const root = sourceFixture(t);
  const canonical = policyText(root);
  assert(canonical.includes('Optional donation links'));
  assert(canonical.includes('Buy Me a Coffee, a third-party website that processes data under its own privacy policy.'));
  assert(canonical.includes('Maskify does not send page content, detected email addresses, or saved settings through this link.'));
  const policy = path.join(root, 'privacy.html');
  fs.writeFileSync(policy, fs.readFileSync(policy, 'utf8').replace('</body>', '<p>Policy update.</p></body>'));
  for (const store of STORES) {
    assert(buildStoreFiles(root, store.id).get('privacy-policy.txt').toString('utf8').endsWith('Policy update.\n'));
  }
  fs.writeFileSync(policy, fs.readFileSync(policy, 'utf8').replace('</body>', '<script>unsupported()</script></body>'));
  assert.throws(() => policyText(root), /Unsupported privacy policy structure/);
});

test('each store has its exact required graphics and localized or shared screenshot set', () => {
  const specs = imageSpecs();
  assert.equal(specs.length, 22);
  for (const store of STORES) {
    const assets = specs.filter(spec => spec.store === store.id);
    const icon = assets.find(spec => spec.kind === 'icon');
    assert.deepEqual([icon.width, icon.height], store.id === 'edge' ? [300, 300] : [128, 128]);
    const screenshots = assets.filter(spec => spec.kind === 'screenshot');
    assert.equal(screenshots.length, store.id === 'firefox' ? 3 : 6);
    for (const image of screenshots) {
      assert.deepEqual([image.width, image.height], store.id === 'firefox' ? [2400, 1800] : [1280, 800]);
      assert.equal(image.locale === 'shared', store.id === 'firefox');
    }
    const promos = assets.filter(spec => spec.kind === 'promo');
    assert.equal(promos.length, store.id === 'firefox' ? 0 : 2);
    for (const promo of promos) {
      assert.equal(promo.required, store.id === 'chrome' && promo.width === 440);
      assert.equal(promo.locale, undefined);
    }
  }
});

test('copy conversion preserves the literal replacement marker and approved wording', () => {
  assert.equal(plainText('Click **Mask Emails** and use the `***` marker.'), 'Click Mask Emails and use the *** marker.');
  assert.equal(plainText('[Policy](privacy.html)'), 'Policy (https://mike-mo.github.io/maskify/privacy.html)');
  assert.equal(section('## One\n\nApproved.\n\n## Two\nDo not include.\n', 'One'), 'Approved.\n');
  assert.throws(() => section('## One\nText\n', 'Missing'), /Missing approved copy/);
});

test('promos are language-neutral and Firefox frames keep editorial captions outside the image', () => {
  const images = Object.fromEntries(['before', 'after', 'summary', 'link', 'fields', 'popup']
    .map(key => [key, Buffer.from('fixture')]));
  for (const kind of ['small', 'marquee']) {
    const html = promoHtml(kind);
    assert(html.includes('/brand.svg'));
    assert(!html.includes('before you share'));
  }
  for (const frame of ['result', 'coverage', 'controls']) {
    const html = amoHtml(frame, images);
    assert(html.includes('width:2400px;height:1800px'));
    assert(!html.includes(copy.en[frame].headline[0]));
    assert(!html.includes('<h1'));
  }
  assert.throws(() => amoHtml('unknown', images), /Unknown AMO frame/);
});

test('Chrome clear space is checked against painted pixels rather than canvas dimensions', () => {
  validateChromePadding({ left: 16, top: 21, right: 111, bottom: 106, width: 96, height: 86 });
  assert.throws(() => validateChromePadding({ left: 15, top: 20, right: 112, bottom: 107, width: 98, height: 88 }), /transparent pixels/);
  assert.throws(() => validateChromePadding({ left: 30, top: 30, right: 97, bottom: 97, width: 68, height: 68 }), /too small/);
});

test('format checks reject incorrect sizes and alpha channels in screenshots', () => {
  const source = fs.readFileSync(path.join(OUT, 'chrome', 'en', '01-result.png'));
  const spec = imageSpecs().find(image => image.store === 'chrome' && image.file === 'en/01-result.png');
  validateImage(source, spec);
  assert.throws(() => validateImage(source, { ...spec, width: 640 }), /incorrect width/);
  const alpha = Buffer.from(source);
  alpha[25] = 6;
  assert.throws(() => validateImage(alpha, spec), /opaque RGB/);
});

test('ZIP output is reproducible and preserves filenames, Unicode, and binary bytes', () => {
  const files = new Map([['es/copy.txt', Buffer.from(copy.es.useCases)], ['icon.png', Buffer.from([0, 1, 255])]]);
  const first = makeArchive(files);
  assert(first.equals(makeArchive(files)));
  const unpacked = unzipSync(first);
  assert.deepEqual(Object.keys(unpacked), [...files.keys()]);
  for (const [file, data] of files) assert(Buffer.from(unpacked[file]).equals(data));
});

test('saved store packs have matching source copies, exact image formats, and complete ZIPs', async () => {
  await check(OUT);
});

test('unexpected artwork cannot hide in an otherwise valid asset ZIP', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-store-pack-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(OUT, root, { recursive: true });
  const file = path.join(root, 'maskify-edge-assets.zip');
  const entries = new Map(Object.entries(unzipSync(fs.readFileSync(file))));
  entries.set('unexpected.png', Buffer.from('retired artwork'));
  fs.writeFileSync(file, makeArchive(entries));
  await assert.rejects(check(root), /generated bytes differ/);
});

test('source capture rejects unsupported locales and densities before starting a browser', async () => {
  await assert.rejects(captureSourceImages('unknown'), /Unsupported capture locale/);
  await assert.rejects(captureSourceImages('en', { deviceScaleFactor: 0 }), /Capture density/);
});

test('the gallery loads every image, stays responsive, and serves the complete downloads', async t => {
  const server = await startServer(previewRoutes(OUT));
  let browser;
  t.after(async () => {
    try {
      if (browser) await browser.close();
    } finally {
      await server.close();
    }
  });
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.origin);
  await page.evaluate(() => { for (const image of document.images) image.loading = 'eager'; });
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1400, 760, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Store gallery overflows at ${width}px`);
  }
  const links = await page.locator('a').evaluateAll(anchors =>
    [...new Set(anchors.filter(anchor => !anchor.getAttribute('href').startsWith('#')).map(anchor => anchor.href))]);
  for (const link of links) {
    const response = await page.request.get(link);
    assert.equal(response.status(), 200, `Broken gallery link: ${link}`);
    if (link.endsWith('.zip')) {
      assert.equal(response.headers()['content-type'], 'application/zip');
      assert((await response.body()).equals(fs.readFileSync(path.join(OUT, new URL(link).pathname.slice(1)))));
    }
  }
  await page.goto(pathToFileURL(path.join(OUT, 'index.html')).href);
  await page.evaluate(() => { for (const image of document.images) image.loading = 'eager'; });
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
  assert(await page.evaluate(() => [...document.fonts].some(font => font.family === 'Manrope' && font.status === 'loaded')),
    'Downloaded gallery must include its local font and stylesheet');
  assert.deepEqual(errors, []);
});
