import { describe, it, expect } from 'vitest';
import { buildLodgingRows, lodgingTotals } from '../utils/lodgingRows';
import { Booking, TripDestination, TripElement } from '../types/trip';

const now = new Date(2027, 1, 20, 12, 0);
function stay(id: string, name: string, checkIn: string, checkOut: string, destinationId: string | null = null): TripElement {
  return { id, tripId: 't', elementType: 'hotel', name, sortPosition: 0, createdAt: '', updatedAt: '',
    hotelDetails: { address: null, phone: null, website: null, checkInDate: checkIn, checkInTime: null, checkOutDate: checkOut, checkOutTime: null, destinationId } };
}
function room(id: string, elementId: string, extra: Partial<Booking> = {}): Booking {
  return { id, tripId: 't', confirmationNumber: null, advertisedPriceCash: null, advertisedPricePoints: null, loyaltyProgram: null,
    notes: null, createdAt: '', updatedAt: '', elementIds: [elementId], travelerIds: [], currentConfirmationNumber: null,
    actualTotalCash: 0, actualTotalPoints: 0, room: null, coupons: [], ...extra };
}
const destinations: TripDestination[] = [{ id: 'd1', tripId: 't', name: 'Paris', color: '#f00', position: 0, packingListId: 'p', memberIds: [] }];

describe('buildLodgingRows', () => {
  it('sorts by check-in then name and ignores non-hotels', () => {
    const rows = buildLodgingRows([
      stay('b', 'Beta', '2027-03-01', '2027-03-02'), stay('a', 'Alpha', '2027-03-01', '2027-03-02'),
      stay('c', 'Earlier', '2027-02-01', '2027-02-02'), { ...stay('f', 'Flight', '', ''), elementType: 'flight' },
    ], [], destinations, now);
    expect(rows.map(r => r.name)).toEqual(['Earlier', 'Alpha', 'Beta']);
  });

  it('builds date, price, confirm, room count and destination', () => {
    const rows = buildLodgingRows([stay('h', 'Hyatt', '2027-03-01', '2027-03-05', 'd1')], [
      room('r1', 'h', { advertisedPriceCash: 1000, siteItineraryNumber: '7231', currentConfirmationNumber: 'H-1' }),
      room('r2', 'h', { advertisedPriceCash: 612, siteItineraryNumber: '9999', currentConfirmationNumber: 'H-2' }),
    ], destinations, now);
    expect(rows[0]).toMatchObject({
      id: 'h', nights: 4, priceLabel: '$1,612.00 ($403.00/nt)',
      confirmation: '7231 / H-1 +1', roomCount: 2, destination: { name: 'Paris', color: '#f00' },
    });
    expect(rows[0].dateLabel).toMatch(/Mar 1 → Mar 5 · 4 nts/);
  });

  it('falls back to paid, then a dash', () => {
    const paid = buildLodgingRows([stay('h', 'H', '2027-03-01', '2027-03-03')], [room('r', 'h', { actualTotalCash: 300 })], [], now);
    expect(paid[0].priceLabel).toBe('Paid $300.00');
    const none = buildLodgingRows([stay('h', 'H', '2027-03-01', '2027-03-03')], [], [], now);
    expect(none[0]).toMatchObject({ priceLabel: '—', confirmation: '—', roomCount: 0 });
  });

  it('no +N when rooms share a confirmation', () => {
    const rows = buildLodgingRows([stay('h', 'H', '2027-03-01', '2027-03-03')], [
      room('r1', 'h', { siteItineraryNumber: '7231' }), room('r2', 'h', { siteItineraryNumber: '7231' }),
    ], [], now);
    expect(rows[0].confirmation).toBe('7231');
  });

  it('picks the earliest non-passed deadline, else the latest passed', () => {
    const r = (id: string, cancelBy: string) => room(id, 'h', { room: { roomType: null, beds: [], roomDescription: null, amenities: [], otherAmenities: null, refundability: 'free', cancelBy, cancellationPolicy: null } });
    const upcoming = buildLodgingRows([stay('h', 'H', '2027-03-01', '2027-03-03')], [r('a', '2027-03-10'), r('b', '2027-02-25'), r('c', '2027-02-01')], [], now);
    expect(upcoming[0].deadline).toEqual({ label: 'Free cancel until Feb 25', state: 'soon' });
    const passed = buildLodgingRows([stay('h', 'H', '2027-03-01', '2027-03-03')], [r('a', '2027-02-01'), r('b', '2027-02-10')], [], now);
    expect(passed[0].deadline).toEqual({ label: 'Free cancel until Feb 10', state: 'passed' });
  });
});

describe('lodgingTotals', () => {
  it('sums advertised totals across rooms of non-deleted stays, falling back to paid per room', () => {
    const elements = [stay('h', 'H', '2027-03-01', '2027-03-03')];
    const bookings = [room('r1', 'h', { advertisedPriceCash: 1000 }), room('r2', 'h', { advertisedPricePoints: 40000, actualTotalCash: 0 }),
      room('r3', 'h', { actualTotalCash: 200 }), room('orphan', 'gone', { advertisedPriceCash: 999 })];
    expect(lodgingTotals(elements, bookings).label).toBe('40,000 pts + $1,200.00');
  });
});
