import { describe, it, expect } from 'vitest';
import { validateStay, validateRoom, validateCoupons } from './lodgingValidation';

describe('validateStay', () => {
  const ok = { name: 'Hotel', checkInDate: '2027-01-01', checkOutDate: '2027-01-03' };
  it('accepts a minimal stay', () => expect(validateStay(ok, { partial: false })).toBeNull());
  it('requires a name', () => expect(validateStay({ ...ok, name: '  ' }, { partial: false })).toMatch(/name/i));
  it('requires both dates on create', () => expect(validateStay({ name: 'H', checkInDate: '2027-01-01' }, { partial: false })).toMatch(/check-out/i));
  it('rejects a bad date format', () => expect(validateStay({ ...ok, checkInDate: '01/01/2027' }, { partial: false })).toMatch(/YYYY-MM-DD/));
  it('requires check-out after check-in', () => expect(validateStay({ ...ok, checkOutDate: '2027-01-01' }, { partial: false })).toMatch(/after/i));
  it('rejects a bad time', () => expect(validateStay({ ...ok, checkInTime: '3pm' }, { partial: false })).toMatch(/HH:mm/));
  it('partial: merges with existing dates', () => {
    expect(validateStay({ checkOutDate: '2027-01-01' }, { partial: true, existing: { checkInDate: '2027-01-02', checkOutDate: '2027-01-05' } })).toMatch(/after/i);
    expect(validateStay({ checkInTime: '15:00' }, { partial: true, existing: { checkInDate: '2027-01-02', checkOutDate: '2027-01-05' } })).toBeNull();
  });
  it('partial: rejects clearing a date', () => {
    expect(validateStay({ checkInDate: null }, { partial: true, existing: { checkInDate: '2027-01-02', checkOutDate: '2027-01-05' } })).toMatch(/check-in/i);
  });
});

describe('validateRoom', () => {
  it('accepts an empty room', () => expect(validateRoom({})).toBeNull());
  it('accepts a full room', () => expect(validateRoom({
    roomType: 'suite', beds: [{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }],
    amenities: ['breakfast', 'pool'], refundability: 'free', cancelBy: '2027-01-01T18:00',
  })).toBeNull());
  it('rejects an unknown room type', () => expect(validateRoom({ roomType: 'penthouse' })).toMatch(/room type/i));
  it('rejects bad beds', () => {
    expect(validateRoom({ beds: [{ type: 'hammock', count: 1 }] })).toMatch(/bed/i);
    expect(validateRoom({ beds: [{ type: 'king', count: 0 }] })).toMatch(/1.*9/);
    expect(validateRoom({ beds: [{ type: 'king', count: 1 }, { type: 'king', count: 2 }] })).toMatch(/once/i);
  });
  it('rejects unknown amenities', () => expect(validateRoom({ amenities: ['spa'] })).toMatch(/amenit/i));
  it('rejects bad refundability', () => expect(validateRoom({ refundability: 'maybe' })).toMatch(/refundab/i));
  it('rejects bad cancelBy', () => expect(validateRoom({ cancelBy: 'tomorrow' })).toMatch(/cancel/i));
});

describe('validateCoupons', () => {
  it('accepts an empty list', () => expect(validateCoupons([])).toBeNull());
  it('requires an array', () => expect(validateCoupons('x')).toMatch(/array/i));
  it('requires a code', () => expect(validateCoupons([{ code: ' ' }])).toMatch(/code/i));
  it('rejects negative savings', () => expect(validateCoupons([{ code: 'A', savingsCash: -1 }])).toMatch(/savings/i));
  it('rejects fractional points', () => expect(validateCoupons([{ code: 'A', savingsPoints: 1.5 }])).toMatch(/points/i));
});
