import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use jsdom so frontend component tests (testing-library) can render DOM.
    // Server-side tests still work under jsdom in this project; if any
    // node-specific test fails we can selectively configure per-suite.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: [
      'client/src/__tests__/**/*.test.tsx', // Client regression coverage
      'src/**/*.test.{ts,tsx}',           // Frontend unit tests
      'server/**/*.test.ts',              // Backend unit tests
      'tests/integration/**/*.test.ts',   // Integration tests
      'tests/e2e/**/*.test.ts'           // End-to-end tests
    ],
    exclude: ['node_modules', 'dist', 'build'],
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src',
      '@server': '/server'
    }
  }
});