'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./server');
const { pngDimensions } = require('./screenshot');

const OUT = path.resolve(__dirname, '..', 'icons');
const SIZES = [16, 32, 48, 64, 128, 300];
const filename = size => `maskify${size}x${size}.png`;

function iconImage(size) {
  const densitySize = SIZES.find(candidate => candidate >= size * 2);
  const srcset = densitySize ? ` srcset="${filename(densitySize)} ${densitySize / size}x"` : '';
  return `<img src="${filename(size)}"${srcset} alt="Maskify at ${size} pixels" width="${size}" height="${size}">`;
}

function galleryHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Maskify icon</title>
  <link rel="icon" href="maskify32x32.png">
  <link rel="stylesheet" href="gallery.css">
</head>
<body>
<main>
  <header>
    <img src="maskify.svg" alt="Maskify: a blue envelope with an asterisk seal" width="128" height="128">
    <div><h1>Maskify icon</h1><p>The same envelope and asterisk seal, from the browser toolbar to the store listing.</p></div>
  </header>
  <section aria-labelledby="toolbar-heading">
    <h2 id="toolbar-heading">In the toolbar</h2>
    <div class="toolbars">
      ${['light', 'dark'].map(theme => `<div class="toolbar ${theme}">
        <span>${theme === 'light' ? 'Light' : 'Dark'} toolbar</span>
        ${iconImage(16)}${iconImage(32)}
      </div>`).join('')}
    </div>
    <p class="caption">16 px and 32 px at actual size, with sharper exports for high-DPI displays.</p>
  </section>
  <section aria-labelledby="downloads-heading">
    <h2 id="downloads-heading">Source and exports</h2>
    <p>Use the 300-pixel logo for both language listings in the Edge store. All PNGs have transparent backgrounds.</p>
    <div class="downloads">
      <a href="maskify.svg" download>SVG source</a>
      ${SIZES.map(size => `<a href="${filename(size)}" download>${size} px PNG</a>`).join('')}
    </div>
  </section>
  <footer>The seal represents email replacement, not encryption or signed mail.</footer>
