import { describe, it, expect } from 'vitest';
import { Booking, LodgingRoom, TripElement } from '../types/trip';
import { addDays, emptyStayDraft, stayDraftFromElement, stayPayload, validateStayDraft, isStayDraftDirty } from '../utils/stayDraft';
import { emptyRoomDraft, roomDraftFromRoom, roomPayload, validateRoomDraft } from '../utils/roomDraft';

const element: TripElement = {
  id: 'h1', tripId: 't1', elementType: 'hotel', name: 'Hyatt', sortPosition: 0, createdAt: '', updatedAt: '', notes: 'n',
  hotelDetails: {
    address: '1 Beach', phone: null, website: null, checkInDate: '2027-03-01', checkInTime: '15:00',
    checkOutDate: '2027-03-05', checkOutTime: '11:00', destinationId: null, amenities: ['pool'], otherAmenities: 'Bar',
  },
  bookingId: 'b1',
};

const booking: Booking = {
  id: 'b1', tripId: 't1', confirmationNumber: 'H-1', advertisedPriceCash: 1612, advertisedPricePoints: null,
  loyaltyProgram: 'Hyatt', notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: [],
  currentConfirmationNumber: 'H-1', actualTotalCash: 0, actualTotalPoints: 0,
  bookingSite: 'Expedia', siteItineraryNumber: '7231', advertisedIncludesTaxes: true,
  advertisedRateCash: 403, advertisedRatePoints: null, dueAtBookingCash: 1430, dueAtBookingPoints: null,
  dueLaterCash: 182.4, dueLaterNotes: 'Resort fee', refundability: 'free', cancelBy: '2027-02-27T18:00',
  cancellationPolicy: 'Free until 2 days', coupons: [{ id: 'c1', code: 'X', savingsCash: 10, savingsPoints: null, notes: null }],
};

describe('stay draft', () => {
  it('round-trips element + booking through the draft', () => {
    const draft = stayDraftFromElement(element, booking);
    expect(draft).toMatchObject({
      name: 'Hyatt', checkInTime: '15:00', amenities: ['pool'], otherAmenities: 'Bar',
      bookingSite: 'Expedia', siteItineraryNumber: '7231', confirmationNumber: 'H-1', loyaltyProgram: 'Hyatt',
      rateCash: '403', priceCash: '1612', includesTaxes: true,
      price: { totalCash: '1612.4', totalPoints: '', payAt: 'booking', otherCash: '182.4', notes: 'Resort fee' },
      refundability: 'free', cancelDate: '2027-02-27', cancelTime: '18:00',
      cancellationPolicy: 'Free until 2 days', coupons: [{ code: 'X', savingsCash: '10', savingsPoints: '', notes: '' }],
    });
    const payload = stayPayload(draft);
    expect(payload).toEqual({
      elementType: 'hotel', name: 'Hyatt', notes: 'n',
      typeSpecificData: {
        address: '1 Beach', phone: null, website: null, checkInDate: '2027-03-01', checkInTime: '15:00',
        checkOutDate: '2027-03-05', checkOutTime: '11:00', destinationId: null, amenities: ['pool'], otherAmenities: 'Bar',
      },
      booking: {
        bookingSite: 'Expedia', siteItineraryNumber: '7231', confirmationNumber: 'H-1', loyaltyProgram: 'Hyatt',
        advertisedRateCash: 403, advertisedRatePoints: null, advertisedPriceCash: 1612, advertisedPricePoints: null,
        advertisedIncludesTaxes: true, dueAtBookingCash: 1430, dueAtBookingPoints: null, dueLaterCash: 182.4,
        dueLaterNotes: 'Resort fee', payAt: 'booking', refundability: 'free', cancelBy: '2027-02-27T18:00', cancellationPolicy: 'Free until 2 days',
        coupons: [{ code: 'X', savingsCash: 10, savingsPoints: null, notes: null }],
      },
    });
  });

  it('keeps pay at check-in from the booking', () => {
    const draft = stayDraftFromElement(element, { ...booking, payAt: 'checkin', dueAtBookingCash: 100, dueLaterCash: 400 });
    expect(draft.price).toMatchObject({ totalCash: '500', payAt: 'checkin', otherCash: '100' });
    expect(stayPayload(draft).booking).toMatchObject({ dueAtBookingCash: 100, dueLaterCash: 400, payAt: 'checkin' });
  });

  it('builds a draft without a booking', () => {
    expect(stayDraftFromElement(element, null)).toMatchObject({ bookingSite: '', rateCash: '', coupons: [], refundability: null });
  });

  it('validates', () => {
    const ok = { ...emptyStayDraft(), name: 'X', checkInDate: '2027-01-01', checkOutDate: '2027-01-02' };
    expect(validateStayDraft(ok)).toBeNull();
    expect(validateStayDraft({ ...ok, name: ' ' })).toBe('Hotel name is required');
    expect(validateStayDraft({ ...ok, checkOutDate: '2027-01-01' })).toBe('Check-out must be after check-in');
    expect(validateStayDraft({ ...ok, price: { ...ok.price, otherCash: '-1' } })).toBe('Amounts must be 0 or more');
    expect(validateStayDraft({ ...ok, rateCash: 'abc' })).toBe('Amounts must be 0 or more');
    expect(validateStayDraft({ ...ok, price: { ...ok.price, totalPoints: '1.5' } })).toBe('Points must be a whole number, 0 or more');
    expect(validateStayDraft({ ...ok, price: { ...ok.price, totalCash: '5', otherCash: '6' } }))
      .toBe("Due at check-in can't be more than the total price");
    expect(validateStayDraft({ ...ok, cancelTime: '18:00' })).toBe('Add a cancel-by date for the time');
    expect(validateStayDraft({ ...ok, coupons: [{ code: '', savingsCash: '', savingsPoints: '', notes: '' }] })).toBe('Coupon code is required');
  });

  it('detects dirty drafts', () => {
    const start = emptyStayDraft();
    expect(isStayDraftDirty(start, emptyStayDraft())).toBe(false);
    expect(isStayDraftDirty(start, { ...start, name: 'a' })).toBe(true);
  });

  it('addDays crosses months', () => {
    expect(addDays('2027-01-31', 1)).toBe('2027-02-01');
  });
});

describe('room draft', () => {
  const room: LodgingRoom = {
    id: 'r1', elementId: 'h1', position: 0, roomType: 'suite', beds: [{ type: 'king', count: 1 }],
    description: 'Ocean', amenities: ['microwave'], otherAmenities: null, travelerIds: ['p1'],
  };

  it('round-trips a room', () => {
    const draft = roomDraftFromRoom(room);
    expect(draft).toEqual({ roomType: 'suite', beds: [{ type: 'king', count: 1 }], description: 'Ocean', amenities: ['microwave'], otherAmenities: '', travelerIds: ['p1'] });
    expect(roomPayload(draft)).toEqual({ roomType: 'suite', beds: [{ type: 'king', count: 1 }], description: 'Ocean', amenities: ['microwave'], otherAmenities: null, travelerIds: ['p1'] });
  });

  it('validates beds', () => {
    expect(validateRoomDraft(emptyRoomDraft())).toBeNull();
    expect(validateRoomDraft({ ...emptyRoomDraft(), beds: [{ type: 'king', count: 0 }] })).toBe('Bed count must be 1 to 9');
    expect(validateRoomDraft({ ...emptyRoomDraft(), beds: [{ type: 'king', count: 1 }, { type: 'king', count: 1 }] })).toBe('Each bed type may appear once');
  });
});
