'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');
const { startServer } = require('./server');

const ROOT = path.resolve(__dirname, '..');
const ADDRESS = 'carla@team.example';

for (const locale of ['en', 'es']) {
  test(`tab-title masking (${locale})`, { timeout: 180_000 }, async t => {
    const messages = JSON.parse(fs.readFileSync(path.join(ROOT, '_locales', locale, 'messages.json'), 'utf8'));
    const server = await startServer(new Map([
      ['/', ['text/html; charset=utf-8', Buffer.from(
        `<!doctype html><html lang="${locale}"><head><title>Maskify test</title><link rel="icon" href="data:,"></head><body></body></html>`
      )]],
      [`/manual?lang=${locale}`, ['text/html; charset=utf-8', path.join(ROOT, 'testpage.html')]],
      ...[16, 32].map(size => [
        `/icons/maskify${size}x${size}.png`, ['image/png', path.join(ROOT, 'icons', `maskify${size}x${size}.png`)],
      ]),
    ]));
    let profile;
    let context;
    t.after(async () => {
      try {
        if (context) await context.close();
      } finally {
        try {
          await server.close();
        } finally {
          if (profile) fs.rmSync(profile, { recursive: true, force: true });
        }
      }
    });
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-title-test-'));
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${ROOT}`,
        `--load-extension=${ROOT}`,
        `--lang=${locale}`,
      ],
      locale,
      env: { ...process.env, LANGUAGE: locale },
    });
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(15_000);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    assert.equal((await worker.evaluate(() => chrome.i18n.getUILanguage())).split('-')[0], locale);

    async function fixture(subtest, title, body = `<p id="address">${ADDRESS}</p>`) {
      const page = await context.newPage();
      subtest.after(() => page.close());
      await page.goto(server.origin);
      await page.evaluate(({ title, body }) => {
        if (title === null) document.querySelector('title').remove();
        else document.title = title;
        document.body.innerHTML = body;
      }, { title, body });
      return page;
    }

    async function mask(page, settings = {}) {
      await page.evaluate(() => document.getElementById('maskify-toast')?.remove());
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await popup.waitForFunction(() => document.querySelector('#previewAddress').textContent.length > 0);
      await popup.locator('#domainInput').fill(settings.domain ?? '');
      await popup.locator('#addNumber').setChecked(settings.addNumber ?? true);
      await popup.locator('#addLastInitial').setChecked(settings.addLastInitial ?? false);
      await popup.locator('#showAsterisk').setChecked(settings.showAsterisk ?? true);
      // The popup sends its command to the active tab, not its own page.
      await page.bringToFront();
      const [toast] = await Promise.all([
        page.waitForSelector('#maskify-toast', { state: 'attached' }),
        popup.locator('#sendmessageid').click(),
      ]);
      const message = await toast.textContent();
      if (!popup.isClosed()) await popup.close();
      return message;
    }

    await t.test('the localized manual test page demonstrates title masking', async subtest => {
      const page = await context.newPage();
      subtest.after(() => page.close());
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${server.origin}/manual?lang=${locale}`);
      assert.equal(await page.locator('h1').textContent(), locale === 'en' ? 'Maskify test page' : 'P\u00e1gina de prueba de Maskify');
      assert.equal(await page.locator('[data-i18n="h2_9"]').count(), 1);
      const before = await page.title();
      assert(before.endsWith('support@acme.com'));
      await mask(page);
      const address = (await page.locator('[data-i18n="scenario1Text"]').textContent())
        .match(/[a-z]+\d+\*\*\*@example\.com/);
      assert(address, 'The first scenario must contain a masked address');
      assert.equal(await page.title(), before.replace('support@acme.com', address[0]));
      assert.deepEqual(errors, []);
    });

    await t.test('shares replacements across the title, page text, links, and fields', async subtest => {
      const page = await fixture(subtest, `Team & status | ${ADDRESS} | ${ADDRESS}`, `
        <h1 id="address">${ADDRESS}</h1>
        <p id="stable">Keep this text.</p>
        <a id="link" href="mailto:${ADDRESS}">${ADDRESS}</a>
        <input id="email" value="${ADDRESS}" placeholder="${ADDRESS}">
        <textarea id="notes">Contact ${ADDRESS}.</textarea>
      `);
      const message = await mask(page);
      const replacement = await page.locator('#address').textContent();
      assert.match(replacement, /^[a-z]+\d+\*\*\*@example\.com$/);
      assert.equal(await page.title(), `Team & status | ${replacement} | ${replacement}`);
      assert.equal(await page.locator('#stable').textContent(), 'Keep this text.');
      assert.equal(await page.locator('#link').textContent(), replacement);
      assert.equal(await page.locator('#link').getAttribute('href'), `mailto:${replacement}`);
      assert.equal(await page.locator('#email').inputValue(), replacement);
      assert.equal(await page.locator('#email').getAttribute('placeholder'), replacement);
      assert.equal(await page.locator('#notes').inputValue(), `Contact ${replacement}.`);
      assert(message.includes(messages.toastSingular.message.replace('$1', '1')));
    });

    await t.test('masks and counts an address that appears only in the title', async subtest => {
      const page = await fixture(subtest, `${ADDRESS} / ${ADDRESS} | Support`, '<p id="stable">No email here.</p>');
      const message = await mask(page);
      assert.match(await page.title(), /^([a-z]+\d+\*\*\*@example\.com) \/ \1 \| Support$/);
      assert.equal(await page.locator('#stable').textContent(), 'No email here.');
      assert(message.includes(messages.toastSingular.message.replace('$1', '1')));
    });

    for (const showAsterisk of [true, false]) {
      await t.test(`honors format options and preserves an already-masked title (marker=${showAsterisk})`, async subtest => {
        const page = await fixture(subtest, `Contact ${ADDRESS}`);
        const settings = { domain: 'demo.test', addNumber: false, addLastInitial: true, showAsterisk };
        await mask(page, settings);
        const replacement = await page.locator('#address').textContent();
        assert.match(replacement, showAsterisk ? /^[a-z]+_[a-z]\*\*\*@demo\.test$/ : /^[a-z]+_[a-z]@demo\.test$/);
        const title = `Contact ${replacement}`;
        assert.equal(await page.title(), title);
        await mask(page, settings);
        assert.equal(await page.title(), title);
        assert.equal(await page.locator('#address').textContent(), replacement);
      });
    }

    await t.test('does not rewrite non-email, empty, or missing titles', async subtest => {
      for (const title of ['Team & @support - Status', '', null]) {
        const page = await fixture(subtest, title);
        await page.evaluate(() => {
          window.titleMutationCount = 0;
          new MutationObserver(records => { window.titleMutationCount += records.length; })
            .observe(document.head, { subtree: true, childList: true, characterData: true });
        });
        await mask(page);
        assert.match(await page.locator('#address').textContent(), /\*\*\*@example\.com$/);
        assert.equal(await page.title(), title ?? '');
        assert.equal(await page.locator('head title').count(), title === null ? 0 : 1);
        assert.equal(await page.evaluate(() => window.titleMutationCount), 0);
      }
    });
  });
}
