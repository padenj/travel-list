import { Booking, PropertyAmenity, Refundability, StayBookingPayload, TripElement } from '../types/trip';
import { PriceEntryValue, emptyPriceEntry, fromDues, toDues, validatePriceEntry } from './priceEntry';

export interface CouponDraft { code: string; savingsCash: string; savingsPoints: string; notes: string }

export interface StayDraft {
  name: string;
  address: string;
  phone: string;
  website: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  destinationId: string | null;
  amenities: PropertyAmenity[];
  otherAmenities: string;
  notes: string;
  bookingSite: string;
  siteItineraryNumber: string;
  confirmationNumber: string;
  loyaltyProgram: string;
  rateCash: string;
  ratePoints: string;
  priceCash: string;
  pricePoints: string;
  includesTaxes: boolean;
  price: PriceEntryValue;
  refundability: Refundability | null;
  cancelDate: string;
  cancelTime: string;
  cancellationPolicy: string;
  coupons: CouponDraft[];
}

export function emptyStayDraft(): StayDraft {
  return {
    name: '', address: '', phone: '', website: '', checkInDate: '', checkInTime: '', checkOutDate: '', checkOutTime: '',
    destinationId: null, amenities: [], otherAmenities: '', notes: '',
    bookingSite: '', siteItineraryNumber: '', confirmationNumber: '', loyaltyProgram: '',
    rateCash: '', ratePoints: '', priceCash: '', pricePoints: '', includesTaxes: false,
    price: emptyPriceEntry(),
    refundability: null, cancelDate: '', cancelTime: '', cancellationPolicy: '', coupons: [],
  };
}

const str = (v: number | string | null | undefined) => (v == null ? '' : String(v));

export function stayDraftFromElement(element: TripElement, booking: Booking | null | undefined): StayDraft {
  const h = element.hotelDetails;
  const b = booking ?? null;
  const cancelBy = b?.cancelBy ?? '';
  return {
    name: element.name ?? '', notes: element.notes ?? '',
    address: h?.address ?? '', phone: h?.phone ?? '', website: h?.website ?? '',
    checkInDate: h?.checkInDate ?? '', checkInTime: h?.checkInTime ?? '',
    checkOutDate: h?.checkOutDate ?? '', checkOutTime: h?.checkOutTime ?? '',
    destinationId: h?.destinationId ?? null,
    amenities: h?.amenities ?? [], otherAmenities: h?.otherAmenities ?? '',
    bookingSite: b?.bookingSite ?? '', siteItineraryNumber: b?.siteItineraryNumber ?? '',
    confirmationNumber: b?.confirmationNumber ?? '', loyaltyProgram: b?.loyaltyProgram ?? '',
    rateCash: str(b?.advertisedRateCash), ratePoints: str(b?.advertisedRatePoints),
    priceCash: str(b?.advertisedPriceCash), pricePoints: str(b?.advertisedPricePoints),
    includesTaxes: Boolean(b?.advertisedIncludesTaxes),
    price: b ? fromDues(b) : emptyPriceEntry(),
    refundability: b?.refundability ?? null,
    cancelDate: cancelBy.slice(0, 10), cancelTime: cancelBy.length > 10 ? cancelBy.slice(11, 16) : '',
    cancellationPolicy: b?.cancellationPolicy ?? '',
    coupons: (b?.coupons ?? []).map(c => ({ code: c.code, savingsCash: str(c.savingsCash), savingsPoints: str(c.savingsPoints), notes: c.notes ?? '' })),
  };
}

export function isStayDraftDirty(initial: StayDraft, current: StayDraft): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function num(v: string): number | null | 'invalid' {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
}

const badPoints = (v: string) => {
  const n = num(v);
  return n === 'invalid' || (typeof n === 'number' && !Number.isInteger(n));
};

export function validateStayDraft(draft: StayDraft): string | null {
  if (!draft.name.trim()) return 'Hotel name is required';
  if (!draft.checkInDate) return 'Check-in date is required';
  if (!draft.checkOutDate) return 'Check-out date is required';
  if (!DATE_RE.test(draft.checkInDate) || !DATE_RE.test(draft.checkOutDate)) return 'Dates must be YYYY-MM-DD';
  if (draft.checkOutDate <= draft.checkInDate) return 'Check-out must be after check-in';
  for (const v of [draft.rateCash, draft.priceCash]) {
    if (num(v) === 'invalid') return 'Amounts must be 0 or more';
  }
  for (const v of [draft.ratePoints, draft.pricePoints]) {
    if (badPoints(v)) return 'Points must be a whole number, 0 or more';
  }
  const priceProblem = validatePriceEntry(draft.price);
  if (priceProblem) return priceProblem;
  if (draft.cancelTime && !draft.cancelDate) return 'Add a cancel-by date for the time';
  for (const c of draft.coupons) {
    if (!c.code.trim()) return 'Coupon code is required';
    if (num(c.savingsCash) === 'invalid') return 'Coupon savings must be a number';
    if (badPoints(c.savingsPoints)) return 'Coupon points must be a whole number';
  }
  return null;
}

const blank = (v: string) => (v.trim() ? v.trim() : null);
const numOrNull = (v: string) => { const n = num(v); return typeof n === 'number' ? n : null; };

export function stayPayload(draft: StayDraft) {
  const booking: StayBookingPayload = {
    bookingSite: blank(draft.bookingSite),
    siteItineraryNumber: blank(draft.siteItineraryNumber),
    confirmationNumber: blank(draft.confirmationNumber),
    loyaltyProgram: blank(draft.loyaltyProgram),
    advertisedRateCash: numOrNull(draft.rateCash),
    advertisedRatePoints: numOrNull(draft.ratePoints),
    advertisedPriceCash: numOrNull(draft.priceCash),
    advertisedPricePoints: numOrNull(draft.pricePoints),
    advertisedIncludesTaxes: draft.includesTaxes,
    ...toDues(draft.price),
    refundability: draft.refundability,
    cancelBy: draft.cancelDate ? (draft.cancelTime ? `${draft.cancelDate}T${draft.cancelTime}` : draft.cancelDate) : null,
    cancellationPolicy: blank(draft.cancellationPolicy),
    coupons: draft.coupons.map(c => ({ code: c.code.trim(), savingsCash: numOrNull(c.savingsCash), savingsPoints: numOrNull(c.savingsPoints), notes: blank(c.notes) })),
  };
  return {
    elementType: 'hotel' as const,
    name: draft.name.trim(),
    notes: blank(draft.notes),
    typeSpecificData: {
      address: blank(draft.address), phone: blank(draft.phone), website: blank(draft.website),
      checkInDate: draft.checkInDate, checkInTime: blank(draft.checkInTime),
      checkOutDate: draft.checkOutDate, checkOutTime: blank(draft.checkOutTime),
      destinationId: draft.destinationId || null,
      amenities: draft.amenities, otherAmenities: blank(draft.otherAmenities),
    },
    booking,
  };
}
