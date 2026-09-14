'use strict';

const path = require('node:path');
const { startServer } = require('./server');
const { selectAssets } = require('./release-screenshots');

async function run() {
  const root = path.resolve(__dirname, '..');
  const routes = new Map([
    ['/', ['text/html; charset=utf-8', path.join(root, 'screenshots', 'index.html')]],
    ['/icons/maskify128x128.png', ['image/png', path.join(root, 'icons', 'maskify128x128.png')]],
    ...selectAssets(root).files.map(file => [
      '/' + file.replace(/^screenshots\//, ''),
      ['image/png', path.join(root, ...file.split('/'))],
    ]),
  ]);
  const server = await startServer(routes);
  console.log(`Screenshot gallery: ${server.origin}`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close().catch(error => {
      console.error(error);
      process.exitCode = 1;
    }));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
