import { describe, it, expect } from 'vitest';
import { validateStay, validateRoom, validateCoupons, validateBookingFields, PROPERTY_AMENITIES, ROOM_AMENITIES } from './lodgingValidation';

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

describe('amenity lists', () => {
  it('splits property and room amenities', () => {
    expect(PROPERTY_AMENITIES).toEqual(['breakfast', 'pool', 'hot_tub', 'parking', 'wifi', 'laundry', 'airport_shuttle', 'gym']);
    expect(ROOM_AMENITIES).toEqual(['fridge', 'microwave', 'kitchenette', 'jetted_tub', 'balcony']);
  });
});

describe('validateStay amenities', () => {
  const base = { name: 'Casa', checkInDate: '2027-01-01', checkOutDate: '2027-01-03' };
  it('accepts property amenities', () => {
    expect(validateStay({ ...base, amenities: ['pool', 'breakfast'], otherAmenities: 'EV charger' }, { partial: false })).toBeNull();
  });
  it('rejects room amenities at property level', () => {
    expect(validateStay({ ...base, amenities: ['microwave'] }, { partial: false })).toBe('Unknown amenity');
  });
  it('rejects non-array amenities, also on partial updates', () => {
    expect(validateStay({ ...base, amenities: 'pool' }, { partial: false })).toBe('Amenities must be an array');
    expect(validateStay({ amenities: 'pool' }, { partial: true, existing: { checkInDate: '2027-01-01', checkOutDate: '2027-01-03' } }))
      .toBe('Amenities must be an array');
  });
});

describe('validateRoom', () => {
  it('accepts a full room', () => {
    expect(validateRoom({
      roomType: 'suite', beds: [{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }],
      description: 'Ocean view', amenities: ['microwave', 'jetted_tub'], otherAmenities: null, travelerIds: ['p1'],
    })).toBeNull();
  });
  it('accepts an empty room', () => {
    expect(validateRoom({})).toBeNull();
  });
  it('rejects non-objects', () => {
    expect(validateRoom(null)).toBe('Room must be an object');
  });
  it('rejects unknown room type', () => {
    expect(validateRoom({ roomType: 'castle' })).toBe('Unknown room type');
  });
  it('rejects property amenities on a room', () => {
    expect(validateRoom({ amenities: ['pool'] })).toBe('Unknown amenity');
  });
  it('rejects bad beds', () => {
    expect(validateRoom({ beds: [{ type: 'king', count: 0 }] })).toBe('Bed count must be 1 to 9');
    expect(validateRoom({ beds: [{ type: 'hammock', count: 1 }] })).toBe('Unknown bed type');
    expect(validateRoom({ beds: [{ type: 'king', count: 1 }, { type: 'king', count: 2 }] })).toBe('Each bed type may appear once');
  });
  it('rejects non-array travelerIds', () => {
    expect(validateRoom({ travelerIds: 'p1' })).toBe('Travelers must be an array');
  });
});

describe('validateBookingFields', () => {
  it('accepts an empty body', () => {
    expect(validateBookingFields({})).toBeNull();
  });
  it('accepts all fields', () => {
    expect(validateBookingFields({
      advertisedPriceCash: 612.4, advertisedPricePoints: 0, advertisedRateCash: 189, advertisedRatePoints: null,
      dueAtBookingCash: 430, dueAtBookingPoints: 0, dueLaterCash: 182.4, dueLaterNotes: 'resort fee',
      refundability: 'partial', cancelBy: '2027-01-01T18:00', cancellationPolicy: '1 night penalty',
      coupons: [{ code: 'SAVE10', savingsCash: 10 }],
    })).toBeNull();
  });
  it('rejects negative cash', () => {
    expect(validateBookingFields({ dueLaterCash: -1 })).toBe('Amounts must be 0 or more');
    expect(validateBookingFields({ advertisedRateCash: 'x' })).toBe('Amounts must be 0 or more');
  });
  it('rejects non-integer points', () => {
    expect(validateBookingFields({ dueAtBookingPoints: 1.5 })).toBe('Points must be a whole number, 0 or more');
  });
  it('rejects bad refundability and cancelBy', () => {
    expect(validateBookingFields({ refundability: 'maybe' })).toBe('Unknown refundability');
    expect(validateBookingFields({ cancelBy: '01/02/2027' })).toBe('Cancel-by must be YYYY-MM-DD or YYYY-MM-DDTHH:mm');
  });
  it('delegates coupon validation', () => {
    expect(validateBookingFields({ coupons: [{ code: '' }] })).toBe('Coupon code is required');
  });
});

describe('validateCoupons', () => {
  it('accepts an empty list', () => expect(validateCoupons([])).toBeNull());
  it('requires an array', () => expect(validateCoupons('x')).toMatch(/array/i));
  it('requires a code', () => expect(validateCoupons([{ code: ' ' }])).toMatch(/code/i));
  it('rejects negative savings', () => expect(validateCoupons([{ code: 'A', savingsCash: -1 }])).toMatch(/savings/i));
  it('rejects fractional points', () => expect(validateCoupons([{ code: 'A', savingsPoints: 1.5 }])).toMatch(/points/i));
});
