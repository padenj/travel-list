#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

function fail(msg) { console.error('FAIL:', msg); process.exit(2); }

if (!fs.existsSync(dist)) fail('dist/ not found — was the build step run?');

const sw = path.join(dist, 'sw.js');
if (!fs.existsSync(sw)) fail('dist/sw.js not found');

const manifest = path.join(dist, 'manifest.json');
if (!fs.existsSync(manifest)) fail('dist/manifest.json not found');

const index = path.join(dist, 'index.html');
if (!fs.existsSync(index)) fail('dist/index.html not found');

const indexHtml = fs.readFileSync(index, 'utf8');
if (!/manifest\.json/.test(indexHtml)) fail('index.html does not reference manifest.json');
if (!/navigator\.serviceWorker/.test(indexHtml) && !/register\('/.test(indexHtml)) {
  // it's okay if registration is in JS bundles, so we check the bundle list too
  const assets = fs.readdirSync(path.join(dist, 'assets')).join(' ');
  if (!/sw\.js/.test(assets) && !/serviceworker/.test(assets)) {
    fail('No service worker registration found in index.html or assets');
  }
}

console.log('PWA verification passed: dist contains manifest and sw.js');
process.exit(0);
