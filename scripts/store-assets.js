'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { unzipSync } = require('fflate');
const { runtimeFiles, readCanonical, makeArchive } = require('./extension-package');
const { startServer } = require('./server');
const { pngDimensions, captureSourceImages } = require('./screenshot');
const { COMPOSED } = require('./release-screenshots');
const { promoHtml, iconHtml, amoHtml, uploadGuide, galleryHtml } = require('./store-templates');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'store-assets');
const APPROVAL = 'store-artwork/approved.json';
const LANGS = ['en', 'es'];
const PAGES = 'https://mike-mo.github.io/maskify/';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const STORES = [
  {
    id: 'edge', name: 'Microsoft Edge Add-ons', iconSize: 300,
    sources: ['https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension'],
  },
  {
    id: 'chrome', name: 'Chrome Web Store', iconSize: 128,
    sources: ['https://developer.chrome.com/docs/webstore/images/',
      'https://developer.chrome.com/docs/webstore/cws-dashboard-listing'],
  },
  {
    id: 'firefox', name: 'Firefox Add-ons', iconSize: 128,
    sources: [
      'https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/',
      'https://github.com/mozilla/addons-server/blob/c2404fb30b6f4f0d3935c47fe0e77fe01de0b0e8/src/olympia/devhub/templates/devhub/addons/forms_shared/media.html',
      'https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background',
    ],
  },
];
const TEXT_FILES = [
  'UPLOAD.md', 'privacy-policy.txt', 'reviewer-notes.txt', 'LICENSE.txt',
  ...LANGS.flatMap(lang => ['description.txt', 'description.md', 'listing-copy.json', 'captions.json'].map(file => `${lang}/${file}`)),
];
const LISTING_SOURCES = [
  'store-assets.md', 'privacy.html', 'LICENSE', 'scripts/store-assets.js',
  'scripts/store-gallery.css', 'scripts/extension-package.js', 'scripts/package-lock.json',
  'scripts/assets/Manrope-OFL.txt',
];

const diskPath = (root, file) => path.join(root, ...file.split('/'));
const hash = data => createHash('sha256').update(data).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

function artworkSources(root = ROOT) {
  const files = [...new Set([
    ...runtimeFiles(root), 'icons/maskify.svg', 'icons/maskify300x300.png',
    'scripts/copy.json', 'scripts/screenshot.js', 'scripts/templates.js',
    'scripts/demo.css', 'scripts/composition.css', 'scripts/assets/Manrope.ttf',
    'scripts/store-templates.js', 'scripts/store-compositions.css',
    ...LANGS.flatMap(lang => COMPOSED.map(frame => `screenshots/${lang}/${frame.file}`)),
  ])].sort();
  return Object.fromEntries(files.map(file => {
    let bytes = readCanonical(diskPath(root, file));
    if (file === 'manifest.json') {
      const manifest = JSON.parse(bytes);
      delete manifest.version;
      bytes = json(manifest);
    }
    return [file, hash(bytes)];
  }));
}

function sourceHashes(root = ROOT) {
  return Object.fromEntries([...new Set([
    ...LISTING_SOURCES, ...Object.keys(artworkSources(root)), ...imageSpecs(root).map(artworkFile), APPROVAL,
  ])].sort().map(file => [file, hash(readCanonical(diskPath(root, file)))]));
}

function imageSpecs(root = ROOT) {
  const copy = JSON.parse(readCanonical(path.join(root, 'scripts', 'copy.json')));
  return STORES.flatMap(store => [
    { store: store.id, file: `icon-${store.iconSize}.png`, kind: 'icon', label: 'Store icon',
      width: store.iconSize, height: store.iconSize, required: true },
    ...(store.id === 'firefox' ? [] : [
      { store: store.id, file: 'promo-small-440x280.png', kind: 'promo', label: 'Small promotional tile',
        width: 440, height: 280, required: store.id === 'chrome' },
      { store: store.id, file: 'promo-marquee-1400x560.png', kind: 'promo', label: 'Marquee promotional tile',
        width: 1400, height: 560, required: false },
    ]),
    ...(store.id === 'firefox' ? ['shared'] : LANGS).flatMap(locale => COMPOSED.map(frame => ({
      store: store.id, file: `${locale === 'shared' ? 'screenshots' : locale}/${frame.file}`,
      kind: 'screenshot', label: copy[locale === 'shared' ? 'en' : locale][frame.key].headline.join(' '),
      locale, frame: frame.key, required: true,
      width: store.id === 'firefox' ? 2400 : 1280, height: store.id === 'firefox' ? 1800 : 800,
    }))),
  ]);
}

