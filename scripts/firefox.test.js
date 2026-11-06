'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { Builder, By } = require('selenium-webdriver');
const { Command } = require('selenium-webdriver/lib/command');
const firefox = require('selenium-webdriver/firefox');
const { buildFirefox } = require('./firefox-package');
const { startServer } = require('./server');

const ROOT = path.resolve(__dirname, '..');

function installAddon(driver, file) {
  // Keep the archive alive: Firefox 140 loads scripts lazily after Selenium's base64 temp file is deleted.
  return driver.execute(new Command('install addon').setParameter('path', file).setParameter('temporary', true));
}

for (const locale of ['en', 'es']) {
  test(`unsigned Firefox package works in a clean browser (${locale})`, { timeout: 180_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-firefox-browser-'));
    const archive = path.join(directory, 'maskify-firefox.zip');
    fs.writeFileSync(archive, buildFirefox().get('maskify-firefox.zip'));
    const server = await startServer(new Map([
      ['/', ['text/html; charset=utf-8', Buffer.from(`<!doctype html><html lang="${locale}">
        <head><title>Contact carla@team.example</title><link rel="icon" href="data:,"></head><body>
        <p id="address">carla@team.example</p><p id="stable">Unchanged text</p>
        <a id="link" href="mailto:carla@team.example">Email us</a>
        <input id="email" value="carla@team.example" placeholder="carla@team.example">
        <textarea id="notes">carla@team.example</textarea></body></html>`)]],
    ]));
    let driver;
    t.after(async () => {
      try {
        if (driver) await driver.quit();
      } finally {
        await server.close();
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
    const options = new firefox.Options().addArguments('-headless')
      .setPreference('intl.locale.requested', locale);
    if (process.env.FIREFOX_BINARY) options.setBinary(process.env.FIREFOX_BINARY);
    driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options)
      .setFirefoxService(new firefox.ServiceBuilder().addArguments('--allow-system-access')).build();
    await driver.manage().setTimeouts({ implicit: 0, pageLoad: 30_000, script: 15_000 });
    if (locale === 'es') {
      const version = (await driver.getCapabilities()).get('browserVersion');
      const response = await fetch(`https://releases.mozilla.org/pub/firefox/releases/${version}/linux-x86_64/xpi/es-ES.xpi`);
      assert(response.ok, `Could not download official Firefox Spanish language pack: ${response.status}`);
      const languagePack = path.join(directory, 'es-ES.xpi');
      fs.writeFileSync(languagePack, Buffer.from(await response.arrayBuffer()));
      await installAddon(driver, languagePack);
      await driver.setContext(firefox.Context.CHROME);
      await driver.executeScript('Services.locale.requestedLocales = ["es-ES"];');
      await driver.setContext(firefox.Context.CONTENT);
    }
    assert.equal(await installAddon(driver, archive), '@maskify.mike-mo');
    await driver.setContext(firefox.Context.CHROME);
    const permissionError = await driver.executeAsyncScript(`
      const done = arguments[arguments.length - 1];
      const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
      const extension = WebExtensionPolicy.getByID("@maskify.mike-mo").extension;
      ExtensionPermissions.add(extension.id, {origins: ["<all_urls>"], permissions: []}, extension)
        .then(() => done(null), error => done(error.message));
    `);
    assert.equal(permissionError, null, 'Grant the site access normally approved during installation');
    const popupUrl = await driver.executeScript(
      'return WebExtensionPolicy.getByID("@maskify.mike-mo").getURL("popup/popup.html");'
    );
    await driver.setContext(firefox.Context.CONTENT);
    await driver.get(server.origin);
    const target = await driver.getWindowHandle();
    await driver.switchTo().newWindow('tab');
    await driver.get(popupUrl);
    await driver.wait(async () => (await driver.findElement(By.id('previewAddress')).getText()).includes('@'), 15_000);
    const messages = JSON.parse(fs.readFileSync(path.join(ROOT, '_locales', locale, 'messages.json')));
    assert.equal(await driver.findElement(By.id('sendmessageid')).getText(), messages.buttonMask.message);
    await driver.findElement(By.id('domainInput')).sendKeys('demo.test');
    await driver.findElement(By.id('addNumber')).click();
    await driver.findElement(By.id('addLastInitial')).click();
    await driver.findElement(By.id('showAsterisk')).click();
    // Keep the content tab active when the real popup sends its masking message.
    await driver.executeScript(`
      return browser.tabs.query({}).then(tabs => {
        const target = tabs.find(tab => tab.url === arguments[0]);
        if (!target) throw new Error("The masking target tab was not found");
        return browser.tabs.update(target.id, {active: true});
      }).then(() => {
        document.getElementById("sendmessageid").click();
      });
    `, `${server.origin}/`);
    await driver.switchTo().window(target);
    const replacement = await driver.wait(async () => {
      const text = await driver.findElement(By.id('address')).getText();
      return /^[a-z]+_[a-z]@demo\.test$/.test(text) ? text : false;
    }, 15_000, 'Firefox popup did not mask the content tab');
    assert.equal(await driver.getTitle(), `Contact ${replacement}`);
    assert.equal(await driver.findElement(By.id('link')).getAttribute('href'), `mailto:${replacement}`);
    assert.equal(await driver.findElement(By.id('email')).getAttribute('value'), replacement);
    assert.equal(await driver.findElement(By.id('email')).getAttribute('placeholder'), replacement);
    assert.equal(await driver.findElement(By.id('notes')).getAttribute('value'), replacement);
    assert.equal(await driver.findElement(By.id('stable')).getText(), 'Unchanged text');
    await driver.get(server.origin);
    async function shortcut() {
      await driver.setContext(firefox.Context.CHROME);
      const dispatched = await driver.executeScript(`
        const key = [...document.querySelectorAll("key")].find(node =>
          node.closest("keyset")?.id.includes("maskify") && node.getAttribute("key")?.toLowerCase() === "m");
        if (!key) return false;
        if (!key.getAttribute("modifiers").includes("alt") ||
            !key.getAttribute("modifiers").includes("shift")) return false;
        key.dispatchEvent(new Event("command", {bubbles: true}));
        return true;
      `);
      assert.equal(dispatched, true, 'Firefox must register Alt+Shift+M for Maskify');
      await driver.setContext(firefox.Context.CONTENT);
    }
    await shortcut();
    await driver.wait(async () => /^[a-z]+_[a-z]@demo\.test$/.test(
      await driver.findElement(By.id('address')).getText()), 15_000, 'Firefox keyboard shortcut did not mask the content tab');
    const masked = await driver.findElement(By.id('address')).getText();
    // The command handler intentionally ignores activations within 75 ms.
    await new Promise(resolve => setTimeout(resolve, 100));
    await shortcut();
    await driver.wait(() => driver.executeScript(
      'return document.getElementById("maskify-toast")?.textContent.includes(arguments[0]) || false;',
      messages.toastNoEmails.message
    ), 15_000, 'Repeated shortcut activation must preserve already-masked addresses');
    assert.equal(await driver.findElement(By.id('address')).getText(), masked);
    assert.equal(await driver.getTitle(), `Contact ${masked}`);
  });
}
