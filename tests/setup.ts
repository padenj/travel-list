import { vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage for Node.js environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock
});

// Provide a minimal navigator.clipboard mock for testing-library/user-event
if (typeof (global as any).navigator === 'undefined') {
  (global as any).navigator = {};
}
if (typeof (global as any).navigator.clipboard === 'undefined') {
  (global as any).navigator.clipboard = {
    writeText: async (_text: string) => {},
    readText: async () => ''
  };
}