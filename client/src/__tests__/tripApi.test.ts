/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../api', () => ({ getAuthToken: () => 'token' }));

import { tripApi, ApiConflictError } from '../api/tripApi';

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

describe('tripApi destinations', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws ApiConflictError carrying the body on 409', async () => {
    stubFetch(409, { error: 'member_in_other_destination', memberId: 'u1', destinationId: 'd1' });
    const error = await tripApi.createDestination('t1', { name: 'Paris', memberIds: ['u1'] }).catch(e => e);
    expect(error).toBeInstanceOf(ApiConflictError);
    expect(error.message).toBe('member_in_other_destination');
    expect(error.body).toEqual({ error: 'member_in_other_destination', memberId: 'u1', destinationId: 'd1' });
  });

  it('posts the split payload', async () => {
    stubFetch(201, { destinations: [], skippedCount: 0 });
    const payload = { sourceListId: 'l1', destinations: [{ name: 'A', memberIds: ['u1'] }, { name: 'B', memberIds: ['u2'] }], sharedItemsDestinationIndex: 1 };
    await expect(tripApi.splitList('t1', payload)).resolves.toEqual({ destinations: [], skippedCount: 0 });
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('/api/trips/t1/split');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('deletes a destination without parsing an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.reject(new Error('no body')) }));
    await expect(tripApi.deleteDestination('t1', 'd1', { deleteList: true })).resolves.toBeUndefined();
    expect(JSON.parse((fetch as any).mock.calls[0][1].body)).toEqual({ deleteList: true });
  });
});
