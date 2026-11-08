import { describe, it, expect } from 'vitest';
import { Booking, FlightLeg, TripElement } from '../types/trip';
import { buildFlightRows, flightTotals, formatClock, formatPrice, formatRowDate } from '../utils/flightRows';

function leg(overrides: Partial<FlightLeg>): FlightLeg {
  return {
    id: 'leg',
    elementId: 'el',
    legOrder: 1,
    departureAirport: 'DEN',
    departureDatetime: '2026-08-29T09:00',
    arrivalAirport: 'SJD',
    arrivalDatetime: '2026-08-29T13:05',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as FlightLeg;
}

function flight(id: string, name: string, legs: FlightLeg[], extra: Partial<TripElement> = {}): TripElement {
  return {
    id,
    tripId: 't',
    elementType: 'flight',
    name,
    sortPosition: 0,
    createdAt: '',
    updatedAt: '',
    legs,
    ...extra,
  } as TripElement;
}

function booking(id: string, elementIds: string[], extra: Partial<Booking> = {}): Booking {
  return {
    id,
    tripId: 't',
    confirmationNumber: null,
    advertisedPriceCash: null,
    advertisedPricePoints: null,
    loyaltyProgram: null,
    notes: null,
    createdAt: '',
    updatedAt: '',
    elementIds,
    travelerIds: [],
    currentConfirmationNumber: null,
    actualTotalCash: 0,
    actualTotalPoints: 0,
    ...extra,
  };
}

describe('flightRows formatting', () => {
  it('formats clock times', () => {
    expect(formatClock('2026-08-29T00:05')).toBe('12:05 AM');
    expect(formatClock('2026-08-29T09:00')).toBe('9:00 AM');
    expect(formatClock('2026-08-29T12:30')).toBe('12:30 PM');
    expect(formatClock('2026-08-29T19:35')).toBe('7:35 PM');
    expect(formatClock(undefined)).toBe('');
  });

  it('formats the row date with weekday', () => {
    expect(formatRowDate('2026-08-29T09:00')).toBe('Sat 8/29');
    expect(formatRowDate('')).toBe('');
  });

  it('formats cash, points, and both', () => {
    expect(formatPrice(5.6, 9000)).toBe('9,000 pts + $5.60');
    expect(formatPrice(undefined, 5000)).toBe('5,000 pts');
    expect(formatPrice(137, null)).toBe('$137.00');
    expect(formatPrice(null, null)).toBe('');
  });
});

describe('buildFlightRows', () => {
  const outbound = flight('el-1', 'DEN → PHX → SJD', [
    leg({ id: 'l2', legOrder: 2, departureAirport: 'PHX', departureDatetime: '2026-08-29T11:20', arrivalAirport: 'SJD', arrivalDatetime: '2026-08-29T13:05', airline: 'WN', flightNumber: '310' }),
    leg({ id: 'l1', legOrder: 1, departureAirport: 'DEN', departureDatetime: '2026-08-29T09:00', arrivalAirport: 'PHX', arrivalDatetime: '2026-08-29T10:10', airline: 'WN', flightNumber: '722', layoverMinutesAfter: 70 }),
  ]);
  const inbound = flight('el-2', 'SJD → DEN', [
    leg({ id: 'l3', departureAirport: 'SJD', departureDatetime: '2026-09-05T19:35', arrivalAirport: 'DEN', arrivalDatetime: '2026-09-06T00:10', airline: 'WN', flightNumber: '692' }),
  ]);

  it('builds sorted rows with ordered legs, layovers and day offsets', () => {
    const rows = buildFlightRows([inbound, outbound], []);
    expect(rows.map(r => r.id)).toEqual(['el-1', 'el-2']);
    expect(rows[0].dateLabel).toBe('Sat 8/29');
    expect(rows[0].legs).toEqual([
      { id: 'l1', label: 'WN722', route: 'DEN → PHX', times: '9:00 AM → 10:10 AM', layoverAfter: '1h 10m' },
      { id: 'l2', label: 'WN310', route: 'PHX → SJD', times: '11:20 AM → 1:05 PM', layoverAfter: null },
    ]);
    expect(rows[1].legs[0].times).toBe('7:35 PM → 12:10 AM +1');
  });

  it('sorts flights without legs last and shows no date', () => {
    const empty = flight('el-3', 'Home', []);
    const rows = buildFlightRows([empty, outbound], []);
    expect(rows.map(r => r.id)).toEqual(['el-1', 'el-3']);
    expect(rows[1].dateLabel).toBe('');
    expect(rows[1].legs).toEqual([]);
  });

  it('ignores non-flight elements', () => {
    const hotel = flight('el-h', 'Hotel', [], { elementType: 'hotel' });
    expect(buildFlightRows([hotel, outbound], []).map(r => r.id)).toEqual(['el-1']);
  });

  it('uses linked bookings for price, confirmation, count and shared flag', () => {
    const roundTrip = booking('b1', ['el-1', 'el-2'], { currentConfirmationNumber: 'XYZ789', confirmationNumber: 'ABC123', advertisedPriceCash: 11.2, advertisedPricePoints: 14000 });
    const solo = booking('b2', ['el-1'], { confirmationNumber: 'QRS456' });
    const rows = buildFlightRows([outbound, inbound], [roundTrip, solo]);
    expect(rows[0].confirmation).toBe('XYZ789, QRS456');
    expect(rows[0].priceLabel).toBe('14,000 pts + $11.20');
    expect(rows[0].priceShared).toBe(true);
    expect(rows[0].bookingCount).toBe(2);
    expect(rows[1].confirmation).toBe('XYZ789');
    expect(rows[1].bookingCount).toBe(1);
  });

  it('does not show the deprecated element-level booking reference', () => {
    const legacy = flight('el-4', 'Legacy', [leg({})], { bookingReference: 'LEGACY-REF' });
    expect(buildFlightRows([legacy], [])[0].confirmation).toBe('');
  });
});

describe('flightTotals', () => {
  it('counts each booking once even when it links several flights', () => {
    const a = flight('el-1', 'A', []);
    const b = flight('el-2', 'B', []);
    const shared = booking('b1', ['el-1', 'el-2'], { advertisedPriceCash: 11.2, advertisedPricePoints: 14000 });
    const other = booking('b2', ['el-2'], { advertisedPriceCash: 100 });
    const unrelated = booking('b3', ['hotel-1'], { advertisedPriceCash: 999 });
    const totals = flightTotals([a, b], [shared, other, unrelated]);
    expect(totals.cash).toBeCloseTo(111.2);
    expect(totals.points).toBe(14000);
    expect(totals.label).toBe('14,000 pts + $111.20');
  });

  it('returns an empty label when nothing is priced', () => {
    expect(flightTotals([flight('el-1', 'A', [])], []).label).toBe('');
  });
});
