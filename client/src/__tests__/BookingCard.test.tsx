/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { Booking, TripElement, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    createBooking: vi.fn(),
    updateBooking: vi.fn(),
    deleteBooking: vi.fn(),
    createParticipant: vi.fn(),
    listBookingTransactions: vi.fn(),
    addBookingTransaction: vi.fn(),
    deleteBookingTransaction: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { BookingCard } from '../components/BookingCard';

const api = tripApi as any;

const leg = (id: string, elementId: string, from: string, dep: string, to: string, arr: string, code: [string, string]) => ({
  id, elementId, legOrder: 1, departureAirport: from, departureDatetime: dep, arrivalAirport: to, arrivalDatetime: arr,
  airline: code[0], flightNumber: code[1], createdAt: '', updatedAt: '',
});

const elements: TripElement[] = [
  {
    id: 'el-1', tripId: 'trip-1', elementType: 'flight', name: 'DEN → MCO', sortPosition: 0, createdAt: '', updatedAt: '',
    legs: [
      leg('l1', 'el-1', 'DEN', '2026-08-29T08:00', 'DAL', '2026-08-29T10:00', ['WN', '1234']),
      leg('l2', 'el-1', 'DAL', '2026-08-29T11:30', 'MCO', '2026-08-29T15:05', ['WN', '567']),
    ],
  },
  {
    id: 'el-2', tripId: 'trip-1', elementType: 'flight', name: 'MCO → DEN', sortPosition: 1, createdAt: '', updatedAt: '',
    legs: [leg('l3', 'el-2', 'MCO', '2026-09-05T18:00', 'DEN', '2026-09-05T20:10', ['WN', '890'])],
  },
  { id: 'h-1', tripId: 'trip-1', elementType: 'hotel', name: 'Diamante', sortPosition: 2, createdAt: '', updatedAt: '' },
];

const participants: TripParticipant[] = [
  { id: 'p1', tripId: 'trip-1', displayName: 'Alice', createdAt: '' },
  { id: 'p2', tripId: 'trip-1', displayName: 'Bob', createdAt: '' },
  { id: 'p3', tripId: 'trip-1', displayName: 'Carol', createdAt: '' },
];

function makeBooking(extra: Partial<Booking> = {}): Booking {
  return {
    id: 'b1', tripId: 'trip-1', confirmationNumber: 'ABC123', advertisedPriceCash: 412, advertisedPricePoints: null,
    loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '',
    elementIds: ['el-1', 'el-2'], travelerIds: ['p1'], currentConfirmationNumber: 'ABC123', actualTotalCash: 0, actualTotalPoints: 0,
    ...extra,
  };
}

const b1 = makeBooking();
const b2 = makeBooking({ id: 'b2', confirmationNumber: 'XYZ999', currentConfirmationNumber: 'XYZ999', elementIds: ['el-2'], travelerIds: ['p2'] });

function renderCard(props: Partial<React.ComponentProps<typeof BookingCard>> = {}) {
  const handlers = {
    onBookingsChanged: vi.fn(),
    onParticipantsChanged: vi.fn(),
    onEditingChange: vi.fn(),
  };
  renderWithMantine(
    <BookingCard
      tripId="trip-1"
      elementId="el-1"
      elements={elements}
      participants={participants}
      bookings={[b1, b2]}
      refreshKey={0}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

const checkbox = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

describe('BookingCard', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.resetAllMocks();
    api.listBookingTransactions.mockResolvedValue([]);
    api.createBooking.mockResolvedValue({});
    api.updateBooking.mockResolvedValue({});
    api.deleteBooking.mockResolvedValue(undefined);
  });

  it('shows only this flight\'s bookings with what they cover and every leg', async () => {
    renderCard();
    expect(screen.getByText('ABC123')).toBeTruthy();
    expect(screen.queryByText('XYZ999')).toBeNull();
    expect(screen.getByText('Covers: DEN → MCO (Aug 29) · MCO → DEN (Sep 5)')).toBeTruthy();
    expect(screen.getByText('WN1234 · DEN 8:00a → DAL 10:00a')).toBeTruthy();
    expect(screen.getByText('WN567 · DAL 11:30a → MCO 3:05p')).toBeTruthy();
    expect(screen.getByText('WN890 · MCO 6:00p → DEN 8:10p')).toBeTruthy();
    await screen.findAllByText(/no transactions yet/i);
  });

  it('lists travelers not booked on this flight', async () => {
    renderCard();
    expect(screen.getByText('Not booked: Bob, Carol')).toBeTruthy();
    await screen.findAllByText(/no transactions yet/i);
  });

  it('creates a booking with smart defaults and blocks already-booked travelers', async () => {
    const user = userEvent.setup();
    const { onBookingsChanged, onEditingChange } = renderCard();
    await user.click(screen.getByRole('button', { name: '+ Booking' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);

    expect(checkbox('DEN → MCO · Aug 29 · 2 legs').checked).toBe(true);
    expect(checkbox('MCO → DEN · Sep 5 · 1 leg').checked).toBe(false);
    expect(screen.queryByLabelText(/Diamante/)).toBeNull();
    expect(checkbox('Alice (on ABC123)').disabled).toBe(true);
    expect(checkbox('Alice (on ABC123)').checked).toBe(false);
    expect(checkbox('Bob').checked).toBe(true);
    expect(checkbox('Carol').checked).toBe(true);

    await user.type(screen.getByLabelText('Confirmation number'), 'NEW1');
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    await waitFor(() => expect(api.createBooking).toHaveBeenCalledWith('trip-1', {
      confirmationNumber: 'NEW1', loyaltyProgram: null, advertisedPriceCash: null, advertisedPricePoints: null, notes: null,
      elementIds: ['el-1'], travelerIds: ['p2', 'p3'],
    }));
    expect(onBookingsChanged).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save booking' })).toBeNull());
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('marks a checked traveler who is booked on another selected flight', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: '+ Booking' }));
    await user.click(checkbox('MCO → DEN · Sep 5 · 1 leg'));
    const bob = checkbox('Bob (on XYZ999)');
    expect(bob.checked).toBe(true);
    expect(bob.disabled).toBe(false);
  });

  it('edits a booking in place and saves flights and travelers in one call', async () => {
    const user = userEvent.setup();
    const { onBookingsChanged } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Edit booking' }));

    expect((screen.getByLabelText('Confirmation number') as HTMLInputElement).value).toBe('ABC123');
    expect(checkbox('Alice').checked).toBe(true);
    expect(checkbox('Alice').disabled).toBe(false);
    expect(checkbox('Bob (on XYZ999)').disabled).toBe(true);

    await user.click(checkbox('MCO → DEN · Sep 5 · 1 leg'));
    expect(checkbox('Bob').disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    await waitFor(() => expect(api.updateBooking).toHaveBeenCalledWith('trip-1', 'b1', expect.objectContaining({
      confirmationNumber: 'ABC123', advertisedPriceCash: 412, elementIds: ['el-1'], travelerIds: ['p1'],
    })));
    expect(onBookingsChanged).toHaveBeenCalled();
  });

  it('shows a conflict from the server inline and keeps the form open', async () => {
    const user = userEvent.setup();
    api.updateBooking.mockRejectedValue(new Error('Alice is already on booking XYZ999 for MCO → DEN'));
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Edit booking' }));
    await user.click(screen.getByRole('button', { name: 'Save booking' }));
    expect(await screen.findByText('Alice is already on booking XYZ999 for MCO → DEN')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save booking' })).toBeTruthy();
  });

  it('deletes a booking after confirming, naming its transactions', async () => {
    const user = userEvent.setup();
    api.listBookingTransactions.mockResolvedValue([
      { id: 't1', bookingId: 'b1', amountCash: 400, amountPoints: 0, transactionDate: '2026-01-01', confirmationNumber: null, notes: null, createdAt: '' },
      { id: 't2', bookingId: 'b1', amountCash: 12, amountPoints: 0, transactionDate: '2026-01-02', confirmationNumber: null, notes: null, createdAt: '' },
    ]);
    const { onBookingsChanged } = renderCard();
    await screen.findByText('$400.00');
    await user.click(screen.getByRole('button', { name: 'Delete booking' }));
    expect(screen.getByText('Delete booking ABC123 and its 2 transactions?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.deleteBooking).toHaveBeenCalledWith('trip-1', 'b1'));
    expect(onBookingsChanged).toHaveBeenCalled();
  });

  it('creates a new traveler once even when saving is retried', async () => {
    const user = userEvent.setup();
    api.createParticipant.mockResolvedValue({ id: 'p4', tripId: 'trip-1', displayName: 'Dave', createdAt: '' });
    api.createBooking.mockRejectedValueOnce(new Error('Network down')).mockResolvedValueOnce({});
    const { onParticipantsChanged } = renderCard();
    await user.click(screen.getByRole('button', { name: '+ Booking' }));
    await user.type(screen.getByLabelText('+ New traveler'), 'Dave');
    await user.click(screen.getByRole('button', { name: 'Save booking' }));
    expect(await screen.findByText('Network down')).toBeTruthy();
    expect(onParticipantsChanged).toHaveBeenCalledWith([...participants, expect.objectContaining({ id: 'p4' })]);

    await user.click(screen.getByRole('button', { name: 'Save booking' }));
    await waitFor(() => expect(api.createBooking).toHaveBeenCalledTimes(2));
    expect(api.createParticipant).toHaveBeenCalledTimes(1);
    expect(api.createBooking.mock.calls[1][1].travelerIds).toEqual(['p2', 'p3', 'p4']);
  });

  it('shows an empty message when the flight has no bookings', () => {
    renderCard({ bookings: [b2] });
    expect(screen.getByText('No bookings yet for this flight')).toBeTruthy();
    expect(screen.getByText('Not booked: Alice, Bob, Carol')).toBeTruthy();
  });

  it('drops a flight that no longer exists from elementIds when editing and saving', async () => {
    const user = userEvent.setup();
    const stale = makeBooking({
      id: 'b-stale', confirmationNumber: 'STALE1', currentConfirmationNumber: 'STALE1',
      elementIds: ['el-1', 'el-deleted'], travelerIds: ['p3'],
    });
    renderCard({ bookings: [stale] });

    await user.click(screen.getByRole('button', { name: 'Edit booking' }));
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    await waitFor(() => expect(api.updateBooking).toHaveBeenCalledWith('trip-1', 'b-stale', expect.objectContaining({
      elementIds: ['el-1'],
    })));
  });

  it('allows only one booking form open at a time', async () => {
    const user = userEvent.setup();
    const first = makeBooking({ id: 'b-first', confirmationNumber: 'AAA111', currentConfirmationNumber: 'AAA111', elementIds: ['el-1'], travelerIds: ['p2'] });
    const second = makeBooking({ id: 'b-second', confirmationNumber: 'BBB222', currentConfirmationNumber: 'BBB222', elementIds: ['el-1'], travelerIds: ['p3'] });
    renderCard({ bookings: [first, second] });

    expect(screen.getByRole('button', { name: '+ Booking' })).toBeTruthy();
    const editButtons = screen.getAllByRole('button', { name: 'Edit booking' });
    expect(editButtons).toHaveLength(2);

    await user.click(editButtons[0]);

    expect(screen.queryByRole('button', { name: '+ Booking' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Edit booking' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Delete booking' }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: '+ Booking' })).toBeTruthy();
    const editButtonsAfter = screen.getAllByRole('button', { name: 'Edit booking' });
    expect(editButtonsAfter).toHaveLength(2);
    editButtonsAfter.forEach(btn => expect((btn as HTMLButtonElement).disabled).toBe(false));
  });
});
