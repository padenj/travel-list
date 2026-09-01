/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TripElement, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    listBookings: vi.fn(),
    createBooking: vi.fn(),
    createParticipant: vi.fn(),
    listBookingTransactions: vi.fn(),
    addBookingTransaction: vi.fn(),
    deleteBookingTransaction: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { BookingCard } from '../components/BookingCard';

const elements: TripElement[] = [
  { id: 'el-1', tripId: 'trip-1', elementType: 'flight', name: 'Departure Flights', sortPosition: 0, createdAt: '', updatedAt: '' },
  { id: 'el-2', tripId: 'trip-1', elementType: 'flight', name: 'Return Flights', sortPosition: 1, createdAt: '', updatedAt: '' },
];

const participants: TripParticipant[] = [
  { id: 'p1', tripId: 'trip-1', displayName: 'Alice', createdAt: '' },
];

describe('BookingCard', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    (tripApi.listBookings as any).mockResolvedValue([]);
    (tripApi.listBookingTransactions as any).mockResolvedValue([]);
  });

  it('shows "no bookings yet" when there are none for this element', async () => {
    render(<BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} />);
    expect(await screen.findByText(/no bookings/i)).toBeTruthy();
  });

  it('creates a booking with an existing traveler, advertised per-person price, and a linked second element', async () => {
    (tripApi.createBooking as any).mockResolvedValue({
      id: 'b1', tripId: 'trip-1', confirmationNumber: 'ABC123', advertisedPriceCash: 79, advertisedPricePoints: null,
      loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '',
      elementIds: ['el-1', 'el-2'], travelerIds: ['p1'], currentConfirmationNumber: 'ABC123', actualTotalCash: 0, actualTotalPoints: 0,
    });
    (tripApi.listBookings as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'b1', tripId: 'trip-1', confirmationNumber: 'ABC123', advertisedPriceCash: 79, advertisedPricePoints: null,
        loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '',
        elementIds: ['el-1', 'el-2'], travelerIds: ['p1'], currentConfirmationNumber: 'ABC123', actualTotalCash: 0, actualTotalPoints: 0,
      }]);

    render(<BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} />);
    await screen.findByText(/no bookings/i);

    fireEvent.click(screen.getByRole('button', { name: /add booking/i }));
    fireEvent.change(screen.getByLabelText(/confirmation number/i), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText(/advertised price per person \(cash\)/i), { target: { value: '79' } });
    fireEvent.click(screen.getByLabelText('Alice'));
    fireEvent.click(screen.getByLabelText('Return Flights'));
    fireEvent.click(screen.getByRole('button', { name: /save booking/i }));

    await waitFor(() => expect(tripApi.createBooking).toHaveBeenCalledWith('trip-1', expect.objectContaining({
      confirmationNumber: 'ABC123',
      advertisedPriceCash: 79,
      travelerIds: ['p1'],
      elementIds: expect.arrayContaining(['el-1', 'el-2']),
    })));
    expect(await screen.findByText('ABC123')).toBeTruthy();
  });

  it('shows "Also covers" for a booking linked to more than one element', async () => {
    (tripApi.listBookings as any).mockResolvedValue([{
      id: 'b1', tripId: 'trip-1', confirmationNumber: 'ABC123', advertisedPriceCash: 79, advertisedPricePoints: null,
      loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '',
      elementIds: ['el-1', 'el-2'], travelerIds: ['p1'], currentConfirmationNumber: 'ABC123', actualTotalCash: 0, actualTotalPoints: 0,
    }]);
    render(<BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} />);
    expect(await screen.findByText(/also covers/i)).toBeTruthy();
    expect(await screen.findByText('Return Flights')).toBeTruthy();
  });
});
