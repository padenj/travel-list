#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const port = process.env.PORT || 8080;

if (!fs.existsSync(dist)) {
  console.error('dist/ not found. Run build first (npm run build:pwa).');
  process.exit(2);
}

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(dist, decodeURIComponent(reqPath));
  if (!filePath.startsWith(dist)) return res.end();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404; res.end('Not found'); return;
    }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
    res.end(data);
  });
});

server.listen(port, () => console.log(`Serving dist at http://localhost:${port}`));
