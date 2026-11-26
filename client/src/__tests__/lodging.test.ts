import { describe, it, expect } from 'vitest';
import {
  PROPERTY_AMENITY_OPTIONS, ROOM_AMENITY_OPTIONS, HOUR_OPTIONS, CHECK_IN_QUICK, CHECK_OUT_QUICK, hourLabel,
  nightlyPrice, paymentSummary, roomTitle, amenitiesLabel,
  bedsLabel, formatTime, cancelDeadlineState, cancelLabel, couponsLabel, ROOM_TYPE_OPTIONS, BOOKING_SITES,
} from '../utils/lodging';
import { Booking } from '../types/trip';

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1', tripId: 't1', confirmationNumber: null, advertisedPriceCash: null, advertisedPricePoints: null,
  loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: [],
  currentConfirmationNumber: null, actualTotalCash: 0, actualTotalPoints: 0, ...over,
});

describe('lodging labels', () => {
  it('bedsLabel', () => {
    expect(bedsLabel([{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }])).toBe('1 × King + 1 × Sofa bed');
    expect(bedsLabel([])).toBe('');
  });
  it('formatTime', () => {
    expect(formatTime('15:00')).toBe('3:00 PM');
    expect(formatTime('00:30')).toBe('12:30 AM');
    expect(formatTime(null)).toBe('');
  });
  it('couponsLabel', () => {
    expect(couponsLabel([{ code: 'EXP10', savingsCash: 42.18, savingsPoints: null, notes: null }, { code: 'PTS', savingsCash: null, savingsPoints: 500, notes: null }]))
      .toBe('Coupons: EXP10 −$42.18 · PTS −500 pts');
    expect(couponsLabel([])).toBe('');
  });
  it('exposes options', () => {
    expect(ROOM_TYPE_OPTIONS.map(o => o.value)).toContain('2br');
    expect(BOOKING_SITES[0]).toBe('Expedia');
  });
});

describe('cancelDeadlineState', () => {
  const now = new Date(2027, 1, 20, 12, 0); // Feb 20 2027, noon local
  it('ok when more than 7 days away', () => expect(cancelDeadlineState('2027-02-28', now)).toBe('ok'));
  it('soon at exactly 7 days', () => expect(cancelDeadlineState('2027-02-27', now)).toBe('soon'));
  it('soon today (date-only counts to end of day)', () => expect(cancelDeadlineState('2027-02-20', now)).toBe('soon'));
  it('passed yesterday', () => expect(cancelDeadlineState('2027-02-19', now)).toBe('passed'));
  it('passed earlier today with a time', () => expect(cancelDeadlineState('2027-02-20T09:00', now)).toBe('passed'));
  it('soon later today with a time', () => expect(cancelDeadlineState('2027-02-20T18:00', now)).toBe('soon'));
  it('none when missing', () => expect(cancelDeadlineState(null, now)).toBe('none'));
});

describe('cancelLabel', () => {
  it('free with a deadline', () => expect(cancelLabel({ refundability: 'free', cancelBy: '2027-02-27T18:00' } as any)).toBe('Free cancel until Feb 27, 6:00 PM'));
  it('partial', () => expect(cancelLabel({ refundability: 'partial', cancelBy: '2027-02-27' } as any)).toBe('Partial refund until Feb 27'));
  it('non-refundable', () => expect(cancelLabel({ refundability: 'nonrefundable', cancelBy: null } as any)).toBe('Non-refundable'));
  it('deadline only', () => expect(cancelLabel({ refundability: null, cancelBy: '2027-02-27' } as any)).toBe('Cancel by Feb 27'));
  it('nothing', () => expect(cancelLabel(null)).toBe(''));
});

describe('amenity options', () => {
  it('splits property and room amenities', () => {
    expect(PROPERTY_AMENITY_OPTIONS.map(o => o.value)).toEqual(['breakfast', 'pool', 'hot_tub', 'parking', 'wifi', 'laundry', 'airport_shuttle', 'gym']);
    expect(ROOM_AMENITY_OPTIONS.map(o => o.value)).toEqual(['fridge', 'microwave', 'kitchenette', 'jetted_tub', 'balcony']);
    expect(ROOM_AMENITY_OPTIONS.find(o => o.value === 'jetted_tub')!.label).toBe('Jetted tub');
  });
  it('labels amenities from either list', () => {
    expect(amenitiesLabel(['pool', 'microwave'], 'EV charger')).toBe('Pool · Microwave · EV charger');
  });
});

