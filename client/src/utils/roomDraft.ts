import { AmenityKey, BedCount, Booking, CreateBookingPayload, Refundability, RoomType } from '../types/trip';

export interface CouponDraft { code: string; savingsCash: string; savingsPoints: string; notes: string }

export interface RoomDraft {
  bookingSite: string;
  siteItineraryNumber: string;
  confirmationNumber: string;
  loyaltyProgram: string;
  priceCash: string;
  pricePoints: string;
  includesTaxes: boolean;
  roomType: RoomType | null;
  beds: BedCount[];
  roomDescription: string;
  amenities: AmenityKey[];
  otherAmenities: string;
  refundability: Refundability | null;
  cancelDate: string;
  cancelTime: string;
  cancellationPolicy: string;
  coupons: CouponDraft[];
  travelerIds: string[];
  notes: string;
}

export function emptyRoomDraft(): RoomDraft {
  return {
    bookingSite: '', siteItineraryNumber: '', confirmationNumber: '', loyaltyProgram: '',
    priceCash: '', pricePoints: '', includesTaxes: false,
    roomType: null, beds: [], roomDescription: '', amenities: [], otherAmenities: '',
    refundability: null, cancelDate: '', cancelTime: '', cancellationPolicy: '',
    coupons: [], travelerIds: [], notes: '',
  };
}

const str = (v: number | string | null | undefined) => (v == null ? '' : String(v));

export function roomDraftFromBooking(booking: Booking): RoomDraft {
  const room = booking.room;
  const cancelBy = room?.cancelBy ?? '';
  return {
    bookingSite: booking.bookingSite ?? '', siteItineraryNumber: booking.siteItineraryNumber ?? '',
    confirmationNumber: booking.confirmationNumber ?? '', loyaltyProgram: booking.loyaltyProgram ?? '',
    priceCash: str(booking.advertisedPriceCash), pricePoints: str(booking.advertisedPricePoints),
    includesTaxes: Boolean(booking.advertisedIncludesTaxes),
    roomType: room?.roomType ?? null, beds: room?.beds ?? [], roomDescription: room?.roomDescription ?? '',
    amenities: room?.amenities ?? [], otherAmenities: room?.otherAmenities ?? '',
    refundability: room?.refundability ?? null,
    cancelDate: cancelBy.slice(0, 10), cancelTime: cancelBy.length > 10 ? cancelBy.slice(11, 16) : '',
    cancellationPolicy: room?.cancellationPolicy ?? '',
    coupons: (booking.coupons ?? []).map(c => ({ code: c.code, savingsCash: str(c.savingsCash), savingsPoints: str(c.savingsPoints), notes: c.notes ?? '' })),
    travelerIds: booking.travelerIds, notes: booking.notes ?? '',
  };
}

function num(v: string): number | null | 'invalid' {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
}

export function validateRoomDraft(draft: RoomDraft): string | null {
  if (num(draft.priceCash) === 'invalid') return 'Advertised price must be a number';
  const pts = num(draft.pricePoints);
  if (pts === 'invalid' || (typeof pts === 'number' && !Number.isInteger(pts))) return 'Advertised points must be a whole number';
  const seen = new Set<string>();
  for (const bed of draft.beds) {
    if (!Number.isInteger(bed.count) || bed.count < 1 || bed.count > 9) return 'Bed count must be 1 to 9';
    if (seen.has(bed.type)) return 'Each bed type may appear once';
    seen.add(bed.type);
  }
  if (draft.cancelTime && !draft.cancelDate) return 'Add a cancel-by date for the time';
  for (const c of draft.coupons) {
    if (!c.code.trim()) return 'Coupon code is required';
    if (num(c.savingsCash) === 'invalid') return 'Coupon savings must be a number';
    const p = num(c.savingsPoints);
    if (p === 'invalid' || (typeof p === 'number' && !Number.isInteger(p))) return 'Coupon points must be a whole number';
  }
  return null;
}

const blank = (v: string) => (v.trim() ? v.trim() : null);
const numOrNull = (v: string) => { const n = num(v); return typeof n === 'number' ? n : null; };

export function roomPayload(draft: RoomDraft, stayId: string): CreateBookingPayload {
  return {
    elementIds: [stayId],
    travelerIds: draft.travelerIds,
    bookingSite: blank(draft.bookingSite),
    siteItineraryNumber: blank(draft.siteItineraryNumber),
    confirmationNumber: blank(draft.confirmationNumber),
    loyaltyProgram: blank(draft.loyaltyProgram),
    advertisedPriceCash: numOrNull(draft.priceCash),
    advertisedPricePoints: numOrNull(draft.pricePoints),
    advertisedIncludesTaxes: draft.includesTaxes,
    notes: blank(draft.notes),
    room: {
      roomType: draft.roomType,
      beds: draft.beds,
      roomDescription: blank(draft.roomDescription),
      amenities: draft.amenities,
      otherAmenities: blank(draft.otherAmenities),
      refundability: draft.refundability,
      cancelBy: draft.cancelDate ? (draft.cancelTime ? `${draft.cancelDate}T${draft.cancelTime}` : draft.cancelDate) : null,
      cancellationPolicy: blank(draft.cancellationPolicy),
    },
    coupons: draft.coupons.map(c => ({ code: c.code.trim(), savingsCash: numOrNull(c.savingsCash), savingsPoints: numOrNull(c.savingsPoints), notes: blank(c.notes) })),
  };
}
