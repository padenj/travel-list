#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Walk dist directory and replace import/export/dynamic import specifiers
// that reference local files without an extension, appending .js

const DIST = path.resolve(__dirname, '..', 'dist');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile() && full.endsWith('.js')) fixFile(full);
  }
}

function fixFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;

  // replace import ... from './foo' or export ... from './foo'
  src = src.replace(/((?:import|export)\s[^'"\n]*from\s*['"])(\.\.?\/[^'"\)]+)(['"])/g, (m, pre, spec, post) => {
    if (/\.[a-zA-Z0-9]+(\?|$)/.test(spec)) return m; // already has extension or query
    return `${pre}${spec}.js${post}`;
  });

  // replace dynamic imports import('...')
  src = src.replace(/(import\(\s*['"])(\.\.?\/[^'"\)]+)(['"]\s*\))/g, (m, pre, spec, post) => {
    if (/\.[a-zA-Z0-9]+(\?|$)/.test(spec)) return m;
    return `${pre}${spec}.js${post}`;
  });

  if (src !== orig) {
    fs.writeFileSync(file, src, 'utf8');
    console.log(`patched ${path.relative(DIST, file)}`);
  }
}

if (!fs.existsSync(DIST)) {
  console.error('dist directory not found, skipping fix-dist-imports');
  process.exit(0);
}

walk(DIST);
console.log('fix-dist-imports: done');
