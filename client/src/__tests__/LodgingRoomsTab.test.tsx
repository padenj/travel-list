/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { LodgingRoomsTab } from '../components/LodgingRoomsTab';
import { Booking, TripElement, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: { deleteBooking: vi.fn(), listBookingTransactions: vi.fn().mockResolvedValue([]), createBooking: vi.fn(), updateBooking: vi.fn(), createParticipant: vi.fn() },
}));

const stay: TripElement = {
  id: 'h1', tripId: 't1', elementType: 'hotel', name: 'Hyatt', sortPosition: 0, createdAt: '', updatedAt: '',
  hotelDetails: { address: null, phone: null, website: null, checkInDate: '2027-03-01', checkInTime: null, checkOutDate: '2027-03-05', checkOutTime: null, destinationId: null },
};
const participants = [{ id: 'p1', displayName: 'Jeremy' }, { id: 'p2', displayName: 'Grandma' }] as TripParticipant[];
const room: Booking = {
  id: 'r1', tripId: 't1', confirmationNumber: 'H-80000', advertisedPriceCash: 1612, advertisedPricePoints: null, loyaltyProgram: null,
  notes: 'Late arrival', createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: ['p1'], currentConfirmationNumber: 'H-88213',
  actualTotalCash: 1580, actualTotalPoints: 0, bookingSite: 'Expedia', siteItineraryNumber: '7231004', advertisedIncludesTaxes: true,
  room: { roomType: 'suite', beds: [{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }], roomDescription: null, amenities: ['breakfast', 'pool'],
    otherAmenities: 'Rooftop bar', refundability: 'free', cancelBy: '2099-02-27T18:00', cancellationPolicy: null },
  coupons: [{ code: 'EXPEDIA10', savingsCash: 42.18, savingsPoints: null, notes: null }],
};

function renderTab(bookings: Booking[], initialFormOpen = false) {
  return renderWithMantine(<LodgingRoomsTab tripId="t1" stay={stay} participants={participants} bookings={bookings}
    onParticipantsChanged={() => {}} refreshKey={0} onBookingsChanged={() => {}} onEditingChange={() => {}} initialFormOpen={initialFormOpen} />);
}

describe('LodgingRoomsTab', () => {
  afterEach(() => cleanup());

  it('shows the empty state', () => {
    renderTab([]);
    expect(screen.getByText('No rooms yet for this stay')).toBeTruthy();
  });

  it('renders the room summary lines', () => {
    renderTab([room]);
    expect(screen.getByText('Suite · 1 × King + 1 × Sofa bed')).toBeTruthy();
    expect(screen.getByText('Expedia 7231004 · Hotel H-88213 · orig H-80000')).toBeTruthy();
    expect(screen.getByText('Adv $1,612.00 total incl. taxes ($403.00/nt) · Paid $1,580.00')).toBeTruthy();
    expect(screen.getByText('Free cancel until Feb 27, 6:00 PM')).toBeTruthy();
    expect(screen.getByText('Breakfast · Pool · Rooftop bar')).toBeTruthy();
    expect(screen.getByText('Coupons: EXPEDIA10 −$42.18')).toBeTruthy();
    expect(screen.getByText('Late arrival')).toBeTruthy();
    expect(screen.getByText('Jeremy')).toBeTruthy();
    expect(screen.getByText('Not in a room: Grandma')).toBeTruthy();
  });

  it('opens the form from + Room and when initialFormOpen', async () => {
    renderTab([]);
    await userEvent.click(screen.getByRole('button', { name: '+ Room' }));
    expect(screen.getByRole('button', { name: 'Save room' })).toBeTruthy();
    cleanup();
    renderTab([], true);
    expect(screen.getByRole('button', { name: 'Save room' })).toBeTruthy();
  });

  it('asks before deleting a room', async () => {
    renderTab([room]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete room' }));
    expect(screen.getByText(/Delete room H-88213/)).toBeTruthy();
  });
});
