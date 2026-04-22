/**
 * Generates before/after screenshots of the Maskify test page in English and Spanish,
 * plus a popup screenshot. Output goes to screenshots/ in the repo root.
 *
 * Usage:
 *   cd scripts && npm install && npm run screenshot
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'screenshots');
const VIEWPORT = { width: 1280, height: 800 };
const LANGS = ['en', 'es'];

const NAMES = {
  en: ['alice', 'bob', 'carol', 'dave', 'emma', 'frank', 'grace', 'henry'],
  es: ['alicia', 'carlos', 'maria', 'jose', 'elena', 'miguel', 'sofia', 'pablo'],
};

async function capturePopup(context, extensionId, lang) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(OUT, `popup-${lang}.png`),
    clip: { x: 0, y: 0, width: 280, height: 400 },
  });
  await page.close();
}

async function captureTestpage(context, extensionId, lang) {
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);

  const url = `file://${ROOT.replace(/\\/g, '/')}/testpage.html?lang=${lang}`;
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);

  // Before: press B to activate overlay
  await page.keyboard.press('b');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `testpage-before-${lang}.png`) });

  // After: replicate masking logic in-page, then fire the toast signal
  await page.evaluate((names) => {
    const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const used = {};
    let idx = 0;

    function fake(real) {
      if (!used[real]) used[real] = `${names[idx++ % names.length]}7***@example.com`;
      return used[real];
    }

    function replace(str) {
      return str.replace(EMAIL_RE, match => fake(match));
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (EMAIL_RE.test(node.nodeValue)) {
        EMAIL_RE.lastIndex = 0;
        node.nodeValue = replace(node.nodeValue);
      }
    }

    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (href) a.setAttribute('href', replace(href));
    });

    document.querySelectorAll('input').forEach(input => {
      if (input.value) input.value = replace(input.value);
      if (input.placeholder) input.placeholder = replace(input.placeholder);
    });

    document.querySelectorAll('textarea').forEach(ta => {
      if (ta.value) ta.value = replace(ta.value);
    });

    // Fire the toast signal that triggers the overlay transition
    const toast = document.createElement('div');
    toast.id = 'maskify-toast';
    toast.style.display = 'none';
    document.body.appendChild(toast);
  }, NAMES[lang]);

  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `testpage-after-${lang}.png`) });
  await page.close();
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });

  for (const lang of LANGS) {
    console.log(`Capturing ${lang}...`);
    const userDataDir = path.join(os.tmpdir(), `maskify-screenshots-${lang}-${Date.now()}`);

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${ROOT}`,
        `--load-extension=${ROOT}`,
        `--lang=${lang}`,
      ],
      viewport: VIEWPORT,
    });

    try {
      // Wait for the extension background service worker
      let [worker] = context.serviceWorkers();
      if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
      const extensionId = new URL(worker.url()).hostname;

      await capturePopup(context, extensionId, lang);
      await captureTestpage(context, extensionId, lang);

      console.log(`  Done: popup-${lang}.png, testpage-before-${lang}.png, testpage-after-${lang}.png`);
    } finally {
      await context.close();
    }
  }

  console.log(`\nAll screenshots saved to: ${OUT}`);
}

run().catch(err => { console.error(err); process.exit(1); });
