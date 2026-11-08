/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    listSeatsForLeg: vi.fn(),
    assignSeat: vi.fn(),
    removeSeat: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { FlightSeatGrid } from '../components/FlightSeatGrid';

const travelers: TripParticipant[] = [
  { id: 'p1', tripId: 'trip-1', displayName: 'Alice', createdAt: '' },
  { id: 'p2', tripId: 'trip-1', displayName: 'Bob', createdAt: '' },
];

describe('FlightSeatGrid', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    (tripApi.listSeatsForLeg as any).mockResolvedValue([]);
  });

  it('renders one seat input per traveler on the booking(s) linked to this leg element', async () => {
    render(<FlightSeatGrid tripId="trip-1" legId="leg-1" travelers={travelers} />);
    expect(await screen.findByLabelText(/alice.*seat/i)).toBeTruthy();
    expect(await screen.findByLabelText(/bob.*seat/i)).toBeTruthy();
  });

  it('saves a seat number on blur', async () => {
    (tripApi.assignSeat as any).mockResolvedValue({ id: 's1', legId: 'leg-1', participantId: 'p1', seatNumber: '14C', createdAt: '', updatedAt: '' });
    render(<FlightSeatGrid tripId="trip-1" legId="leg-1" travelers={travelers} />);
    const input = await screen.findByLabelText(/alice.*seat/i);
    fireEvent.change(input, { target: { value: '14C' } });
    fireEvent.blur(input);
    await waitFor(() => expect(tripApi.assignSeat).toHaveBeenCalledWith('trip-1', 'leg-1', 'p1', '14C'));
  });

  it('confirms a saved seat and surfaces save errors', async () => {
    (tripApi.assignSeat as any).mockResolvedValue({});
    render(<FlightSeatGrid tripId="trip-1" legId="leg-1" travelers={travelers} />);
    const input = await screen.findByLabelText(/alice seat/i);
    fireEvent.change(input, { target: { value: '14C' } });
    fireEvent.blur(input);
    expect(await screen.findByText(/saved/i)).toBeTruthy();

    (tripApi.assignSeat as any).mockRejectedValue(new Error('nope'));
    fireEvent.change(input, { target: { value: '15A' } });
    fireEvent.blur(input);
    expect(await screen.findByText(/nope/)).toBeTruthy();
  });
});
