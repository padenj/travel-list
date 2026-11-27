import { BedCount, BedType, Booking, BookingCoupon, PropertyAmenity, Refundability, RoomAmenity, RoomType } from '../types/trip';
import { formatPrice } from './flightRows';
import { formatMoney } from './money';

export const ROOM_TYPE_OPTIONS: { value: RoomType; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'suite', label: 'Suite' },
  { value: 'studio', label: 'Studio' },
  { value: '1br', label: '1 bedroom' },
  { value: '2br', label: '2 bedroom' },
  { value: '3br', label: '3 bedroom' },
  { value: 'other', label: 'Other' },
];

export const BED_TYPE_OPTIONS: { value: BedType; label: string }[] = [
  { value: 'king', label: 'King' },
  { value: 'queen', label: 'Queen' },
  { value: 'full', label: 'Full' },
  { value: 'twin', label: 'Twin' },
  { value: 'sofa_bed', label: 'Sofa bed' },
  { value: 'bunk', label: 'Bunk' },
  { value: 'crib', label: 'Crib' },
];

export const PROPERTY_AMENITY_OPTIONS: { value: PropertyAmenity; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'pool', label: 'Pool' },
  { value: 'hot_tub', label: 'Hot tub' },
  { value: 'parking', label: 'Parking' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'airport_shuttle', label: 'Airport shuttle' },
  { value: 'gym', label: 'Gym' },
];

export const ROOM_AMENITY_OPTIONS: { value: RoomAmenity; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'microwave', label: 'Microwave' },
  { value: 'kitchenette', label: 'Kitchenette' },
  { value: 'jetted_tub', label: 'Jetted tub' },
  { value: 'balcony', label: 'Balcony' },
];

const ALL_AMENITY_OPTIONS = [...PROPERTY_AMENITY_OPTIONS, ...ROOM_AMENITY_OPTIONS] as { value: string; label: string }[];

export const REFUNDABILITY_OPTIONS: { value: Refundability; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'partial', label: 'Partial' },
  { value: 'nonrefundable', label: 'Non-refundable' },
];

export const BOOKING_SITES = [
  'Expedia', 'Hotels.com', 'Booking.com', 'Direct', 'Chase Travel', 'Amex Travel', 'Costco Travel', 'Capital One Travel',
];

function labelOf<T extends string>(options: { value: T; label: string }[], value: T | null | undefined): string {
  return options.find(o => o.value === value)?.label ?? '';
}

export function roomTypeLabel(value: RoomType | null | undefined): string {
  return labelOf(ROOM_TYPE_OPTIONS, value);
}

export function bedsLabel(beds: BedCount[] | null | undefined): string {
  return (beds ?? []).map(b => `${b.count} × ${labelOf(BED_TYPE_OPTIONS, b.type)}`).join(' + ');
}

export function amenitiesLabel(amenities: string[] | null | undefined, other: string | null | undefined): string {
  const parts = (amenities ?? []).map(a => ALL_AMENITY_OPTIONS.find(o => o.value === a)?.label ?? '').filter(Boolean);
  if (other?.trim()) parts.push(other.trim());
  return parts.join(' · ');
}

