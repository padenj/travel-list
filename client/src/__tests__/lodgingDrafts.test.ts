import { describe, it, expect } from 'vitest';
import { emptyStayDraft, stayDraftFromElement, validateStayDraft, stayPayload, addDays } from '../utils/stayDraft';
import { emptyRoomDraft, roomDraftFromBooking, validateRoomDraft, roomPayload } from '../utils/roomDraft';

describe('stay drafts', () => {
  it('addDays', () => expect(addDays('2027-02-28', 1)).toBe('2027-03-01'));
  it('validates', () => {
    expect(validateStayDraft({ ...emptyStayDraft(), name: '' })).toMatch(/name/i);
    expect(validateStayDraft({ ...emptyStayDraft(), name: 'H', checkInDate: '2027-01-02', checkOutDate: '2027-01-02' })).toMatch(/after/i);
    expect(validateStayDraft({ ...emptyStayDraft(), name: 'H', checkInDate: '2027-01-02', checkOutDate: '' })).toMatch(/check-out/i);
    expect(validateStayDraft({ ...emptyStayDraft(), name: 'H', checkInDate: '2027-01-02', checkOutDate: '2027-01-03' })).toBeNull();
  });
  it('builds a payload, blanks become null', () => {
    const draft = { ...emptyStayDraft(), name: ' Casa ', address: '1 Rd', checkInDate: '2027-01-02', checkOutDate: '2027-01-03', checkInTime: '15:00', notes: '' };
    expect(stayPayload(draft)).toEqual({
      elementType: 'hotel', name: 'Casa', notes: null,
      typeSpecificData: { address: '1 Rd', phone: null, website: null, checkInDate: '2027-01-02', checkInTime: '15:00',
        checkOutDate: '2027-01-03', checkOutTime: null, destinationId: null },
    });
  });
  it('round-trips an element', () => {
    const draft = stayDraftFromElement({ id: 'h', name: 'Casa', notes: 'n', elementType: 'hotel',
      hotelDetails: { address: 'A', phone: null, website: null, checkInDate: '2027-01-02', checkInTime: null, checkOutDate: '2027-01-03', checkOutTime: '11:00', destinationId: 'd1' } } as any);
    expect(draft).toMatchObject({ name: 'Casa', notes: 'n', address: 'A', phone: '', checkOutTime: '11:00', destinationId: 'd1' });
  });
});

describe('room drafts', () => {
  it('validates numbers, beds and coupons', () => {
    expect(validateRoomDraft({ ...emptyRoomDraft(), priceCash: 'abc' })).toMatch(/price/i);
    expect(validateRoomDraft({ ...emptyRoomDraft(), beds: [{ type: 'king', count: 1 }, { type: 'king', count: 1 }] })).toMatch(/once/i);
    expect(validateRoomDraft({ ...emptyRoomDraft(), coupons: [{ code: '', savingsCash: '', savingsPoints: '', notes: '' }] })).toMatch(/code/i);
    expect(validateRoomDraft({ ...emptyRoomDraft(), cancelTime: '18:00' })).toMatch(/date/i);
    expect(validateRoomDraft(emptyRoomDraft())).toBeNull();
  });
  it('builds a booking payload', () => {
    const draft = {
      ...emptyRoomDraft(), bookingSite: 'Expedia', siteItineraryNumber: '7300', confirmationNumber: 'H1',
      priceCash: '1612', pricePoints: '', includesTaxes: true, roomType: 'suite' as const,
      beds: [{ type: 'king' as const, count: 1 }], amenities: ['pool' as const], refundability: 'free' as const,
      cancelDate: '2027-02-27', cancelTime: '18:00',
      coupons: [{ code: 'EXP10', savingsCash: '42.18', savingsPoints: '', notes: '' }], travelerIds: [],
    };
    expect(roomPayload(draft, 'h1')).toEqual({
      elementIds: ['h1'], travelerIds: [],
      bookingSite: 'Expedia', siteItineraryNumber: '7300', confirmationNumber: 'H1', loyaltyProgram: null,
      advertisedPriceCash: 1612, advertisedPricePoints: null, advertisedIncludesTaxes: true, notes: null,
      room: { roomType: 'suite', beds: [{ type: 'king', count: 1 }], roomDescription: null, amenities: ['pool'], otherAmenities: null,
        refundability: 'free', cancelBy: '2027-02-27T18:00', cancellationPolicy: null },
      coupons: [{ code: 'EXP10', savingsCash: 42.18, savingsPoints: null, notes: null }],
    });
  });
  it('drafts from a booking', () => {
    const draft = roomDraftFromBooking({
      id: 'b', tripId: 't', confirmationNumber: 'H1', advertisedPriceCash: 900, advertisedPricePoints: null, loyaltyProgram: null,
      notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: ['p1'], currentConfirmationNumber: 'H1',
      actualTotalCash: 0, actualTotalPoints: 0, bookingSite: 'Expedia', siteItineraryNumber: null, advertisedIncludesTaxes: false,
      room: { roomType: null, beds: [], roomDescription: null, amenities: [], otherAmenities: null, refundability: null, cancelBy: '2027-02-27T18:00', cancellationPolicy: null },
      coupons: [],
    });
    expect(draft).toMatchObject({ confirmationNumber: 'H1', priceCash: '900', bookingSite: 'Expedia', cancelDate: '2027-02-27', cancelTime: '18:00', travelerIds: ['p1'] });
  });
});
