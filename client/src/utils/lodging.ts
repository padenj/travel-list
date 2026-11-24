import { AmenityKey, BedCount, BedType, Booking, BookingCoupon, LodgingRoom, Refundability, RoomType } from '../types/trip';
import { formatPrice } from './flightRows';
import { formatMoney } from './money';
import { nightsBetween } from './tripDates';

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

export const AMENITY_OPTIONS: { value: AmenityKey; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'fridge', label: 'Fridge' },
  { value: 'microwave', label: 'Microwave' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'pool', label: 'Pool' },
  { value: 'hot_tub', label: 'Hot tub' },
  { value: 'parking', label: 'Parking' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'airport_shuttle', label: 'Airport shuttle' },
  { value: 'gym', label: 'Gym' },
];

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

export function amenitiesLabel(amenities: AmenityKey[] | null | undefined, other: string | null | undefined): string {
  const parts = (amenities ?? []).map(a => labelOf(AMENITY_OPTIONS, a)).filter(Boolean);
  if (other?.trim()) parts.push(other.trim());
  return parts.join(' · ');
}

export function formatTime(value: string | null | undefined): string {
  const m = value?.match(/^(\d{2}):(\d{2})$/);
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

function shortDate(ymd: string): string {
  const [y, mo, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDeadline(cancelBy: string): string {
  const time = cancelBy.length > 10 ? formatTime(cancelBy.slice(11, 16)) : '';
  return time ? `${shortDate(cancelBy)}, ${time}` : shortDate(cancelBy);
}

export function perNight(total: number | null | undefined, checkIn: string | null | undefined, checkOut: string | null | undefined): number | null {
  if (total == null) return null;
  const nights = nightsBetween(checkIn, checkOut);
  return nights && nights > 0 ? Math.round((total / nights) * 100) / 100 : null;
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

export function cancelLabel(room: Pick<LodgingRoom, 'refundability' | 'cancelBy'> | null | undefined): string {
  if (!room) return '';
  const until = room.cancelBy ? formatDeadline(room.cancelBy) : '';
  switch (room.refundability) {
    case 'free': return until ? `Free cancel until ${until}` : 'Free cancellation';
    case 'partial': return until ? `Partial refund until ${until}` : 'Partial refund';
    case 'nonrefundable': return 'Non-refundable';
    default: return until ? `Cancel by ${until}` : '';
  }
}

export function roomTitle(room: Pick<LodgingRoom, 'roomType' | 'beds'> | null | undefined): string {
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

// "Adv $1,612.00 total incl. taxes ($403.00/nt) · Paid $1,580.00"
export function roomMoneyLine(booking: Booking, nights: number | null): string {
  const parts: string[] = [];
  const advertised = formatPrice(booking.advertisedPriceCash, booking.advertisedPricePoints);
  if (advertised) {
    let text = `Adv ${advertised} total${booking.advertisedIncludesTaxes ? ' incl. taxes' : ''}`;
    if (booking.advertisedPriceCash && nights && nights > 0) {
      text += ` (${formatMoney(Math.round((booking.advertisedPriceCash / nights) * 100) / 100)}/nt)`;
    }
    parts.push(text);
  }
  const paid = formatPrice(booking.actualTotalCash, booking.actualTotalPoints);
  parts.push(`Paid ${paid || formatMoney(0)}`);
  return parts.join(' · ');
}
