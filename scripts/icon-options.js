'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./server');
const { pngDimensions } = require('./screenshot');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'design', 'icon-options');
const SIZES = [16, 32, 48, 128];
const DENSITY_SIZES = [16, 32, 48, 64, 128];
const ORIGINAL_CONCEPTS = [
  {
    id: 'mask', title: 'Simple mask',
    description: 'A single, clear mask silhouette. Keeps the personality of Maskify without the shield or facial details.',
    detail: 'Feedback: too close to private browsing.',
  },
  {
    id: 'masked-mail', title: 'Masked mail',
    description: 'An envelope with an obscured-address badge. The most direct connection to email masking.',
    detail: 'Feedback: reads as mail; dots add little.',
  },
  {
    id: 'replacement-mark', title: 'Replacement mark',
    description: 'An asterisk drawn from the *** replacement marker. A bold, compact shape that stays simple at small sizes.',
    detail: 'Feedback: too generic on its own.',
  },
  {
    id: 'monogram', title: 'Maskify M',
    description: 'An open, two-tone M with a folded diagonal. A name-led identity rather than a privacy symbol.',
    detail: 'Feedback: too close to Gmail.',
  },
].map((concept, i) => ({ ...concept, letter: String.fromCharCode(65 + i), sizes: SIZES }));

const HYBRID_CONCEPTS = [
  {
    id: 'flap-mask', title: 'Flap mask', family: 'Mask + envelope',
    description: 'The envelope flap becomes the brow. Two eye openings are cut into the same shape, with no extra badge.',
    detail: 'Feedback: reads as an angry envelope.',
  },
  {
    id: 'fold-mask', title: 'Fold mask', family: 'Mask + envelope',
    description: 'The folded flap is the mask. Its edge forms the brow, cheeks, and bridge inside an open envelope outline.',
    detail: 'The most literal fusion of mask and mail.',
  },
  {
    id: 'bridge-m', title: 'Bridge M', family: 'Mask + M',
    description: 'The M shoulders surround the eyes. Its middle forms the nose bridge, while the upright stems retain the letter.',
    detail: 'Mask/M construction did not read as intended.',
  },
  {
    id: 'contour-m', title: 'Contour M', family: 'Mask + M',
    description: 'An open M contour loops around the eyes. The mask and letter share the same strokes.',
    detail: 'Mask/M construction did not read as intended.',
  },
].map((concept, i) => ({ ...concept, letter: String.fromCharCode(69 + i), sizes: DENSITY_SIZES }));

const SEAL_CONCEPTS = [
  {
    id: 'round-seal', title: 'Round seal', family: 'Solid envelope + circular stamp', selected: true,
    description: 'A dark asterisk seal closes the blue envelope. A thin rim separates the stamp from the paper.',
    detail: 'The simplest, most direct combination of B + C.',
  },
  {
    id: 'wax-seal', title: 'Wax edge', family: 'Pale envelope + wax stamp',
    description: 'A slightly uneven wax edge around the asterisk. Pale paper gives the blue seal more contrast.',
    detail: 'More of a physical wax-seal character.',
  },
  {
    id: 'outline-seal', title: 'Outline envelope', family: 'Open envelope + circular stamp',
    description: 'The envelope is drawn as an outline, leaving the replacement mark as the main solid shape.',
    detail: 'A lighter treatment with space around the stamp.',
  },
].map((concept, i) => ({ ...concept, letter: String.fromCharCode(73 + i), sizes: DENSITY_SIZES }));

const CONCEPTS = [...SEAL_CONCEPTS, ...HYBRID_CONCEPTS, ...ORIGINAL_CONCEPTS];

function iconImage(concept, size, alt) {
  const densitySize = concept.sizes.find(candidate => candidate >= size * 2);
  const srcset = densitySize ? ` srcset="${concept.id}-${densitySize}.png ${densitySize / size}x"` : '';
  return `<img src="${concept.id}-${size}.png"${srcset} alt="${alt}" width="${size}" height="${size}">`;
}

