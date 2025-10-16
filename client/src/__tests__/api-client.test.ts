import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setAuthToken, clearAuthToken, getAuthToken } from '../api';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