describe('hours', () => {
  it('lists 24 on-the-hour options labelled like "3 PM"', () => {
    expect(HOUR_OPTIONS).toHaveLength(24);
    expect(HOUR_OPTIONS[0]).toEqual({ value: '00:00', label: '12 AM' });
    expect(HOUR_OPTIONS[12]).toEqual({ value: '12:00', label: '12 PM' });
    expect(HOUR_OPTIONS[15]).toEqual({ value: '15:00', label: '3 PM' });
    expect(CHECK_IN_QUICK).toEqual(['14:00', '15:00', '16:00', '17:00']);
    expect(CHECK_OUT_QUICK).toEqual(['10:00', '11:00', '12:00']);
  });
  it('hourLabel keeps legacy minutes', () => {
    expect(hourLabel('15:00')).toBe('3 PM');
    expect(hourLabel('15:30')).toBe('3:30 PM');
    expect(hourLabel(null)).toBe('');
  });
});

describe('nightlyPrice', () => {
  it('prefers the advertised nightly rate', () => {
    expect(nightlyPrice(booking({ advertisedRateCash: 189, advertisedPriceCash: 900 }), 4)).toBe(189);
  });
  it('falls back to total divided by nights', () => {
    expect(nightlyPrice(booking({ advertisedPriceCash: 1612 }), 4)).toBe(403);
    expect(nightlyPrice(booking({ advertisedPriceCash: 100 }), 3)).toBe(33.33);
  });
  it('returns null without data', () => {
    expect(nightlyPrice(booking(), 4)).toBeNull();
    expect(nightlyPrice(booking({ advertisedPriceCash: 100 }), null)).toBeNull();
    expect(nightlyPrice(null, 4)).toBeNull();
  });
});

describe('paymentSummary', () => {
  it('is null when no due amounts are set', () => {
    expect(paymentSummary(booking({ advertisedPriceCash: 900 }))).toBeNull();
    expect(paymentSummary(null)).toBeNull();
  });
  it('reports the remaining at check-in once the booking part is paid', () => {
    const s = paymentSummary(booking({ dueAtBookingCash: 1430, dueLaterCash: 182.4, actualTotalCash: 1430 }))!;
    expect(s).toMatchObject({ dueCash: 1612.4, paidCash: 1430, remainingCash: 182.4, remainingPoints: 0, atCheckIn: true });
    expect(s.label).toBe('Remaining $182.40 at check-in');
  });
  it('includes the unpaid booking part', () => {
    const s = paymentSummary(booking({ dueAtBookingCash: 1430, dueLaterCash: 182.4, actualTotalCash: 1000 }))!;
    expect(s.atCheckIn).toBe(false);
    expect(s.remainingCash).toBe(612.4);
    expect(s.label).toBe('Remaining $612.40 (incl. $430.00 due at booking)');
  });
  it('handles a booking with nothing due later', () => {
    expect(paymentSummary(booking({ dueAtBookingCash: 500 }))!.label).toBe('Remaining $500.00 (incl. $500.00 due at booking)');
  });
  it('reports paid in full and clamps overpayment', () => {
    const s = paymentSummary(booking({ dueAtBookingCash: 100, dueLaterCash: 50, actualTotalCash: 200 }))!;
    expect(s).toMatchObject({ remainingCash: 0, atCheckIn: false, label: 'Paid in full' });
  });
  it('tracks points due at booking', () => {
    const s = paymentSummary(booking({ dueAtBookingPoints: 9000, dueLaterCash: 40, actualTotalPoints: 0 }))!;
    expect(s).toMatchObject({ duePoints: 9000, remainingPoints: 9000, remainingCash: 40, atCheckIn: false });
    expect(s.label).toBe('Remaining 9,000 pts + $40.00 (incl. 9,000 pts due at booking)');
    const paidPts = paymentSummary(booking({ dueAtBookingPoints: 9000, dueLaterCash: 40, actualTotalPoints: 9000 }))!;
    expect(paidPts.label).toBe('Remaining $40.00 at check-in');
  });
});

describe('roomTitle', () => {
  it('joins type and beds', () => {
    expect(roomTitle({ roomType: 'suite', beds: [{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }] })).toBe('Suite · 1 × King + 1 × Sofa bed');
    expect(roomTitle({ roomType: null, beds: [] })).toBe('Room');
  });
});
