/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    listParticipants: vi.fn(),
    createParticipant: vi.fn(),
    updateParticipant: vi.fn(),
    deleteParticipant: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { TripParticipantsPanel } from '../components/TripParticipantsPanel';

describe('TripParticipantsPanel', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    (tripApi.listParticipants as any).mockResolvedValue([
      { id: 'p1', tripId: 'trip-1', userId: null, displayName: 'Alice', createdAt: '' },
    ]);
  });

  it('lists existing participants', async () => {
    render(<TripParticipantsPanel tripId="trip-1" onParticipantsChanged={() => {}} />);
    expect(await screen.findByText('Alice')).toBeTruthy();
  });

  it('adds a new participant', async () => {
    (tripApi.createParticipant as any).mockResolvedValue({ id: 'p2', tripId: 'trip-1', userId: null, displayName: 'Bob', createdAt: '' });
    (tripApi.listParticipants as any)
      .mockResolvedValueOnce([{ id: 'p1', tripId: 'trip-1', userId: null, displayName: 'Alice', createdAt: '' }])
      .mockResolvedValueOnce([
        { id: 'p1', tripId: 'trip-1', userId: null, displayName: 'Alice', createdAt: '' },
        { id: 'p2', tripId: 'trip-1', userId: null, displayName: 'Bob', createdAt: '' },
      ]);

    render(<TripParticipantsPanel tripId="trip-1" onParticipantsChanged={() => {}} />);
    await screen.findByText('Alice');

    fireEvent.change(screen.getByPlaceholderText(/traveler name/i), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: /add traveler/i }));

    await waitFor(() => expect(tripApi.createParticipant).toHaveBeenCalledWith('trip-1', { displayName: 'Bob' }));
    expect(await screen.findByText('Bob')).toBeTruthy();
  });

  it('removes a participant and surfaces a 409 error message', async () => {
    (tripApi.deleteParticipant as any).mockRejectedValue(new Error('Cannot delete participant: attached to one or more bookings or seat assignments'));

    render(<TripParticipantsPanel tripId="trip-1" onParticipantsChanged={() => {}} />);
    await screen.findByText('Alice');
    fireEvent.click(screen.getByRole('button', { name: /remove alice/i }));

    expect(await screen.findByText(/attached to one or more bookings/i)).toBeTruthy();
  });

  it('reloads travelers when refreshKey changes', async () => {
    const { rerender } = render(<TripParticipantsPanel tripId="trip-1" onParticipantsChanged={() => {}} refreshKey={0} />);
    await waitFor(() => expect(tripApi.listParticipants).toHaveBeenCalledTimes(1));
    rerender(<TripParticipantsPanel tripId="trip-1" onParticipantsChanged={() => {}} refreshKey={1} />);
    await waitFor(() => expect(tripApi.listParticipants).toHaveBeenCalledTimes(2));
  });
});