function optionHtml(concept) {
  const pin = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3 6 0-1 6 4 4v2h-5v6l-2-2v-4H6v-2l4-4-1-6Z"/></svg>';
  const menu = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';
  return `
    <article class="option${concept.selected ? ' selected' : ''}" id="${concept.id}">
      <div class="option-heading"><h3>${concept.title}</h3><span class="letter">${concept.letter}${concept.selected ? ' (selected)' : ''}</span></div>
${concept.family ? `      <p class="family">${concept.family}</p>` : ''}
      <div class="artwork"><img src="${concept.id}-128.png" alt="${concept.title}" width="128" height="128"></div>
      <p class="description">${concept.description}<span class="detail">${concept.detail}</span></p>
      <div class="toolbars" aria-label="Toolbar previews">
        ${['light', 'dark'].map(theme => `<div class="toolbar ${theme}">
          <span class="toolbar-label">${theme === 'light' ? 'Light' : 'Dark'} toolbar</span>
          <span class="toolbar-icon">${iconImage(concept, 16, `${concept.title} at 16 CSS pixels`)}</span>
          <span class="toolbar-icon large">${iconImage(concept, 32, `${concept.title} at 32 CSS pixels`)}</span>
          ${pin}${menu}
        </div>`).join('')}
      </div>
      <p class="toolbar-caption">16 px and 32 px, shown at actual size</p>
      <div class="sizes" aria-label="Native-size PNG previews">
        ${[16, 32, 48].map(size => `<div class="size">${iconImage(concept, size, `${concept.title} at ${size} CSS pixels`)}<span>${size} px</span></div>`).join('')}
      </div>
      <div class="links">
        <a href="${concept.id}.svg" download>SVG</a>
        ${concept.sizes.map(size => `<a href="${concept.id}-${size}.png" download aria-label="Download ${concept.title}, ${size}-pixel PNG">${size}</a>`).join('')}
      </div>
      <p>SVG source + transparent PNG exports</p>
    </article>`;
}

function galleryHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Maskify icon options</title>
  <link rel="icon" href="round-seal-32.png">
  <link rel="stylesheet" href="gallery.css">
</head>
<body>
<main>
  <header>
    <div><h1>An asterisk seal for Maskify</h1><p class="intro">B's envelope, closed with C's asterisk. Three stamp treatments, all centered on the flap join. No eyes, monograms, or notification dots.</p></div>
    <div class="current"><img src="../../icons/maskify128x128.png" alt="Selected Maskify icon"><div><strong>Selected icon</strong><span>I, Round seal</span></div></div>
  </header>
  <section aria-labelledby="seal-heading">
    <h2 id="seal-heading" class="round-heading">Envelope + asterisk seal, I-K</h2>
    <div class="options options--three">${SEAL_CONCEPTS.map(optionHtml).join('')}</div>
  </section>
  <p class="recommendation"><strong>Selected: I, Round seal.</strong> The solid blue envelope and dark asterisk seal are the production artwork. The seal represents email replacement, not encryption or signed mail.</p>
  <details class="earlier">
    <summary>Previous mask hybrids, E-H</summary>
    <p class="earlier-note">Kept for reference while exploring the envelope + asterisk direction.</p>
    <div class="options">${HYBRID_CONCEPTS.map(optionHtml).join('')}</div>
  </details>
  <details class="earlier">
    <summary>Earlier proposals, A-D</summary>
    <p class="earlier-note">Kept for comparison. Your feedback is recorded with each option.</p>
    <div class="options">${ORIGINAL_CONCEPTS.map(optionHtml).join('')}</div>
  </details>
  <footer><span>Round seal (I) is the chosen production artwork. Other designs are retained for reference.</span><a href="comparison.png" download>Download this comparison</a></footer>