export function formatTime(value: string | null | undefined): string {
  const m = value?.match(/^(\d{2}):(\d{2})$/);
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

// "15:00" → "3 PM"; legacy values with minutes keep them ("15:30" → "3:30 PM").
export function hourLabel(value: string | null | undefined): string {
  const m = value?.match(/^(\d{2}):(\d{2})$/);
  if (!m) return '';
  if (m[2] !== '00') return formatTime(value);
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}

export const HOUR_OPTIONS: { value: string; label: string }[] = Array.from({ length: 24 }, (_, h) => {
  const value = `${String(h).padStart(2, '0')}:00`;
  return { value, label: hourLabel(value) };
});

export const CHECK_IN_QUICK = ['14:00', '15:00', '16:00', '17:00'];
export const CHECK_OUT_QUICK = ['10:00', '11:00', '12:00'];

function shortDate(ymd: string): string {
  const [y, mo, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDeadline(cancelBy: string): string {
  const time = cancelBy.length > 10 ? formatTime(cancelBy.slice(11, 16)) : '';
  return time ? `${shortDate(cancelBy)}, ${time}` : shortDate(cancelBy);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function nightlyPrice(booking: Booking | null | undefined, nights: number | null | undefined): number | null {
  if (!booking) return null;
  if (booking.advertisedRateCash != null) return booking.advertisedRateCash;
  if (booking.advertisedPriceCash != null && nights && nights > 0) return round2(booking.advertisedPriceCash / nights);
  return null;
}

export type DeadlineState = 'none' | 'ok' | 'soon' | 'passed';

// A date-only deadline lasts until the end of that day. "soon" = within 7 days, today included.
export function cancelDeadlineState(cancelBy: string | null | undefined, now: Date = new Date()): DeadlineState {
  if (!cancelBy) return 'none';
  const [y, mo, d] = cancelBy.slice(0, 10).split('-').map(Number);
  const deadline = cancelBy.length > 10
    ? new Date(y, mo - 1, d, Number(cancelBy.slice(11, 13)), Number(cancelBy.slice(14, 16)))
    : new Date(y, mo - 1, d, 23, 59, 59, 999);
  if (deadline.getTime() < now.getTime()) return 'passed';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadlineDay = new Date(y, mo - 1, d);
  const days = Math.round((deadlineDay.getTime() - today.getTime()) / 86400000);
  return days <= 7 ? 'soon' : 'ok';
}

export function cancelLabel(room: Pick<Booking, 'refundability' | 'cancelBy'> | null | undefined): string {
  if (!room) return '';
  const until = room.cancelBy ? formatDeadline(room.cancelBy) : '';
  switch (room.refundability) {
    case 'free': return until ? `Free cancel until ${until}` : 'Free cancellation';
    case 'partial': return until ? `Partial refund until ${until}` : 'Partial refund';
    case 'nonrefundable': return 'Non-refundable';
    default: return until ? `Cancel by ${until}` : '';
  }
}

export function roomTitle(room: { roomType: RoomType | null; beds: BedCount[] } | null | undefined): string {
  if (!room) return 'Room';
  const parts = [roomTypeLabel(room.roomType), bedsLabel(room.beds)].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Room';
}

export function couponsLabel(coupons: BookingCoupon[] | null | undefined): string {
  if (!coupons?.length) return '';
  const items = coupons.map(c => {
    const savings = [c.savingsCash ? `−${formatMoney(c.savingsCash)}` : '', c.savingsPoints ? `−${c.savingsPoints.toLocaleString('en-US')} pts` : '']
      .filter(Boolean).join(' ');
    return savings ? `${c.code} ${savings}` : c.code;
  });
  return `Coupons: ${items.join(' · ')}`;
}

export interface PaymentSummary {
  dueCash: number;
  duePoints: number;
  paidCash: number;
  paidPoints: number;
  remainingCash: number;
  remainingPoints: number;
  atCheckIn: boolean;
  label: string;
}

// Remaining = (due at booking + due at check-in) − paid transactions, never below zero.
export function paymentSummary(booking: Booking | null | undefined): PaymentSummary | null {
  if (!booking) return null;
  if (booking.dueAtBookingCash == null && booking.dueAtBookingPoints == null && booking.dueLaterCash == null) return null;
  const dueLater = booking.dueLaterCash ?? 0;
  const dueCash = round2((booking.dueAtBookingCash ?? 0) + dueLater);
  const duePoints = booking.dueAtBookingPoints ?? 0;
  const paidCash = booking.actualTotalCash ?? 0;
  const paidPoints = booking.actualTotalPoints ?? 0;
  const remainingCash = Math.max(0, round2(dueCash - paidCash));
  const remainingPoints = Math.max(0, duePoints - paidPoints);
  const atCheckIn = remainingCash > 0 && remainingCash <= dueLater && remainingPoints === 0;

  let label: string;
  if (remainingCash === 0 && remainingPoints === 0) {
    label = 'Paid in full';
  } else if (atCheckIn) {
    label = `Remaining ${formatMoney(remainingCash)} at check-in`;
  } else {
    const atBookingCash = Math.max(0, round2(remainingCash - dueLater));
    const atBooking = formatPrice(atBookingCash, remainingPoints);
    label = `Remaining ${formatPrice(remainingCash, remainingPoints)}${atBooking ? ` (incl. ${atBooking} due at booking)` : ''}`;
  }
  return { dueCash, duePoints, paidCash, paidPoints, remainingCash, remainingPoints, atCheckIn, label };
}
