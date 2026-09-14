'use strict';

// Captures the real extension locally, then composes three 1280x800 images per locale.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const copy = require('./copy');
const { demoHtml, compositionHtml } = require('./templates');
const { startServer } = require('./server');
const { COMPOSED } = require('./release-screenshots');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const FRAMES = COMPOSED.map(frame => frame.key);
const LANGS = fs.readdirSync(path.join(ROOT, '_locales'))
  .filter(lang => fs.statSync(path.join(ROOT, '_locales', lang)).isDirectory())
  .sort();

function normalizeChromiumLangTag(locale) {
  const parts = locale.split(/[-_]/).filter(Boolean);
  if (!parts.length) return locale;
  return parts.map((part, i) => {
    if (i === 0) return part.toLowerCase();
    if (/^[A-Za-z]{4}$/.test(part)) return part[0].toUpperCase() + part.slice(1).toLowerCase();
    if (/^([A-Za-z]{2}|\d{3})$/.test(part)) return part.toUpperCase();
    return part;
  }).join('-');
}

function pngDimensions(buffer) {
  assert(buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Invalid PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function startCaptureServer() {
  const routes = new Map([
    ['/', ['text/html; charset=utf-8', Buffer.from('<!doctype html><html><head><link rel="icon" href="/icon.png"></head><body></body></html>')]],
    ['/icon.png', ['image/png', fs.readFileSync(path.join(ROOT, 'icons', 'maskify128x128.png'))]],
    ['/assets/Manrope.ttf', ['font/ttf', fs.readFileSync(path.join(__dirname, 'assets', 'Manrope.ttf'))]],
    ...['demo', 'composition'].map(name => [
      `/${name}.css`, ['text/css; charset=utf-8', fs.readFileSync(path.join(__dirname, `${name}.css`))],
    ]),
    ...LANGS.map(lang => [`/demo/${lang}`, ['text/html; charset=utf-8', Buffer.from(demoHtml(lang))]]),
  ]);
  return startServer(routes);
}

async function waitForAssets(page, requireManrope = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  if (requireManrope) {
    assert(await page.evaluate(() => [...document.fonts].some(font => font.family === 'Manrope' && font.status === 'loaded')),
      'The bundled Manrope font must load before capture');
  }
}

async function assertNoOverflow(locator) {
  const problems = await locator.evaluate(root => {
    const nodes = [root, ...root.querySelectorAll('[data-fit], input, textarea')];
    return nodes.filter(node => {
      const clipsVertically = getComputedStyle(node).overflowY !== 'visible';
      return node.clientWidth > 0 && (node.scrollWidth > node.clientWidth + 1 ||
        (clipsVertically && node.scrollHeight > node.clientHeight + 1));
    }).map(node => `${node.tagName}#${node.id || ''}.${node.className || ''}: ${node.textContent.trim().slice(0, 80)}`);
  });
  assert.deepEqual(problems, [], 'Clipped content in capture or composition');
}

async function captureElement(page, selector) {
  const element = page.locator(selector);
  await element.scrollIntoViewIfNeeded();
  await assertNoOverflow(element);
  return element.screenshot({ animations: 'disabled' });
}

async function assertCompositionSpacing(page) {
  const collisions = await page.evaluate(() => {
    const selectors = ['.brand', '.intro', '.comparison', '.coverage-grid', '.action', '.marker-note', '.popup', 'footer'];
    const boxes = selectors.flatMap(selector => {
      const node = document.querySelector(selector);
      return node ? [{ selector, box: node.getBoundingClientRect() }] : [];
    });
    const problems = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].box;
        const b = boxes[j].box;
        const horizontalOverlap = a.left < b.right && b.left < a.right;
        const verticalGap = Math.max(b.top - a.bottom, a.top - b.bottom);
        if (horizontalOverlap && verticalGap < 12) {
          problems.push(`${boxes[i].selector} / ${boxes[j].selector}: ${verticalGap.toFixed(1)}px gap`);
        }
      }
    }
    return problems;
  });
  assert.deepEqual(collisions, [], 'Composition blocks need at least 12px separation');
}

async function openPopup(context, extensionId, lang) {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 1100 });
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.waitForFunction(() => document.querySelector('#previewAddress').textContent.length > 0);
  assert.equal(await popup.locator('#sendmessageid').textContent(), copy[lang].result.button, 'Popup must use the requested locale');
  return popup;
}

