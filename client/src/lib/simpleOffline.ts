/**
 * Simple offline check persistence using localStorage
 * No IndexedDB, no sync engine - just a simple backup mechanism
 */

const CHECKS_KEY = 'offline_checks_v1';

interface CheckState {
  listId: string;
  itemId: string;
  userId: string | null;
  checked: boolean;
  timestamp: string;
}

export function saveCheckLocally(listId: string, itemId: string, userId: string | null, checked: boolean) {
  try {
    const checks = getLocalChecks();
    const key = `${listId}:${itemId}:${userId || 'null'}`;
    checks[key] = { listId, itemId, userId, checked, timestamp: new Date().toISOString() };
    localStorage.setItem(CHECKS_KEY, JSON.stringify(checks));
    console.log('[simpleOffline] Saved check locally', key, checked);
  } catch (e) {
    console.warn('[simpleOffline] Failed to save check', e);
  }
}

export function getLocalChecks(): Record<string, CheckState> {
  try {
    const raw = localStorage.getItem(CHECKS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function getLocalCheckState(listId: string, itemId: string, userId: string | null): boolean | null {
  const checks = getLocalChecks();
  const key = `${listId}:${itemId}:${userId || 'null'}`;
  const state = checks[key];
  return state ? state.checked : null;
}

export function clearCheckAfterSync(listId: string, itemId: string, userId: string | null) {
  try {
    const checks = getLocalChecks();
    const key = `${listId}:${itemId}:${userId || 'null'}`;
    delete checks[key];
    localStorage.setItem(CHECKS_KEY, JSON.stringify(checks));
    console.log('[simpleOffline] Cleared synced check', key);
  } catch (e) {
    console.warn('[simpleOffline] Failed to clear check', e);
  }
}

export function getPendingChecks(): CheckState[] {
  const checks = getLocalChecks();
  return Object.values(checks);
}

// Attempt to flush pending checks by calling an injected sender function.
// The sender should be an async function with signature (listId, itemId, userId, checked) => ApiResponse
export async function flushPendingChecks(sender: (listId: string, itemId: string, userId: string | null, checked: boolean) => Promise<any>) {
  const pending = getPendingChecks();
  for (const p of pending) {
    try {
      // attempt send
      const res = await sender(p.listId, p.itemId, p.userId, p.checked);
      // support both fetch Response and ApiResponse wrapper ({ response, data })
      const ok = (res && typeof res === 'object' && 'response' in res) ? !!res.response?.ok : (res && typeof res.ok === 'boolean' ? res.ok : false);
      if (ok) {
        // clear on success
        clearCheckAfterSync(p.listId, p.itemId, p.userId);
        console.log('[simpleOffline] Flushed pending check', p.listId, p.itemId, p.userId);
      } else {
        console.warn('[simpleOffline] Server did not accept pending check, will keep locally', p, res);
      }
    } catch (e) {
      console.warn('[simpleOffline] Failed to flush pending check', p, e);
      // leave in storage to try again later
    }
  }
}
