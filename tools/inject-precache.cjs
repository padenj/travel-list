#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const srcSw = path.join(root, 'src', 'sw.js');
const outSw = path.join(distDir, 'sw.js');

function walk(dir) {
  const results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of list) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      results.push(...walk(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

if (!fs.existsSync(distDir)) {
  console.error('dist directory not found. Run `npm run build` first.');
  process.exit(2);
}

const allFiles = walk(distDir);
// Filter out source maps and SW output itself
const precacheFiles = allFiles
  .filter(f => !f.endsWith('.map'))
  .filter(f => !f.endsWith('/sw.js') && !f.endsWith('\sw.js'))
  .map(f => '/' + path.relative(distDir, f).split(path.sep).join('/'))
  .sort();

// Ensure index and manifest are present and at top
const ensure = ['/index.html', '/manifest.json'];
for (let i = ensure.length - 1; i >= 0; i--) {
  const e = ensure[i];
  const idx = precacheFiles.indexOf(e);
  if (idx >= 0) precacheFiles.splice(idx, 1);
  precacheFiles.unshift(e);
}

// Read the source SW template
if (!fs.existsSync(srcSw)) {
  console.error('source service worker not found at', srcSw);
  process.exit(3);
}

let swSource = fs.readFileSync(srcSw, 'utf8');

const placeholder = 'const precacheManifest = self.__WB_MANIFEST || [];' ;
if (!swSource.includes(placeholder)) {
  console.error('Expected placeholder not found in src/sw.js. Make sure it contains the exact line:\n' + placeholder);
  process.exit(4);
}

const injected = 'const precacheManifest = ' + JSON.stringify(precacheFiles, null, 2) + ';';
swSource = swSource.replace(placeholder, injected);

// Write out to dist/sw.js
fs.writeFileSync(outSw, swSource, 'utf8');
console.log('Wrote', outSw, 'with', precacheFiles.length, 'entries');

process.exit(0);