</main>
</body>
</html>`;
}

function routes(includeOutputs) {
  const entries = [
    ['/', ['text/html; charset=utf-8', path.join(OUT, 'index.html')]],
    ['/gallery.css', ['text/css; charset=utf-8', path.join(OUT, 'gallery.css')]],
    ['/icons/maskify128x128.png', ['image/png', path.join(ROOT, 'icons', 'maskify128x128.png')]],
    ['/scripts/assets/Manrope.ttf', ['font/ttf', path.join(__dirname, 'assets', 'Manrope.ttf')]],
    ...CONCEPTS.map(({ id }) => [`/${id}.svg`, ['image/svg+xml', path.join(OUT, `${id}.svg`)]]),
  ];
  if (includeOutputs) {
    entries.push(
      ['/comparison.png', ['image/png', path.join(OUT, 'comparison.png')]],
      ...CONCEPTS.flatMap(({ id, sizes }) => sizes.map(size => [
        `/${id}-${size}.png`, ['image/png', path.join(OUT, `${id}-${size}.png`)],
      ])),
    );
  }
  return new Map(entries);
}

async function waitForImages(page) {
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
}

async function validatePixels(page, src, size, checkEyes) {
  const stats = await page.evaluate(async ({ src, size, checkEyes }) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, size, size);
    let visible = 0;
    let touchesEdge = false;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const alpha = data[(y * size + x) * 4 + 3];
        if (alpha > 0) {
          visible++;
          if (x === 0 || y === 0 || x === size - 1 || y === size - 1) touchesEdge = true;
        }
      }
    }
    const eyeOpenings = [];
    if (checkEyes && size === 16) {
      const seen = new Set();
      for (let start = 0; start < size * size; start++) {
        if (seen.has(start) || data[start * 4 + 3] > 32) continue;
        const queue = [start];
        const pixels = [];
        seen.add(start);
        for (let i = 0; i < queue.length; i++) {
          const pixel = queue[i], x = pixel % size, y = Math.floor(pixel / size);
          pixels.push([x, y]);
          for (const [a, b] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            const next = b * size + a;
            if (a >= 0 && a < size && b >= 0 && b < size && !seen.has(next) && data[next * 4 + 3] <= 32) {
              seen.add(next);
              queue.push(next);
            }
          }
        }
        if (pixels.length < 2 || pixels.some(([x, y]) => x === 0 || y === 0 || x === 15 || y === 15)) continue;
        const minX = Math.min(...pixels.map(pixel => pixel[0]));
        const maxX = Math.max(...pixels.map(pixel => pixel[0]));
        const minY = Math.min(...pixels.map(pixel => pixel[1]));
        const maxY = Math.max(...pixels.map(pixel => pixel[1]));
        if (minY >= 5 && maxY <= 10) {
          if (minX >= 3 && maxX <= 6) eyeOpenings.push('left');
          if (minX >= 9 && maxX <= 12) eyeOpenings.push('right');
        }
      }
    }
    return { width: image.naturalWidth, height: image.naturalHeight, visible, touchesEdge, alphaAtCorner: data[3], eyeOpenings };
  }, { src, size, checkEyes });
  assert.equal(stats.width, size);
  assert.equal(stats.height, size);
  assert.equal(stats.alphaAtCorner, 0, `${src}: background must be transparent`);
  assert.equal(stats.touchesEdge, false, `${src}: artwork needs a clear margin`);
  assert(stats.visible > size * size * 0.2 && stats.visible < size * size * 0.85, `${src}: implausible artwork coverage`);
  if (checkEyes && size === 16) {
    assert(stats.eyeOpenings.includes('left') && stats.eyeOpenings.includes('right'),
      'A 16-pixel hybrid must keep two enclosed eye openings with at least two nearly transparent pixels each');
  }
}

function installSelectedIcon() {
  const selected = CONCEPTS.filter(concept => concept.selected);
  assert.equal(selected.length, 1, 'Exactly one icon must be selected for production');
  const { id } = selected[0];
  const outputs = SIZES.map(size => {
    const png = fs.readFileSync(path.join(OUT, `${id}-${size}.png`));
    assert.deepEqual(pngDimensions(png), { width: size, height: size });
    return { size, png };
  });
  for (const { size, png } of outputs) {
    fs.writeFileSync(path.join(ROOT, 'icons', `maskify${size}x${size}.png`), png);
  }
  console.log(`Installed ${id} as the production icon at ${SIZES.join(', ')} px`);
}

async function render(all = false, installSelected = false) {
  const concepts = all ? CONCEPTS : SEAL_CONCEPTS;
  const input = new Map([
    ...routes(false),
    ['/render', ['text/html', Buffer.from('<!doctype html><html><head><link rel="icon" href="/mask.svg"></head><body></body></html>')]],
  ]);
  const server = await startServer(input);
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chromium', headless: true });
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const { id, sizes } of concepts) {
      for (const size of sizes) {
        await page.setViewportSize({ width: size, height: size });
        await page.goto(`${server.origin}/render`);
        await page.setContent(`<!doctype html><html><head><link rel="icon" href="/mask.svg"><style>
          html,body{margin:0;padding:0;background:transparent;width:${size}px;height:${size}px;overflow:hidden}
          img{display:block;width:${size}px;height:${size}px}
        </style></head><body><img src="/${id}.svg" alt=""></body></html>`);
        await waitForImages(page);
        const png = await page.screenshot({ omitBackground: true, scale: 'css' });
        assert.deepEqual(pngDimensions(png), { width: size, height: size });
        await validatePixels(page, `data:image/png;base64,${png.toString('base64')}`, size,
          HYBRID_CONCEPTS.some(concept => concept.id === id));
        fs.writeFileSync(path.join(OUT, `${id}-${size}.png`), png);
      }
      console.log(`Rendered ${id}: ${sizes.join(', ')} px`);
    }
    await page.close();
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await server.close();
    }
  }

  if (installSelected) installSelectedIcon();
  fs.writeFileSync(path.join(OUT, 'index.html'), galleryHtml());
  const preview = await startServer(routes(true));
  try {
    browser = await chromium.launch({ channel: 'chromium', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(preview.origin);
    await waitForImages(page);
    assert(await page.evaluate(() => [...document.fonts].some(font => font.family === 'Manrope' && font.status === 'loaded')));
    const summaries = page.locator('.earlier summary');
    for (let i = 0; i < await summaries.count(); i++) await summaries.nth(i).click();
    await waitForImages(page);
    for (const width of [1440, 980, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Gallery overflows at ${width}px`);
      const clips = await page.locator('.option').evaluateAll(options =>
        options.filter(option => option.scrollWidth > option.clientWidth + 1).length);
      assert.equal(clips, 0, `Icon cards clip at ${width}px`);
    }
    const wrongSizes = await page.locator('.toolbar-icon img, .size img').evaluateAll(images =>
      images.filter(image => image.getBoundingClientRect().width !== image.width).map(image => image.src));
    assert.deepEqual(wrongSizes, [], 'Toolbar and native-size samples must retain their declared CSS size');
    for (let i = 0; i < await summaries.count(); i++) await summaries.nth(i).click();
    assert.deepEqual(errors, [], 'Icon gallery has browser errors');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(OUT, 'comparison.png'), fullPage: true, scale: 'css' });
    await validateDensity(browser, preview.origin);
    console.log(`Gallery and comparison saved to ${OUT}`);
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await preview.close();
    }
  }
}

