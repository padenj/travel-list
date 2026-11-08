/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../api', () => ({ getAuthToken: () => 'token' }));

import { tripApi } from '../api/tripApi';

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }));
}

describe('tripApi error handling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws the server error message', async () => {
    stubFetch(409, { error: 'Alice is already on booking ABC123 for DEN → MCO' });
    await expect(tripApi.updateBooking('t1', 'b1', { travelerIds: ['p1'] }))
      .rejects.toThrow('Alice is already on booking ABC123 for DEN → MCO');
  });

  it('falls back to the status code when the body has no error', async () => {
    stubFetch(500, {});
    await expect(tripApi.listBookings('t1')).rejects.toThrow('API Error: 500');
  });

  it('surfaces the server message when deleting a booking fails', async () => {
    stubFetch(404, { error: 'Booking not found' });
    await expect(tripApi.deleteBooking('t1', 'b1')).rejects.toThrow('Booking not found');
  });
});
