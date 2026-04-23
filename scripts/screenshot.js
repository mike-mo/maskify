/**
 * Generates store screenshots for Maskify in English and Spanish.
 * Outputs per language:
 *   popup-{lang}.png       — popup UI, ~600px wide, aspect ratio preserved
 *   testpage-{lang}.png    — before/after side by side, exactly 1280x800
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
const LANGS = ['en', 'es'];

const NAMES = {
  en: ['alice', 'bob', 'carol', 'dave', 'emma', 'frank', 'grace', 'henry'],
  es: ['alicia', 'carlos', 'maria', 'jose', 'elena', 'miguel', 'sofia', 'pablo'],
};

function b64(buf) { return buf.toString('base64'); }

async function findExtensionId(context) {
  const page = await context.newPage();
  let extensionId = null;
  const client = await context.newCDPSession(page);
  await client.send('Runtime.enable');
  client.on('Runtime.executionContextCreated', event => {
    const origin = event.context.origin || '';
    if (!extensionId && origin.startsWith('chrome-extension://')) {
      extensionId = origin.replace('chrome-extension://', '');
    }
  });
  await page.goto(`file://${ROOT.replace(/\\/g, '/')}/testpage.html`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);
  await page.close();
  if (!extensionId) throw new Error('Could not detect extension ID — is the extension loaded?');
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
  const w = Math.round(box.width);
  const h = Math.round(box.height);
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(100);
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
  await compositor.waitForTimeout(200);
  const scaled = await compositor.screenshot();
  await compositor.close();
  return scaled;
}

async function captureTestpageBefore(context, lang) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 638, height: 800 });
  await page.goto(`file://${ROOT.replace(/\\/g, '/')}/testpage.html?lang=${lang}`);
  await page.waitForLoadState('domcontentloaded');
  await page.addStyleTag({ content: '::-webkit-scrollbar { display: none !important; }' });
  await page.waitForTimeout(500);
  await page.keyboard.press('b');
  await page.waitForTimeout(300);
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
  }, NAMES[lang]);
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
  await page.waitForTimeout(300);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 } });
  await page.close();
  return buf;
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });

  for (const lang of LANGS) {
    console.log(`Capturing ${lang}...`);
    const userDataDir = path.join(os.tmpdir(), `maskify-${lang}-${Date.now()}`);
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${ROOT}`,
        `--load-extension=${ROOT}`,
        `--lang=${lang}`,
      ],
      viewport: { width: 1280, height: 800 },
    });

    try {
      const extensionId = await findExtensionId(context);

      const popupBuf = await capturePopup(context, extensionId);
      fs.writeFileSync(path.join(OUT, `popup-${lang}.png`), popupBuf);

      const { page, buf: beforeBuf } = await captureTestpageBefore(context, lang);
      const afterBuf = await captureTestpageAfter(page, lang);
      const combined = await compositeBeforeAfter(context, beforeBuf, afterBuf);
      fs.writeFileSync(path.join(OUT, `testpage-${lang}.png`), combined);

      console.log(`  popup-${lang}.png, testpage-${lang}.png`);
    } finally {
      await context.close();
    }
  }

  console.log(`\nAll screenshots saved to: ${OUT}`);
}

run().catch(err => { console.error(err); process.exit(1); });