function section(markdown, title) {
  const marker = `## ${title}\n`;
  const start = markdown.indexOf(marker);
  assert(start >= 0, `Missing approved copy section: ${title}`);
  const rest = markdown.slice(start + marker.length);
  const end = rest.indexOf('\n## ');
  return (end < 0 ? rest : rest.slice(0, end)).trim() + '\n';
}

function plainText(markdown) {
  return markdown.replace(/`([^`]+)`|\*\*([^*\n]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, code, bold, label, url) => code ?? bold ?? `${label} (${new URL(url, PAGES).href})`);
}

function policyText(root = ROOT) {
  const html = readCanonical(path.join(root, 'privacy.html')).toString('utf8');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1];
  assert(body, 'Privacy policy must have a body');
  const blocks = [...body.matchAll(/<(h1|h2|p)>([\s\S]*?)<\/\1>/g)];
  assert.equal(body.replace(/<(h1|h2|p)>[\s\S]*?<\/\1>/g, '').trim(), '',
    'Unsupported privacy policy structure; update the text renderer explicitly');
  return blocks.map(([, , content]) => content
    .replace(/<a href="([^"]+)">([\s\S]*?)<\/a>/g, (_match, url, label) => `${label} (${url})`)
    .replace(/<\/?(?:em|strong|code)>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()).map(content => {
    assert(!/<[^>]*>|&(?:#\d+|[a-z]+);/i.test(content), 'Unsupported policy markup/entity');
    return content;
  }).join('\n\n') + '\n';
}

function copyFiles(store, root = ROOT) {
  const markdown = readCanonical(path.join(root, 'store-assets.md')).toString('utf8');
  const copy = JSON.parse(readCanonical(path.join(root, 'scripts', 'copy.json')));
  const files = new Map([
    ['UPLOAD.md', Buffer.from(uploadGuide(store))],
    ['privacy-policy.txt', Buffer.from(policyText(root))],
    ['reviewer-notes.txt', Buffer.from(plainText(section(markdown, 'Certification Notes')))],
    ['LICENSE.txt', readCanonical(path.join(root, 'LICENSE'))],
  ]);
  for (const lang of LANGS) {
    const description = section(markdown, `Listing (${lang === 'en' ? 'English' : 'Spanish'})`);
    const messages = JSON.parse(readCanonical(path.join(root, '_locales', lang, 'messages.json')));
    const captions = Object.fromEntries(COMPOSED.map(frame => [
      `${store.id === 'firefox' ? 'screenshots' : lang}/${frame.file}`,
      `${copy[lang][frame.key].headline.join(' ')} ${copy[lang][frame.key].description}`,
    ]));
    files.set(`${lang}/description.md`, Buffer.from(description));
    files.set(`${lang}/description.txt`, Buffer.from(plainText(description)));
    files.set(`${lang}/captions.json`, json(captions));
    files.set(`${lang}/listing-copy.json`, json({
      name: messages.appName.message,
      summary: messages.appDescription.message,
      homepage_url: PAGES,
      support_url: 'https://github.com/mike-mo/maskify/issues',
      privacy_policy_url: new URL('privacy.html', PAGES).href,
    }));
  }
  return files;
}

function pngInfo(png) {
  const dimensions = pngDimensions(png);
  assert(png.length >= 33 && png.toString('ascii', 12, 16) === 'IHDR', 'Missing PNG header');
  return { ...dimensions, bitDepth: png[24], colorType: png[25] };
}

function validateImage(png, spec) {
  const info = pngInfo(png);
  assert.equal(info.width, spec.width, `${spec.file}: incorrect width`);
  assert.equal(info.height, spec.height, `${spec.file}: incorrect height`);
  assert.equal(info.bitDepth, 8, `${spec.file}: expected 8 bits per channel`);
  assert.equal(info.colorType, spec.kind === 'icon' ? 6 : 2,
    `${spec.file}: icons need RGBA; screenshots and promotions need opaque RGB`);
  assert(png.length < MAX_IMAGE_BYTES, `${spec.file}: exceeds our 2 MiB asset budget`);
}

async function pixelBounds(page, png) {
  return page.evaluate(async src => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (!data[(y * canvas.width + x) * 4 + 3]) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
  }, `data:image/png;base64,${png.toString('base64')}`);
}

function validateChromePadding(bounds) {
  assert(bounds.left >= 16 && bounds.top >= 16 && bounds.right <= 111 && bounds.bottom <= 111,
    `Chrome icon must have at least 16 transparent pixels on every side: ${JSON.stringify(bounds)}`);
  assert(Math.max(bounds.width, bounds.height) >= 94, 'Chrome icon is too small inside its safe area');
  assert(Math.abs(bounds.left + bounds.right - 127) <= 1 &&
    Math.abs(bounds.top + bounds.bottom - 127) <= 1, 'Chrome artwork must be centered');
}

async function renderScene(page, html, width, height, transparent = false) {
  await page.setViewportSize({ width, height });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  if (!transparent) assert(await page.evaluate(() => [...document.fonts].some(font =>
    font.family === 'Manrope' && font.status === 'loaded')), 'Manrope must load');
  const problems = await page.locator('.asset').evaluate(root => {
    const box = root.getBoundingClientRect();
    return [...root.querySelectorAll('img, [data-fit], .flow-arrow')].flatMap(node => {
      const rect = node.getBoundingClientRect();
      const errors = [];
      if (rect.left < box.left || rect.top < box.top || rect.right > box.right + 1 || rect.bottom > box.bottom + 1)
        errors.push(`${node.className}: outside frame`);
      if (node.scrollWidth > node.clientWidth + 1) errors.push(`${node.className}: clipped text`);
      if (node.classList.contains('native-ui')) {
        const style = getComputedStyle(node);
        const width = rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
        const height = rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
        const scale = Math.min(width / node.naturalWidth, height / node.naturalHeight);
        if (scale > 1.001) errors.push(`Captured UI is enlarged ${scale.toFixed(3)}x beyond its source pixels`);
      }
      return errors;
    });
  });
  assert.deepEqual(problems, [], 'Store composition does not fit');
  return page.screenshot({ scale: 'css', omitBackground: transparent, animations: 'disabled' });
}

function artworkFile(spec) {
  if (spec.kind === 'icon') return spec.store === 'chrome'
    ? 'store-artwork/chrome-icon-128.png' : `icons/maskify${spec.width}x${spec.width}.png`;
  if (spec.kind === 'promo') return `store-artwork/${spec.file}`;
  return spec.store === 'firefox' ? `store-artwork/firefox-${path.posix.basename(spec.file)}`
    : `screenshots/${spec.file}`;
}

function writeArtworkApproval(root = ROOT, migration) {
  const files = [...new Set(imageSpecs(root).map(artworkFile))].sort();
  const inventory = {
    schema_version: 1, capture_browser: 'Chromium', manifest_version_excluded: true,
    ...(migration ? { migration } : {}),
    sources: artworkSources(root),
    files: files.map(file => {
      const data = fs.readFileSync(diskPath(root, file));
      return { file, bytes: data.length, sha256: hash(data) };
    }),
  };
  fs.writeFileSync(diskPath(root, APPROVAL), json(inventory));
}

function verifyArtwork(root = ROOT) {
  const inventory = JSON.parse(readCanonical(diskPath(root, APPROVAL)));
  assert.equal(inventory.schema_version, 1, 'Unsupported artwork approval record');
  assert.equal(inventory.capture_browser, 'Chromium');
  assert.equal(inventory.manifest_version_excluded, true);
  assert.deepEqual(inventory.sources, artworkSources(root),
    'Artwork source inputs changed; review/capture artwork, not generated store copies');
  const expected = [...new Set(imageSpecs(root).map(artworkFile))].sort();
  assert.deepEqual(inventory.files.map(file => file.file), expected, 'Approved artwork inventory differs');
  for (const item of inventory.files) {
    const data = fs.readFileSync(diskPath(root, item.file));
    assert.equal(hash(data), item.sha256, `${item.file}: approved artwork bytes differ`);
    assert.equal(data.length, item.bytes);
  }
  const owned = fs.readdirSync(path.join(root, 'store-artwork')).sort();
  assert.deepEqual(owned, ['approved.json', ...expected.filter(file => file.startsWith('store-artwork/'))
    .map(file => path.posix.basename(file))].sort(), 'Unexpected artwork source file');
  return inventory;
}

function packInventory(store, files, sources, root = ROOT) {
  const specs = imageSpecs(root).filter(spec => spec.store === store.id);
  return {
    schema_version: 1, store: store.id, sources,
    text_line_endings: 'LF',
    capture_browser: 'Chromium',
    listing_media_only: true,
    files: [...files].map(([file, data]) => ({
      file, bytes: data.length, sha256: hash(data),
      ...specs.find(spec => spec.file === file),
    })),
  };
}

function buildStoreFiles(root, storeId) {
  const store = STORES.find(candidate => candidate.id === storeId);
  assert(store, `Unknown store: ${storeId}`);
  verifyArtwork(root);
  const files = copyFiles(store, root);
  for (const spec of imageSpecs(root).filter(spec => spec.store === storeId)) {
    const data = fs.readFileSync(diskPath(root, artworkFile(spec)));
    validateImage(data, spec);
    files.set(spec.file, data);
  }
  files.set('asset-inventory.json', json(packInventory(store, files, sourceHashes(root), root)));
  return files;
}

function buildStoreAssets(root = ROOT) {
  const output = new Map();
  for (const store of STORES) {
    const files = buildStoreFiles(root, store.id);
    for (const [file, data] of files) output.set(`${store.id}/${file}`, data);
    output.set(`maskify-${store.id}-assets.zip`, makeArchive(files));
  }
  output.set('index.html', Buffer.from(galleryHtml(STORES, imageSpecs(root))));
  for (const file of ['scripts/store-gallery.css', 'scripts/assets/Manrope.ttf', 'scripts/assets/Manrope-OFL.txt']) {
    output.set(file, readCanonical(diskPath(root, file)));
  }
  return output;
}

function writeStoreAssets(root = ROOT, output = OUT) {
  const files = buildStoreAssets(root);
  if (fs.existsSync(output)) {
    const existing = fs.readdirSync(output, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile()).map(entry =>
        path.relative(output, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
    assert(existing.every(file => files.has(file)), 'Unexpected output files; use a clean store build directory');
  }
  for (const [file, bytes] of files) {
    const destination = diskPath(output, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  }
  return files;
}

async function captureArtwork() {
  const sources = artworkSources();
  console.log('Capturing real UI for the shared Firefox gallery...');
  const captures = await captureSourceImages('en', { deviceScaleFactor: 3 });
  const server = await startServer(new Map([
    ['/', ['text/html', Buffer.from('<!doctype html><link rel="icon" href="/brand.svg">')]],
    ['/brand.svg', ['image/svg+xml', path.join(ROOT, 'icons', 'maskify.svg')]],
    ['/icons/maskify16x16.png', ['image/png', path.join(ROOT, 'icons', 'maskify16x16.png')]],
    ['/icons/maskify32x32.png', ['image/png', path.join(ROOT, 'icons', 'maskify32x32.png')]],
    ['/compositions.css', ['text/css', path.join(__dirname, 'store-compositions.css')]],
    ['/assets/Manrope.ttf', ['font/ttf', path.join(__dirname, 'assets', 'Manrope.ttf')]],
  ]));
  const output = new Map();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chromium', headless: true });
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.origin);
    const master = await renderScene(page, iconHtml(512), 512, 512, true);
    const bounds = await pixelBounds(page, master);
    // Fit painted bounds, rather than the SVG artboard, with a one-pixel raster margin.
    const scale = 94 / Math.max(bounds.width, bounds.height);
    const chromeIcon = await renderScene(page, iconHtml(128, {
      left: (128 - bounds.width * scale) / 2 - bounds.left * scale,
      top: (128 - bounds.height * scale) / 2 - bounds.top * scale,
      size: 512 * scale,
    }), 128, 128, true);
    validateChromePadding(await pixelBounds(page, chromeIcon));
    const promotions = {
      'promo-small-440x280.png': await renderScene(page, promoHtml('small'), 440, 280),
      'promo-marquee-1400x560.png': await renderScene(page, promoHtml('marquee'), 1400, 560),
    };
    const sharedScreenshots = {};
    for (const frame of COMPOSED) {
      console.log(`Composing shared ${frame.file}...`);
      sharedScreenshots[frame.file] = await renderScene(page, amoHtml(frame.key, captures), 2400, 1800);
    }
    output.set('store-artwork/chrome-icon-128.png', chromeIcon);
    for (const [file, data] of Object.entries(promotions)) output.set(`store-artwork/${file}`, data);
    for (const [file, data] of Object.entries(sharedScreenshots)) output.set(`store-artwork/firefox-${file}`, data);
    assert.deepEqual(errors, [], 'Browser errors during asset generation');
    assert.deepEqual(artworkSources(), sources, 'Inputs changed during capture; regenerate artwork');
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await server.close();
    }
  }
  for (const [file, data] of output) {
    const destination = diskPath(ROOT, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, data);
  }
  writeArtworkApproval();
  writeStoreAssets();
  await check();
  console.log('Captured new artwork and approval hashes. Review the image/source diff before merging.');
}

function previewRoutes(output = OUT) {
  const files = ['index.html', ...STORES.flatMap(store => [
    `maskify-${store.id}-assets.zip`, `${store.id}/asset-inventory.json`,
    ...TEXT_FILES.map(file => `${store.id}/${file}`),
    ...imageSpecs().filter(spec => spec.store === store.id).map(spec => `${store.id}/${spec.file}`),
  ])];
  const types = { '.html': 'text/html', '.md': 'text/plain', '.txt': 'text/plain',
    '.json': 'application/json', '.png': 'image/png', '.zip': 'application/zip' };
  return new Map([
    ['/', ['text/html; charset=utf-8', path.join(output, 'index.html')]],
    ...files.map(file => [`/${file}`, [`${types[path.extname(file)]}${/\.(html|md|txt|json)$/.test(file) ? '; charset=utf-8' : ''}`, diskPath(output, file)]]),
    ['/scripts/store-gallery.css', ['text/css', path.join(output, 'scripts', 'store-gallery.css')]],
    ['/scripts/assets/Manrope.ttf', ['font/ttf', path.join(output, 'scripts', 'assets', 'Manrope.ttf')]],
    ['/scripts/assets/Manrope-OFL.txt', ['text/plain; charset=utf-8', path.join(output, 'scripts', 'assets', 'Manrope-OFL.txt')]],
  ]);
}

async function check(output = OUT, root = ROOT) {
  const expectedFiles = buildStoreAssets(root);
  const actualFiles = fs.readdirSync(output, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry =>
      path.relative(output, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
  assert.deepEqual(actualFiles.sort(), [...expectedFiles.keys()].sort(), 'Unexpected or missing store build output');
  for (const [file, bytes] of expectedFiles) {
    assert(readCanonical(diskPath(output, file)).equals(bytes), `${file}: generated bytes differ from canonical sources`);
  }
  const sources = sourceHashes(root);
  for (const store of STORES) {
    const directory = path.join(output, store.id);
    const inventory = JSON.parse(readCanonical(path.join(directory, 'asset-inventory.json')));
    assert.deepEqual(inventory.sources, sources, 'Store pack inputs changed; run npm run stores');
    const specs = imageSpecs(root).filter(spec => spec.store === store.id);
    const expected = [...TEXT_FILES, ...specs.map(spec => spec.file)].sort();
    assert.deepEqual(inventory.files.map(file => file.file).sort(), expected, `${store.id}: incomplete inventory`);
    const packaged = [...expected, 'asset-inventory.json'].sort();
    const loose = fs.readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
    assert.deepEqual(loose.sort(), packaged, `${store.id}: unexpected or missing files`);
    const archive = unzipSync(fs.readFileSync(path.join(output, `maskify-${store.id}-assets.zip`)), {
      filter: entry => {
        assert(packaged.includes(entry.name), `${store.id}: unexpected ZIP member ${entry.name}`);
        assert(entry.originalSize < 8 * MAX_IMAGE_BYTES, `${store.id}: oversized ZIP member ${entry.name}`);
        return true;
      },
    });
    assert.deepEqual(Object.keys(archive).sort(), packaged, `${store.id}: incomplete ZIP`);
    for (const item of [...inventory.files, { file: 'asset-inventory.json' }]) {
      const data = readCanonical(diskPath(directory, item.file));
      if (item.sha256) {
        assert.equal(hash(data), item.sha256, `${store.id}/${item.file}: changed bytes`);
        assert.equal(data.length, item.bytes);
      }
      assert(Buffer.from(archive[item.file]).equals(data), `${store.id}/${item.file}: ZIP differs from loose file`);
      const spec = specs.find(candidate => candidate.file === item.file);
      if (spec) {
        validateImage(data, spec);
        if (spec.kind === 'screenshot' && store.id !== 'firefox')
          assert(data.equals(fs.readFileSync(diskPath(path.join(root, 'screenshots'), spec.file))), 'Approved screenshots must remain unchanged');
      }
    }
    for (const lang of LANGS) {
      const fields = JSON.parse(readCanonical(path.join(directory, lang, 'listing-copy.json')));
      assert(fields.summary.length > 0 && fields.summary.length <= 132);
      for (const caption of Object.values(JSON.parse(readCanonical(path.join(directory, lang, 'captions.json')))))
        assert(caption.length > 0 && caption.length <= 250, 'Caption exceeds the shared copy budget');
    }
  }
  assert.equal(readCanonical(path.join(output, 'index.html')).toString('utf8'), galleryHtml(STORES, imageSpecs(root)));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chromium', headless: true });
    const page = await browser.newPage();
    validateChromePadding(await pixelBounds(page, fs.readFileSync(path.join(output, 'chrome', 'icon-128.png'))));
  } finally {
    if (browser) await browser.close();
  }
  console.log('Verified all store image formats, dimensions, source copies, padding, and ZIP contents.');
}

async function preview() {
  writeStoreAssets();
  const server = await startServer(previewRoutes());
  console.log(`Store asset gallery: ${server.origin}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close().catch(error => {
    console.error(error); process.exitCode = 1;
  }));
}

if (require.main === module) {
  const command = process.argv[2];
  if (process.argv.length > 3 || (command && !['--preview', '--check', '--capture'].includes(command))) {
    console.error('Use --preview, --check, --capture (new artwork), or no option to build listing artifacts.');
    process.exitCode = 1;
  } else {
    (async () => {
      if (command === '--preview') await preview();
      else if (command === '--check') await check();
      else if (command === '--capture') await captureArtwork();
      else { writeStoreAssets(); console.log(`Built listing packs and gallery at ${OUT}; no artwork recaptured.`); }
    })().catch(error => {
      console.error(error); process.exitCode = 1;
    });
  }
}

module.exports = {
  STORES, LANGS, TEXT_FILES, imageSpecs, section, plainText, pngInfo, validateImage,
  validateChromePadding, copyFiles, makeArchive, check, previewRoutes,
  policyText, artworkFile, artworkSources, sourceHashes, verifyArtwork, writeArtworkApproval,
  buildStoreFiles, buildStoreAssets, writeStoreAssets,
};
