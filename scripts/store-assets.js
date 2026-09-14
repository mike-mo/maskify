'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { zipSync, unzipSync } = require('fflate');
const { startServer } = require('./server');
const { pngDimensions, captureSourceImages } = require('./screenshot');
const { COMPOSED } = require('./release-screenshots');
const { promoHtml, iconHtml, amoHtml, uploadGuide, galleryHtml } = require('./store-templates');
const copy = require('./copy');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'store-assets');
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
const SOURCE_FILES = [
  'icons/maskify.svg', 'icons/maskify128x128.png', 'icons/maskify300x300.png',
  'store-assets.md', 'privacy.html', 'LICENSE', 'manifest.json', 'popup/popup.html', 'popup/popup.js',
  'content-scripts/content.js', 'scripts/copy.js', 'scripts/screenshot.js', 'scripts/templates.js',
  'scripts/demo.css', 'scripts/assets/Manrope.ttf', 'scripts/store-assets.js',
  'scripts/store-templates.js', 'scripts/store-compositions.css', 'scripts/store-gallery.css',
  ...LANGS.flatMap(lang => [
    `_locales/${lang}/messages.json`, ...COMPOSED.map(frame => `screenshots/${lang}/${frame.file}`),
  ]),
];

const diskPath = (root, file) => path.join(root, ...file.split('/'));
const hash = data => createHash('sha256').update(data).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

function readCanonical(file) {
  const bytes = fs.readFileSync(file);
  return /\.(md|txt|json|js|css|html|svg)$/i.test(file) || path.basename(file) === 'LICENSE'
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes;
}

function sourceHashes() {
  return Object.fromEntries(SOURCE_FILES.map(file => [file, hash(readCanonical(diskPath(ROOT, file)))]));
}

