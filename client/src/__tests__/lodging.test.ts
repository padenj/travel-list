import { describe, it, expect } from 'vitest';
import {
  bedsLabel, amenitiesLabel, formatTime, perNight, cancelDeadlineState, cancelLabel,
  roomTitle, roomMoneyLine, couponsLabel, ROOM_TYPE_OPTIONS, BOOKING_SITES,
} from '../utils/lodging';
import { Booking } from '../types/trip';

const baseBooking: Booking = {
  id: 'b1', tripId: 't', confirmationNumber: null, advertisedPriceCash: null, advertisedPricePoints: null,
  loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: [],
  currentConfirmationNumber: null, actualTotalCash: 0, actualTotalPoints: 0,
};

describe('lodging labels', () => {
  it('bedsLabel', () => {
    expect(bedsLabel([{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }])).toBe('1 × King + 1 × Sofa bed');
    expect(bedsLabel([])).toBe('');
  });
  it('amenitiesLabel includes other amenities', () => {
    expect(amenitiesLabel(['breakfast', 'pool'], 'Rooftop bar')).toBe('Breakfast · Pool · Rooftop bar');
    expect(amenitiesLabel([], null)).toBe('');
  });
  it('formatTime', () => {
    expect(formatTime('15:00')).toBe('3:00 PM');
    expect(formatTime('00:30')).toBe('12:30 AM');
    expect(formatTime(null)).toBe('');
  });
  it('perNight', () => {
    expect(perNight(1612, '2027-03-01', '2027-03-05')).toBe(403);
    expect(perNight(100, '2027-03-01', null)).toBeNull();
    expect(perNight(null, '2027-03-01', '2027-03-05')).toBeNull();
  });
  it('roomTitle', () => {
    expect(roomTitle({ roomType: 'suite', beds: [{ type: 'king', count: 1 }] } as any)).toBe('Suite · 1 × King');
    expect(roomTitle(null)).toBe('Room');
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

describe('roomMoneyLine', () => {
  it('advertised total with taxes and per night, plus paid', () => {
    const b = { ...baseBooking, advertisedPriceCash: 1612, advertisedIncludesTaxes: true, actualTotalCash: 1580 };
    expect(roomMoneyLine(b, 4)).toBe('Adv $1,612.00 total incl. taxes ($403.00/nt) · Paid $1,580.00');
  });
  it('points only, no nights', () => {
    const b = { ...baseBooking, advertisedPricePoints: 40000 };
    expect(roomMoneyLine(b, null)).toBe('Adv 40,000 pts total · Paid $0.00');
  });
});
