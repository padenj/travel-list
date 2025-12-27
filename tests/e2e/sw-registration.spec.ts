import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverScript = path.resolve(__dirname, '../../tools/serve-dist.cjs');

test('service worker registers on page load', async ({ page }) => {
  const server = spawn('node', [serverScript], { env: { ...process.env, PORT: '8081' }, stdio: 'inherit' });

  try {
    // give server a moment to start
    await new Promise((res) => setTimeout(res, 500));

    page.on('console', (msg) => console.log('[page]', msg.type(), msg.text()));

    await page.goto('http://localhost:8081/');

    // Wait for the app's console message that indicates the SW registered
    const swConsole = await page.waitForEvent('console', {
      predicate: (msg) => msg.type() === 'log' && msg.text().includes('Service worker registered.'),
      timeout: 5000,
    });

    expect(swConsole).toBeTruthy();
  } finally {
    server.kill();
  }
});