async function validateDensity(browser, origin) {
  for (const deviceScaleFactor of [1, 2]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 }, deviceScaleFactor,
    });
    try {
      const page = await context.newPage();
      await page.goto(origin);
      await waitForImages(page);
      const samples = await page.locator('section .toolbar-icon img').evaluateAll(images =>
        images.map(image => ({
          size: image.width,
          cssWidth: image.getBoundingClientRect().width,
          cssHeight: image.getBoundingClientRect().height,
          source: image.currentSrc,
        })));
      assert.equal(samples.length, SEAL_CONCEPTS.length * 4);
      for (const sample of samples) {
        assert.equal(sample.cssWidth, sample.size);
        assert.equal(sample.cssHeight, sample.size);
        assert(sample.source.endsWith(`-${sample.size * deviceScaleFactor}.png`),
          `Wrong ${deviceScaleFactor}x source for ${sample.size}px toolbar image: ${sample.source}`);
      }
    } finally {
      await context.close();
    }
  }
}

async function preview() {
  const server = await startServer(routes(true));
  console.log(`Icon gallery: ${server.origin}`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close().catch(error => {
      console.error(error);
      process.exitCode = 1;
    }));
  }
}

if (require.main === module) {
  const command = process.argv[2];
  if (process.argv.length > 3 || (command && !['--preview', '--all', '--install-selected'].includes(command))) {
    console.error('Use --preview to serve, --all to regenerate every round, --install-selected to render and install the chosen production icon, or no option to render the seal concepts.');
    process.exitCode = 1;
  } else {
    (command === '--preview' ? preview() : render(command === '--all', command === '--install-selected')).catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}

module.exports = { CONCEPTS, SIZES, SEAL_CONCEPTS, HYBRID_CONCEPTS, ORIGINAL_CONCEPTS, galleryHtml };
