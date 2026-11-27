import { PaymentMethod } from '../types/trip';
import { getAuthToken } from '../api';

const API_BASE = '/api/payment-methods';

function headers(json = false): Record<string, string> {
  const token = getAuthToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `API Error: ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const paymentMethodApi = {
  list: async (includeArchived = false): Promise<PaymentMethod[]> =>
    handle(await fetch(`${API_BASE}${includeArchived ? '?includeArchived=1' : ''}`, { headers: headers() })),

  create: async (nickname: string): Promise<PaymentMethod> =>
    handle(await fetch(API_BASE, { method: 'POST', headers: headers(true), body: JSON.stringify({ nickname }) })),

  update: async (id: string, updates: { nickname?: string; archived?: boolean }): Promise<PaymentMethod> =>
    handle(await fetch(`${API_BASE}/${id}`, { method: 'PATCH', headers: headers(true), body: JSON.stringify(updates) })),

  remove: async (id: string): Promise<void> =>
    handle(await fetch(`${API_BASE}/${id}`, { method: 'DELETE', headers: headers() })),
};