</main>
</body>
</html>`;
}

function routes() {
  return new Map([
    ['/', ['text/html; charset=utf-8', path.join(OUT, 'index.html')]],
    ['/gallery.css', ['text/css; charset=utf-8', path.join(OUT, 'gallery.css')]],
    ['/maskify.svg', ['image/svg+xml', path.join(OUT, 'maskify.svg')]],
    ['/scripts/assets/Manrope.ttf', ['font/ttf', path.join(__dirname, 'assets', 'Manrope.ttf')]],
    ...SIZES.map(size => [`/${filename(size)}`, ['image/png', path.join(OUT, filename(size))]]),
  ]);
}

async function waitForImages(page) {
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
}

async function validatePixels(page, png, size, existing) {
  const stats = await page.evaluate(async ({ src, size, current }) => {
    async function pixels(source) {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, size, size).data;
    }
    const data = await pixels(src);
    let visible = 0;
    let touchesEdge = false;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (data[(y * size + x) * 4 + 3] > 0) {
          visible++;
          if (x === 0 || y === 0 || x === size - 1 || y === size - 1) touchesEdge = true;
        }
      }
    }
    let maxDifference = 0;
    let maxCompositeDifference = 0;
    let maxAlphaDifference = 0;
    let worstPixel;
    if (current) {
      const saved = await pixels(current);
      for (let i = 0; i < data.length; i++) {
        const difference = Math.abs(data[i] - saved[i]);
        if (difference > maxDifference) {
          maxDifference = difference;
          const offset = i - i % 4;
          worstPixel = { x: offset / 4 % size, y: Math.floor(offset / 4 / size),
            rendered: [...data.slice(offset, offset + 4)], saved: [...saved.slice(offset, offset + 4)] };
        }
      }
      for (let i = 0; i < data.length; i += 4) {
        maxAlphaDifference = Math.max(maxAlphaDifference, Math.abs(data[i + 3] - saved[i + 3]));
        for (const background of [0, 255]) {
          for (let channel = 0; channel < 3; channel++) {
            const render = background + (data[i + channel] - background) * data[i + 3] / 255;
            const reference = background + (saved[i + channel] - background) * saved[i + 3] / 255;
            maxCompositeDifference = Math.max(maxCompositeDifference, Math.abs(render - reference));
          }
        }
      }
    }
    return { visible, touchesEdge, maxDifference, maxAlphaDifference, maxCompositeDifference, worstPixel };
  }, {
    src: `data:image/png;base64,${png.toString('base64')}`,
    current: existing && `data:image/png;base64,${existing.toString('base64')}`,
    size,
  });
  assert.equal(stats.touchesEdge, false, `${filename(size)} needs a transparent margin`);
  assert(stats.visible > size * size * 0.2 && stats.visible < size * size * 0.85,
    `${filename(size)} has implausible artwork coverage`);
  // Allow minor rasterizer rounding at antialiased edges, not different artwork.
  assert(stats.maxDifference <= 2, `${filename(size)} differs from maskify.svg: ${JSON.stringify(stats)}`);
}

async function validateGallery(browser, origin) {
  for (const deviceScaleFactor of [1, 2]) {
    const context = await browser.newContext({
      viewport: { width: 980, height: 800 }, deviceScaleFactor,
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin);
      await waitForImages(page);
      assert(await page.evaluate(() => [...document.fonts].some(font =>
        font.family === 'Manrope' && font.status === 'loaded')));
      const samples = await page.locator('.toolbar img').evaluateAll(images =>
        images.map(image => ({
          size: image.width, width: image.getBoundingClientRect().width,
          height: image.getBoundingClientRect().height, source: image.currentSrc,
        })));
      assert.equal(samples.length, 4);
      for (const sample of samples) {
        assert.equal(sample.width, sample.size);
        assert.equal(sample.height, sample.size);
        const sourceSize = SIZES.find(size => sample.source.endsWith(filename(size)));
        // Browsers can reuse an already-loaded higher-density candidate at 1x.
        assert(sourceSize !== undefined && sourceSize >= sample.size * deviceScaleFactor,
          `Insufficient ${deviceScaleFactor}x source for ${sample.size}px toolbar image: ${sample.source}`);
      }
      for (const width of [980, 390, 320]) {
        await page.setViewportSize({ width, height: 800 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `Icon gallery overflows at ${width}px`);
      }
      assert.deepEqual(errors, [], 'Icon gallery has browser errors');
    } finally {
      await context.close();
    }
  }
}

async function render({ check = false } = {}) {
  const input = routes();
  input.set('/render', ['text/html', Buffer.from('<!doctype html><html><head><link rel="icon" href="/maskify.svg"></head><body></body></html>')]);
  const server = await startServer(input);
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chromium', headless: true });
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    page.setDefaultTimeout(15000);
    const outputs = new Map();
    for (const size of SIZES) {
      await page.setViewportSize({ width: size, height: size });
      await page.goto(`${server.origin}/render`);
      await page.setContent(`<!doctype html><html><head><link rel="icon" href="/maskify.svg"><style>
        html,body{margin:0;padding:0;background:transparent;width:${size}px;height:${size}px;overflow:hidden}
        img{display:block;width:${size}px;height:${size}px}
      </style></head><body><img src="/maskify.svg" alt=""></body></html>`);
      await waitForImages(page);
      const png = await page.screenshot({ omitBackground: true, scale: 'css' });
      assert.deepEqual(pngDimensions(png), { width: size, height: size });
      const existing = check ? fs.readFileSync(path.join(OUT, filename(size))) : undefined;
      if (existing) assert.deepEqual(pngDimensions(existing), { width: size, height: size });
      await validatePixels(page, png, size, existing);
      outputs.set(filename(size), png);
    }
    await page.close();
    const html = galleryHtml();
    if (check) {
      assert.equal(fs.readFileSync(path.join(OUT, 'index.html'), 'utf8').replace(/\r\n/g, '\n'), html,
        'Icon gallery is out of date; run npm run icons');
    } else {
      for (const [file, png] of outputs) fs.writeFileSync(path.join(OUT, file), png);
      fs.writeFileSync(path.join(OUT, 'index.html'), html);
    }
    await validateGallery(browser, server.origin);
    console.log(`${check ? 'Verified' : 'Rendered'} Maskify icons: ${SIZES.join(', ')} px`);
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await server.close();
    }
  }
}

async function preview() {
  const server = await startServer(routes());
  console.log(`Maskify icon preview: ${server.origin}`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close().catch(error => {
      console.error(error);
      process.exitCode = 1;
    }));
  }
}

if (require.main === module) {
  const command = process.argv[2];
  if (process.argv.length > 3 || (command && !['--preview', '--check'].includes(command))) {
    console.error('Use --preview to serve the icon gallery, --check to verify exports, or no option to regenerate all Maskify icons.');
    process.exitCode = 1;
  } else {
    (command === '--preview' ? preview() : render({ check: command === '--check' })).catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}

module.exports = { SIZES, filename, galleryHtml, render };