function imageSpecs() {
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

function copyFiles(store, policy) {
  const markdown = readCanonical(path.join(ROOT, 'store-assets.md')).toString('utf8');
  const files = new Map([
    ['UPLOAD.md', Buffer.from(uploadGuide(store))],
    ['privacy-policy.txt', Buffer.from(policy.trim() + '\n')],
    ['reviewer-notes.txt', Buffer.from(plainText(section(markdown, 'Certification Notes')))],
    ['LICENSE.txt', readCanonical(path.join(ROOT, 'LICENSE'))],
  ]);
  for (const lang of LANGS) {
    const description = section(markdown, `Listing (${lang === 'en' ? 'English' : 'Spanish'})`);
    const messages = JSON.parse(readCanonical(path.join(ROOT, '_locales', lang, 'messages.json')));
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

function packInventory(store, files, sources) {
  const specs = imageSpecs().filter(spec => spec.store === store.id);
  return {
    schema_version: 1, store: store.id, sources,
    text_line_endings: 'LF',
    capture_browser: 'Chromium',
    firefox_package_status: 'Requires a compatible background script and Firefox verification before submission.',
    files: [...files].map(([file, data]) => ({
      file, bytes: data.length, sha256: hash(data),
      ...specs.find(spec => spec.file === file),
    })),
  };
}

function makeArchive(files) {
  return Buffer.from(zipSync(Object.fromEntries(files), { level: 6, mtime: new Date(2000, 0, 1) }));
}

async function generate() {
  const sources = sourceHashes();
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
    await page.setContent(readCanonical(path.join(ROOT, 'privacy.html')).toString('utf8'));
    const policy = await page.evaluate(() => {
      for (const link of document.querySelectorAll('a')) link.replaceWith(`${link.textContent} (${link.href})`);
      return document.body.innerText;
    });
    for (const store of STORES) {
      const files = copyFiles(store, policy);
      for (const spec of imageSpecs().filter(spec => spec.store === store.id)) {
        let data;
        if (spec.kind === 'icon') {
          data = store.id === 'chrome' ? chromeIcon
            : fs.readFileSync(path.join(ROOT, 'icons', `maskify${store.iconSize}x${store.iconSize}.png`));
        } else if (spec.kind === 'promo') {
          data = promotions[spec.file];
        } else {
          data = store.id === 'firefox' ? sharedScreenshots[path.posix.basename(spec.file)]
            : fs.readFileSync(diskPath(path.join(ROOT, 'screenshots'), spec.file));
        }
        validateImage(data, spec);
        files.set(spec.file, data);
      }
      files.set('asset-inventory.json', json(packInventory(store, files, sources)));
      for (const [file, data] of files) output.set(`${store.id}/${file}`, data);
      output.set(`maskify-${store.id}-assets.zip`, makeArchive(files));
    }
    output.set('index.html', Buffer.from(galleryHtml(STORES, imageSpecs())));
    assert.deepEqual(errors, [], 'Browser errors during asset generation');
    assert.deepEqual(sourceHashes(), sources, 'Inputs changed during capture; regenerate the store packs');
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await server.close();
    }
  }
  for (const [file, data] of output) {
    const destination = diskPath(OUT, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, data);
  }
  await check();
  console.log(`Saved store packs and download gallery to ${OUT}`);
}

function previewRoutes() {
  const files = ['index.html', ...STORES.flatMap(store => [
    `maskify-${store.id}-assets.zip`, `${store.id}/asset-inventory.json`,
    ...TEXT_FILES.map(file => `${store.id}/${file}`),
    ...imageSpecs().filter(spec => spec.store === store.id).map(spec => `${store.id}/${spec.file}`),
  ])];
  const types = { '.html': 'text/html', '.md': 'text/plain', '.txt': 'text/plain',
    '.json': 'application/json', '.png': 'image/png', '.zip': 'application/zip' };
  return new Map([
    ['/', ['text/html; charset=utf-8', path.join(OUT, 'index.html')]],
    ...files.map(file => [`/${file}`, [`${types[path.extname(file)]}${/\.(html|md|txt|json)$/.test(file) ? '; charset=utf-8' : ''}`, diskPath(OUT, file)]]),
    ['/scripts/store-gallery.css', ['text/css', path.join(__dirname, 'store-gallery.css')]],
    ['/scripts/assets/Manrope.ttf', ['font/ttf', path.join(__dirname, 'assets', 'Manrope.ttf')]],
  ]);
}

async function check(root = OUT) {
  const sources = sourceHashes();
  for (const store of STORES) {
    const directory = path.join(root, store.id);
    const inventory = JSON.parse(readCanonical(path.join(directory, 'asset-inventory.json')));
    assert.deepEqual(inventory.sources, sources, 'Store pack inputs changed; run npm run stores');
    const specs = imageSpecs().filter(spec => spec.store === store.id);
    const expected = [...TEXT_FILES, ...specs.map(spec => spec.file)].sort();
    assert.deepEqual(inventory.files.map(file => file.file).sort(), expected, `${store.id}: incomplete inventory`);
    const packaged = [...expected, 'asset-inventory.json'].sort();
    const loose = fs.readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
    assert.deepEqual(loose.sort(), packaged, `${store.id}: unexpected or missing files`);
    const archive = unzipSync(fs.readFileSync(path.join(root, `maskify-${store.id}-assets.zip`)), {
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
          assert(data.equals(fs.readFileSync(diskPath(path.join(ROOT, 'screenshots'), spec.file))), 'Approved screenshots must remain unchanged');
      }
    }
    for (const lang of LANGS) {
      const fields = JSON.parse(readCanonical(path.join(directory, lang, 'listing-copy.json')));
      assert(fields.summary.length > 0 && fields.summary.length <= 132);
      for (const caption of Object.values(JSON.parse(readCanonical(path.join(directory, lang, 'captions.json')))))
        assert(caption.length > 0 && caption.length <= 250, 'Caption exceeds the shared copy budget');
    }
  }
  assert.equal(readCanonical(path.join(root, 'index.html')).toString('utf8'), galleryHtml(STORES, imageSpecs()));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chromium', headless: true });
    const page = await browser.newPage();
    validateChromePadding(await pixelBounds(page, fs.readFileSync(path.join(root, 'chrome', 'icon-128.png'))));
  } finally {
    if (browser) await browser.close();
  }
  console.log('Verified all store image formats, dimensions, source copies, padding, and ZIP contents.');
}

async function preview() {
  const server = await startServer(previewRoutes());
  console.log(`Store asset gallery: ${server.origin}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close().catch(error => {
    console.error(error); process.exitCode = 1;
  }));
}

if (require.main === module) {
  const command = process.argv[2];
  if (process.argv.length > 3 || (command && !['--preview', '--check'].includes(command))) {
    console.error('Use --preview to serve, --check to verify, or no option to generate all three store packs.');
    process.exitCode = 1;
  } else {
    (command === '--preview' ? preview() : command === '--check' ? check() : generate()).catch(error => {
      console.error(error); process.exitCode = 1;
    });
  }
}

module.exports = {
  STORES, LANGS, TEXT_FILES, imageSpecs, section, plainText, pngInfo, validateImage,
  validateChromePadding, copyFiles, makeArchive, check, previewRoutes,
};
