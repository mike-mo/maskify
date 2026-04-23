/**
 * Generates store screenshots for Maskify for every locale in _locales/.
 * Outputs per language under screenshots/<lang>/:
 *   popup.png     — popup UI, ~600px wide, aspect ratio preserved
 *   testpage.png  — before/after side by side, exactly 1280x800
 *
 * Usage:
 *   cd scripts && npm ci && npm run screenshot
 */

const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'screenshots');
const LANGS = fs.readdirSync(path.join(ROOT, '_locales')).filter(f =>
  fs.statSync(path.join(ROOT, '_locales', f)).isDirectory()
).sort();

const NAMES = {
  en: ['alice', 'bob', 'carol', 'dave', 'emma', 'frank', 'grace', 'henry'],
  es: ['alicia', 'carlos', 'maria', 'jose', 'elena', 'miguel', 'sofia', 'pablo'],
};
const FALLBACK_NAMES = NAMES.en;

function b64(buf) { return buf.toString('base64'); }
function normalizeChromiumLangTag(locale) {
  const parts = locale.split(/[-_]/).filter(Boolean);
  if (!parts.length) return locale;
  return parts
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (/^[A-Za-z]{4}$/.test(part)) return `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`;
      if (/^([A-Za-z]{2}|\d{3})$/.test(part)) return part.toUpperCase();
      return part.toLowerCase();
    })
    .join('-');
}

async function findExtensionId(context) {
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Runtime.enable');
  const extensionIdPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Could not detect extension ID — is the extension loaded?')), 5000);
    client.on('Runtime.executionContextCreated', event => {
      const origin = event.context.origin || '';
      if (origin.startsWith('chrome-extension://')) {
        clearTimeout(timer);
        resolve(origin.replace('chrome-extension://', ''));
      }
    });
  });
  await page.goto('https://example.com');
  await page.waitForLoadState('domcontentloaded');
  const extensionId = await extensionIdPromise;
  await page.close();
  return extensionId;
}

async function capturePopup(context, extensionId) {
  const page = await context.newPage();
  // Tall initial viewport prevents scrollbars from appearing during load/measurement
  await page.setViewportSize({ width: 400, height: 2000 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(400);
  await page.addStyleTag({ content: '::-webkit-scrollbar { display: none !important; }' });
  const box = await page.locator('body').boundingBox();
  if (!box || !box.width) throw new Error('Could not measure popup dimensions — did the popup load?');
  const w = Math.round(box.width);
  const h = Math.round(box.height);
  await page.setViewportSize({ width: w, height: h });
  await page.waitForFunction(w => document.body.clientWidth === w, w);
  const raw = await page.screenshot();
  await page.close();

  // Scale up to ~600px wide via HTML compositor, preserving aspect ratio
  const compositor = await context.newPage();
  const scaledHeight = Math.round(h * (600 / w));
  await compositor.setViewportSize({ width: 600, height: scaledHeight });
  await compositor.setContent(`<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; }
    html, body { overflow: hidden; width: 600px; background: #fff; }
    img { width: 600px; height: auto; display: block; }
  </style></head><body>
    <img src="data:image/png;base64,${b64(raw)}">
  </body></html>`);
  await compositor.waitForFunction(() => { const img = document.querySelector('img'); return img && img.complete && img.naturalWidth > 0; });
  const scaled = await compositor.screenshot();
  await compositor.close();
  return scaled;
}

async function captureTestpageBefore(context, lang) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 638, height: 800 });
  const baseLang = lang.split(/[-_]/)[0].toLowerCase();
  await page.goto(`${pathToFileURL(path.join(ROOT, 'testpage.html')).href}?lang=${baseLang}`);
  await page.waitForLoadState('domcontentloaded');
  await page.addStyleTag({ content: '::-webkit-scrollbar { display: none !important; }' });
  await page.waitForTimeout(500);
  await page.keyboard.press('b');
  await page.waitForSelector('.maskify-before');
  const buf = await page.screenshot();
  return { page, buf };
}

async function captureTestpageAfter(page, lang) {
  await page.evaluate((names) => {
    const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const used = {};
    let idx = 0;
    function fake(real) {
      if (!used[real]) used[real] = `${names[idx++ % names.length]}7***@example.com`;
      return used[real];
    }
    function rep(str) { return str.replace(EMAIL_RE, m => fake(m)); }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (EMAIL_RE.test(node.nodeValue)) { EMAIL_RE.lastIndex = 0; node.nodeValue = rep(node.nodeValue); }
    }
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (href) a.setAttribute('href', rep(href));
    });
    document.querySelectorAll('input').forEach(input => {
      if (input.value) input.value = rep(input.value);
      if (input.placeholder) input.placeholder = rep(input.placeholder);
    });
    document.querySelectorAll('textarea').forEach(ta => {
      if (ta.value) ta.value = rep(ta.value);
    });
    const toast = document.createElement('div');
    toast.id = 'maskify-toast';
    toast.style.display = 'none';
    document.body.appendChild(toast);
  }, NAMES[lang.split(/[-_]/)[0].toLowerCase()] || NAMES[lang] || FALLBACK_NAMES);
  await page.waitForTimeout(400);
  const buf = await page.screenshot();
  await page.close();
  return buf;
}

async function compositeBeforeAfter(context, beforeBuf, afterBuf) {
  const SEP = 4;
  const sideW = (1280 - SEP) / 2; // 638

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 1280px; height: 800px; display: flex; overflow: hidden; background: #bbb; }
    .side { flex: 0 0 ${sideW}px; height: 800px; overflow: hidden; }
    .sep  { flex: 0 0 ${SEP}px; background: #999; }
    img   { width: ${sideW}px; height: 800px; object-fit: cover; object-position: top left; display: block; }
  </style></head><body>
    <div class="side"><img src="data:image/png;base64,${b64(beforeBuf)}"></div>
    <div class="sep"></div>
    <div class="side"><img src="data:image/png;base64,${b64(afterBuf)}"></div>
  </body></html>`);
  await page.waitForFunction(() => [...document.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0));
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 } });
  await page.close();
  return buf;
}

async function run() {
  for (const lang of LANGS) {
    console.log(`Capturing ${lang}...`);
    const langDir = path.join(OUT, lang);
    fs.mkdirSync(langDir, { recursive: true });
    const chromiumLang = normalizeChromiumLangTag(lang);

    const userDataDir = path.join(os.tmpdir(), `maskify-${lang}-${Date.now()}`);
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${ROOT}`,
        `--load-extension=${ROOT}`,
        `--lang=${chromiumLang}`,
      ],
      viewport: { width: 1280, height: 800 },
    });

    try {
      const extensionId = await findExtensionId(context);

      const popupBuf = await capturePopup(context, extensionId);
      fs.writeFileSync(path.join(langDir, 'popup.png'), popupBuf);

      const { page, buf: beforeBuf } = await captureTestpageBefore(context, lang);
      const afterBuf = await captureTestpageAfter(page, lang);
      const combined = await compositeBeforeAfter(context, beforeBuf, afterBuf);
      fs.writeFileSync(path.join(langDir, 'testpage.png'), combined);

      console.log(`  ${lang}/popup.png, ${lang}/testpage.png`);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }

  console.log(`\nAll screenshots saved to: ${OUT}`);
}

run().catch(err => { console.error(err); process.exit(1); });