async function captureSources(context, extensionId, lang, origin) {
  const page = await context.newPage();
  await page.goto(`${origin}/demo/${lang}`);
  await waitForAssets(page, true);
  const stableBefore = await page.locator('[data-stable]').allTextContents();
  const originalEmails = await page.locator('.directory-email').allTextContents();
  const before = await captureElement(page, '#directory');

  const popup = await openPopup(context, extensionId, lang);
  await page.bringToFront();
  // The actual popup queries the active tab. Keep the fixture active when clicking its button.
  await popup.locator('#sendmessageid').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.directory-email')].every(node => node.textContent.includes('***@example.com')));
  await page.waitForSelector('#maskify-toast', { state: 'detached' });
  if (!popup.isClosed()) await popup.close();

  const maskedEmails = await page.locator('.directory-email').allTextContents();
  for (let i = 0; i < maskedEmails.length; i++) {
    assert.notEqual(maskedEmails[i], originalEmails[i]);
    assert.match(maskedEmails[i], /^[a-z]+\d+\*\*\*@example\.com$/);
  }
  assert.equal(maskedEmails[0], maskedEmails[2], 'Repeated addresses must have consistent replacements');
  assert.deepEqual(await page.locator('[data-stable]').allTextContents(), stableBefore, 'Non-email content must remain unchanged');
  assert.equal(await page.locator('#summary-email').textContent(), maskedEmails[0]);
  assert.equal(await page.locator('#contact-link').textContent(), maskedEmails[0]);
  assert.equal(await page.locator('#contact-link').getAttribute('href'), `mailto:${maskedEmails[0]}`);
  assert.equal(await page.locator('#email').inputValue(), maskedEmails[0]);
  assert.match(await page.locator('#email').getAttribute('placeholder'), /\*\*\*@example\.com$/);
  const notes = await page.locator('#notes').inputValue();
  assert(notes.includes(maskedEmails[0]) && !notes.includes('carla@team.example'), 'Textarea must contain the actual replacement');

  const images = { before };
  images.after = await captureElement(page, '#directory');
  for (const section of ['summary', 'link', 'fields']) {
    images[section] = await captureElement(page, `#${section}`);
  }
  await page.close();

  const controls = await openPopup(context, extensionId, lang);
  await controls.locator('#domainInput').fill(copy[lang].controls.domain);
  await controls.locator('#addNumber').check();
  await controls.locator('#addLastInitial').check();
  await controls.locator('#showAsterisk').check();
  assert.equal(await controls.locator('#previewAddress').textContent(), copy[lang].controls.preview);
  assert(await controls.locator('#previewAddress').evaluate(node => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getClientRects().length === 1;
  }), 'The live preview must fit on one line without changing the popup UI');
  await waitForAssets(controls);
  images.popup = await captureElement(controls, 'body');
  await controls.close();
  return images;
}

async function captureLocale(lang, origin) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-capture-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: process.env.MASKIFY_HEADED !== '1',
      args: [
        `--disable-extensions-except=${ROOT}`,
        `--load-extension=${ROOT}`,
        `--lang=${normalizeChromiumLangTag(lang)}`,
      ],
      locale: normalizeChromiumLangTag(lang),
      env: { ...process.env, LANGUAGE: lang },
      viewport: { width: 1200, height: 1000 },
      deviceScaleFactor: 2,
    });
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    assert.match(worker.url(), /^chrome-extension:\/\//, 'Expected the extension service worker');
    assert.equal((await worker.evaluate(() => chrome.i18n.getUILanguage())).split('-')[0], lang, 'Browser extension language mismatch');
    const images = await captureSources(context, extensionId, lang, origin);
    const rendered = new Map();
    for (const [i, frame] of FRAMES.entries()) {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(origin);
      await page.setContent(compositionHtml(lang, frame, images));
      await waitForAssets(page, true);
      await assertNoOverflow(page.locator('.slide'));
      await assertCompositionSpacing(page);
      const buffer = await page.screenshot({ scale: 'css', animations: 'disabled' });
      assert.deepEqual(pngDimensions(buffer), { width: 1280, height: 800 });
      rendered.set(COMPOSED[i].file, buffer);
      await page.close();
    }
    assert.deepEqual(errors, [], 'Browser errors during capture');
    return rendered;
  } finally {
    try {
      if (context) await context.close();
    } finally {
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
}

async function run() {
  for (const lang of LANGS) {
    assert(copy[lang], `Missing marketing copy for locale ${lang}`);
  }
  const server = await startCaptureServer();
  const results = new Map();
  try {
    for (const lang of LANGS) {
      console.log(`Capturing and composing ${lang}...`);
      results.set(lang, await captureLocale(lang, server.origin));
    }
  } finally {
    await server.close();
  }
  for (const [lang, images] of results) {
    const destination = path.join(OUT, lang);
    fs.mkdirSync(destination, { recursive: true });
    for (const [name, buffer] of images) {
      fs.writeFileSync(path.join(destination, name), buffer);
      console.log(`  ${lang}/${name}`);
    }
  }
  console.log(`Saved ${LANGS.length * FRAMES.length} images at 1280x800 to ${OUT}`);
}

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { normalizeChromiumLangTag, pngDimensions };
