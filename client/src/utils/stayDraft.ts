import { TripElement } from '../types/trip';

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
  notes: string;
}

export function emptyStayDraft(): StayDraft {
  return { name: '', address: '', phone: '', website: '', checkInDate: '', checkInTime: '', checkOutDate: '', checkOutTime: '', destinationId: null, notes: '' };
}

export function stayDraftFromElement(element: TripElement): StayDraft {
  const h = element.hotelDetails;
  return {
    name: element.name ?? '', notes: element.notes ?? '',
    address: h?.address ?? '', phone: h?.phone ?? '', website: h?.website ?? '',
    checkInDate: h?.checkInDate ?? '', checkInTime: h?.checkInTime ?? '',
    checkOutDate: h?.checkOutDate ?? '', checkOutTime: h?.checkOutTime ?? '',
    destinationId: h?.destinationId ?? null,
  };
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateStayDraft(draft: StayDraft): string | null {
  if (!draft.name.trim()) return 'Hotel name is required';
  if (!draft.checkInDate) return 'Check-in date is required';
  if (!draft.checkOutDate) return 'Check-out date is required';
  if (!DATE_RE.test(draft.checkInDate) || !DATE_RE.test(draft.checkOutDate)) return 'Dates must be YYYY-MM-DD';
  if (draft.checkOutDate <= draft.checkInDate) return 'Check-out must be after check-in';
  return null;
}

const blank = (v: string) => (v.trim() ? v.trim() : null);

export function stayPayload(draft: StayDraft) {
  return {
    elementType: 'hotel' as const,
    name: draft.name.trim(),
    notes: blank(draft.notes),
    typeSpecificData: {
      address: blank(draft.address), phone: blank(draft.phone), website: blank(draft.website),
      checkInDate: draft.checkInDate, checkInTime: blank(draft.checkInTime),
      checkOutDate: draft.checkOutDate, checkOutTime: blank(draft.checkOutTime),
      destinationId: draft.destinationId || null,
    },
  };
}
