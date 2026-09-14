'use strict';

const http = require('node:http');
const fs = require('node:fs');

async function startServer(routes) {
  const server = http.createServer((request, response) => {
    const entry = routes.get(request.url);
    if (!entry) {
      console.error(`Screenshot server: unknown resource ${request.url}`);
      response.writeHead(404).end('Not found');
      return;
    }
    const headers = { 'Content-Type': entry[0], 'Cache-Control': 'no-store' };
    if (Buffer.isBuffer(entry[1])) {
      response.writeHead(200, headers);
      response.end(entry[1]);
    } else {
      const stream = fs.createReadStream(entry[1]);
      stream.on('open', () => {
        response.writeHead(200, headers);
        stream.pipe(response);
      });
      stream.on('error', error => {
        console.error(`Screenshot server: unable to read ${request.url}`, error);
        if (!response.headersSent) response.writeHead(500).end('Unable to read asset');
        else response.destroy(error);
      });
      response.on('close', () => stream.destroy());
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

module.exports = { startServer };
