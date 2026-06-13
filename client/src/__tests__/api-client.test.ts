import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    }
  },
  configurable: true
});

let setAuthToken: typeof import('../api').setAuthToken;
let clearAuthToken: typeof import('../api').clearAuthToken;
let getAuthToken: typeof import('../api').getAuthToken;
let addCategoryItemsToItemGroup: typeof import('../api').addCategoryItemsToItemGroup;

describe('API Client', () => {
  beforeAll(async () => {
    const api = await import('../api');
    setAuthToken = api.setAuthToken;
    clearAuthToken = api.clearAuthToken;
    getAuthToken = api.getAuthToken;
    addCategoryItemsToItemGroup = api.addCategoryItemsToItemGroup;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    storage.clear();
    clearAuthToken();
  });

  it('should set auth token', () => {
    // Create a valid JWT token that won't expire for a long time
    const payload = {
      id: 'test-id',
      username: 'testuser',
      role: 'TestRole',
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30) // 30 days from now
    };
    const header = { alg: 'HS256', typ: 'JWT' };
    const token = btoa(JSON.stringify(header)) + '.' + btoa(JSON.stringify(payload)) + '.signature';
    
    setAuthToken(token);
    expect(getAuthToken()).toBe(token);
  });

  it('should clear auth token', () => {
    // Create a valid JWT token for this test too
    const payload = {
      id: 'test-id',
      username: 'testuser',
      role: 'TestRole',
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30) // 30 days from now
    };
    const header = { alg: 'HS256', typ: 'JWT' };
    const token = btoa(JSON.stringify(header)) + '.' + btoa(JSON.stringify(payload)) + '.signature';
    
    setAuthToken(token);
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  it('should automatically clear expired tokens', () => {
    // Create an expired JWT token
    const expiredPayload = {
      id: 'test-id',
      username: 'testuser',
      role: 'TestRole',
      exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago (expired)
    };
    const header = { alg: 'HS256', typ: 'JWT' };
    const expiredToken = btoa(JSON.stringify(header)) + '.' + btoa(JSON.stringify(expiredPayload)) + '.signature';
    
    setAuthToken(expiredToken);
    // Getting the token should return null since it's expired
    expect(getAuthToken()).toBeNull();
  });

  it('should add category items to an item group and return items', async () => {
    const payload = {
      id: 'test-id',
      username: 'testuser',
      role: 'TestRole',
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30)
    };
    const header = { alg: 'HS256', typ: 'JWT' };
    const token = btoa(JSON.stringify(header)) + '.' + btoa(JSON.stringify(payload)) + '.signature';
    setAuthToken(token);

    const items = [{ id: 'item-1', name: 'Passport' }];
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ items })
    });

    await expect(addCategoryItemsToItemGroup('group-1', ['cat-1', 'cat-2'])).resolves.toEqual(items);
    expect(mockFetch).toHaveBeenCalledWith('/api/item-group/group-1/add-category-items', {
      method: 'POST',
      body: JSON.stringify({ categoryIds: ['cat-1', 'cat-2'] }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  });
});
