/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { cleanup, screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { Booking, TripElement, TripParticipant } from '../types/trip';

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

function makeBooking(extra: Partial<Booking> = {}): Booking {
  return {
    id: 'b1', tripId: 'trip-1', confirmationNumber: 'ABC123', advertisedPriceCash: 79, advertisedPricePoints: null,
    loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '',
    elementIds: ['el-1'], travelerIds: ['p1'], currentConfirmationNumber: 'ABC123', actualTotalCash: 0, actualTotalPoints: 0,
    ...extra,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof BookingCard>> = {}) {
  return renderWithMantine(
    <BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} {...props} />
  );
}

describe('BookingCard', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    (tripApi.listBookings as any).mockResolvedValue([]);
    (tripApi.listBookingTransactions as any).mockResolvedValue([]);
  });

  it('shows "no bookings yet" and no redundant heading when there are none', async () => {
    renderCard();
    expect(await screen.findByText(/no bookings yet for this flight/i)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /^bookings$/i })).toBeNull();
  });

  it('keeps the add form collapsed until "+ Booking" is clicked and collapses on cancel', async () => {
    renderCard();
    await screen.findByText(/no bookings/i);
    expect(screen.queryByLabelText(/confirmation number/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /\+ booking/i }));
    expect(screen.getByLabelText(/confirmation number/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByLabelText(/confirmation number/i)).toBeNull();
  });

  it('creates a booking with an existing traveler, advertised per-person price, and a linked second element', async () => {
    const created = makeBooking({ elementIds: ['el-1', 'el-2'] });
    (tripApi.createBooking as any).mockResolvedValue(created);
    (tripApi.listBookings as any).mockResolvedValueOnce([]).mockResolvedValueOnce([created]);

    renderCard();
    await screen.findByText(/no bookings/i);

    fireEvent.click(screen.getByRole('button', { name: /\+ booking/i }));
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
    expect(screen.queryByLabelText(/confirmation number/i)).toBeNull();
  });

  it('requires at least one traveler', async () => {
    renderCard();
    await screen.findByText(/no bookings/i);
    fireEvent.click(screen.getByRole('button', { name: /\+ booking/i }));
    fireEvent.click(screen.getByRole('button', { name: /save booking/i }));
    expect(await screen.findByText(/select or add at least one traveler/i)).toBeTruthy();
    expect(tripApi.createBooking).not.toHaveBeenCalled();
  });

  it('renders a compact booking: confirmation, traveler chips and the money line', async () => {
    (tripApi.listBookings as any).mockResolvedValue([makeBooking({ advertisedPriceCash: 200, actualTotalCash: 10 })]);
    renderCard();
    expect(await screen.findByText('ABC123')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Advertised $200.00/person · Paid $10.00 ($10.00/person)')).toBeTruthy();
    expect(screen.queryByText(/originally booked/i)).toBeNull();
  });

  it('shows "Also covers" for a booking linked to more than one element', async () => {
    (tripApi.listBookings as any).mockResolvedValue([makeBooking({ elementIds: ['el-1', 'el-2'] })]);
    renderCard();
    expect(await screen.findByText(/also covers/i)).toBeTruthy();
    expect(await screen.findByText('Return Flights')).toBeTruthy();
  });

  it('shows the original confirmation after a rebook changed the current one', async () => {
    (tripApi.listBookings as any).mockResolvedValue([
      makeBooking({ currentConfirmationNumber: 'XYZ789', actualTotalCash: 137.96 }),
    ]);
    renderCard();
    expect(await screen.findByText('XYZ789')).toBeTruthy();
    expect(screen.getByText('orig ABC123')).toBeTruthy();
    expect(screen.getByText(/\$137\.96 \(\$137\.96\/person\)/)).toBeTruthy();
  });

  it('shows a placeholder when a booking has no confirmation number', async () => {
    (tripApi.listBookings as any).mockResolvedValue([
      makeBooking({ confirmationNumber: null, currentConfirmationNumber: null }),
    ]);
    renderCard();
    expect(await screen.findByText(/no confirmation number/i)).toBeTruthy();
  });

  it('refetches bookings when refreshKey changes', async () => {
    const { rerender } = renderCard({ refreshKey: 0 });
    await waitFor(() => expect(tripApi.listBookings).toHaveBeenCalledTimes(1));
    rerender(
      <MantineProvider env="test">
        <BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} refreshKey={1} />
      </MantineProvider>
    );
    await waitFor(() => expect(tripApi.listBookings).toHaveBeenCalledTimes(2));
  });
});
