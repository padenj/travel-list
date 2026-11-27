import { describe, it, expect } from 'vitest';
import { Booking, TripDestination, TripElement } from '../types/trip';
import { buildLodgingRows, lodgingTotals, stayBooking } from '../utils/lodgingRows';

const now = new Date(2027, 1, 20, 12, 0);

function stay(id: string, over: Partial<TripElement> = {}, checkIn = '2027-03-01', checkOut = '2027-03-05'): TripElement {
  return {
    id, tripId: 't1', elementType: 'hotel', name: `Stay ${id}`, sortPosition: 0, createdAt: '', updatedAt: '',
    hotelDetails: { address: null, phone: null, website: null, checkInDate: checkIn, checkInTime: null, checkOutDate: checkOut, checkOutTime: null, destinationId: null },
    rooms: [], bookingId: `b-${id}`, ...over,
  };
}

function booking(elementId: string, over: Partial<Booking> = {}): Booking {
  return {
    id: `b-${elementId}`, tripId: 't1', confirmationNumber: null, advertisedPriceCash: null, advertisedPricePoints: null,
    loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '', elementIds: [elementId], travelerIds: [],
    currentConfirmationNumber: null, actualTotalCash: 0, actualTotalPoints: 0, ...over,
  };
}

describe('stayBooking', () => {
  it('finds by bookingId, else by link', () => {
    const b = booking('h1');
    expect(stayBooking(stay('h1'), [b])).toBe(b);
    expect(stayBooking(stay('h1', { bookingId: undefined }), [b])).toBe(b);
    expect(stayBooking(stay('h2'), [b])).toBeNull();
  });
});

describe('buildLodgingRows', () => {
  it('builds price with nightly rate, confirm label, room count and remaining', () => {
    const el = stay('h1', { rooms: [{ id: 'r1', elementId: 'h1', position: 0, roomType: 'suite', beds: [], description: null, amenities: [], otherAmenities: null, travelerIds: [] }] });
    const b = booking('h1', {
      advertisedPriceCash: 1612, advertisedRateCash: 403, siteItineraryNumber: '7231004', currentConfirmationNumber: 'H-88213',
      dueAtBookingCash: 1430, dueLaterCash: 182.4, actualTotalCash: 1430, refundability: 'free', cancelBy: '2027-02-27T18:00',
    });
    const [row] = buildLodgingRows([el], [b], [], now);
    expect(row).toMatchObject({
      priceLabel: '$1,612.00 ($403.00/nt)', confirmation: '7231004 / H-88213', roomCount: 1,
      remaining: 'Remaining $182.40 at check-in', deadline: { state: 'soon' },
    });
    expect(row.dateLabel).toBe('Mar 1 → Mar 5 · 4 nts');
  });

  it('falls back to total ÷ nights, then paid, then a dash', () => {
    expect(buildLodgingRows([stay('h1')], [booking('h1', { advertisedPriceCash: 1612 })], [], now)[0].priceLabel).toBe('$1,612.00 ($403.00/nt)');
    expect(buildLodgingRows([stay('h1')], [booking('h1', { actualTotalCash: 50 })], [], now)[0].priceLabel).toBe('Paid $50.00');
    expect(buildLodgingRows([stay('h1')], [], [], now)[0]).toMatchObject({ priceLabel: '—', confirmation: '—', remaining: null, deadline: null });
  });

  it('shows no remaining when paid in full or no dues', () => {
    expect(buildLodgingRows([stay('h1')], [booking('h1', { dueAtBookingCash: 100, actualTotalCash: 100 })], [], now)[0].remaining).toBeNull();
    expect(buildLodgingRows([stay('h1')], [booking('h1', { advertisedPriceCash: 100 })], [], now)[0].remaining).toBeNull();
  });

  it('uses only whichever confirmation numbers exist', () => {
    expect(buildLodgingRows([stay('h1')], [booking('h1', { currentConfirmationNumber: 'H-1' })], [], now)[0].confirmation).toBe('H-1');
  });

  it('attaches the destination and sorts by check-in', () => {
    const dest: TripDestination = { id: 'd1', tripId: 't1', name: 'Cabo', color: 'teal', position: 0, packingListId: 'pl1', memberIds: [] };
    const a = stay('a', {}, '2027-03-05', '2027-03-06');
    const b = stay('b', { hotelDetails: { ...stay('b').hotelDetails!, destinationId: 'd1' } });
    const rows = buildLodgingRows([a, b], [], [dest], now);
    expect(rows.map(r => r.id)).toEqual(['b', 'a']);
    expect(rows[0].destination).toEqual({ name: 'Cabo', color: 'teal' });
  });
});

describe('lodgingTotals', () => {
  it('uses dues, else advertised, else paid, per stay', () => {
    const els = [stay('h1'), stay('h2'), stay('h3')];
    const bs = [
      booking('h1', { dueAtBookingCash: 100, dueLaterCash: 20, advertisedPriceCash: 999 }),
      booking('h2', { advertisedPriceCash: 300, advertisedPricePoints: 1000 }),
      booking('h3', { actualTotalCash: 50 }),
    ];
    expect(lodgingTotals(els, bs)).toEqual({ cash: 470, points: 1000, label: '1,000 pts + $470.00' });
  });
});
