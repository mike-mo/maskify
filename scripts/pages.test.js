'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { assemble } = require('./pages');

const ROOT = path.resolve(__dirname, '..');

test('Pages runtime migration preserves build, artifact and deployment boundaries', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'pages.yml'), 'utf8')
    .replace(/\r\n/g, '\n');
  assert.match(workflow, /push:\n    branches: \[main\]/);
  assert.match(workflow, /deploy:\n        description: 'Deploy the built site'\n        type: boolean\n        default: false/);
  assert.match(workflow, /group: pages\n  cancel-in-progress: false/);
  assert.match(workflow, /contents: read\n  pages: write\n  id-token: write/);
  const [build, deploy] = workflow.split('\n  deploy:');
  assert.match(build, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(build, /uses: actions\/checkout@v6\n        with:\n          persist-credentials: false/);
  assert.match(build, /uses: actions\/setup-node@v6\n        with:\n          node-version: '24'\n          package-manager-cache: false/);
  assert.match(build, /run: node scripts\/pages\.js dist\/pages-source/);
  assert.match(build, /run: node --test scripts\/pages\.test\.js/);
  assert.match(build, /uses: actions\/configure-pages@v6/);
  assert.match(build, /uses: actions\/jekyll-build-pages@v1\n        with:\n          source: \.\/dist\/pages-source\n          destination: \.\/dist\/pages-site/);
  assert.match(build, /uses: actions\/upload-pages-artifact@v5\n        with:\n          path: \.\/dist\/pages-site\n          include-hidden-files: true/);
  assert.match(deploy, /if: \(github\.event_name == 'push' \|\| inputs\.deploy\) && github\.ref == 'refs\/heads\/main'/);
  assert.match(deploy, /needs: build/);
  assert.match(deploy, /name: github-pages\n      url: \$\{\{ steps\.deploy\.outputs\.page_url \}\}/);
  assert.match(deploy, /uses: actions\/deploy-pages@v5\n        id: deploy/);
});

test('assembled Pages preserve public URLs and valid favicon paths', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-pages-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  assemble(ROOT, output);
  for (const file of ['privacy.html', 'testpage.html']) {
    const published = fs.readFileSync(path.join(output, file), 'utf8');
    const local = fs.readFileSync(path.join(ROOT, 'web', file), 'utf8');
    assert.equal(published, local.replaceAll('href="../icons/', 'href="icons/'));
    const icons = [...published.matchAll(/<link rel="icon"[^>]*href="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(icons, ['icons/maskify.svg', 'icons/maskify32x32.png', 'icons/maskify16x16.png']);
    for (const icon of icons) assert(fs.existsSync(path.join(output, icon)), `${file}: ${icon} missing`);
    for (const match of local.matchAll(/<link rel="icon"[^>]*href="([^"]+)"/g)) {
      assert(fs.existsSync(path.resolve(ROOT, 'web', match[1])), `${file}: ${match[1]} missing locally`);
    }
  }
  for (const file of ['README.md', 'icons/index.html', 'icons/gallery.css', 'screenshots/index.html',
    'screenshots/en/01-result.png', 'screenshots/es/03-controls.png']) {
    assert(fs.existsSync(path.join(output, file)), `${file} missing from Pages`);
  }
  for (const file of ['icons/index.html', 'screenshots/index.html']) {
    const html = fs.readFileSync(path.join(output, file), 'utf8');
    const base = new URL(file, 'https://example.test/maskify/');
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = new URL(match[1], base);
      if (url.hash) continue;
      assert(url.pathname.startsWith('/maskify/'), `${file}: ${match[1]} leaves the site`);
      assert(fs.existsSync(path.join(output, url.pathname.slice('/maskify/'.length))),
        `${file}: ${match[1]} missing from Pages`);
    }
  }
  assert.throws(() => assemble(ROOT, output), /Pages output must be empty/);
});
