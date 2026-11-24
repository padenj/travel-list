export const ROOM_TYPES = ['standard', 'suite', 'studio', '1br', '2br', '3br', 'other'] as const;
export const BED_TYPES = ['king', 'queen', 'full', 'twin', 'sofa_bed', 'bunk', 'crib'] as const;
export const AMENITIES = ['breakfast', 'fridge', 'microwave', 'kitchen', 'pool', 'hot_tub', 'parking', 'wifi', 'laundry', 'airport_shuttle', 'gym'] as const;
export const REFUNDABILITY = ['free', 'partial', 'nonrefundable'] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/;

export interface StayDates { checkInDate?: string | null; checkOutDate?: string | null }

function has(obj: any, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function validateStay(
  data: any,
  opts: { partial: boolean; existing?: StayDates },
): string | null {
  const d = data ?? {};
  if (!opts.partial || has(d, 'name')) {
    if (typeof d.name !== 'string' || !d.name.trim()) return 'Stay name is required';
  }
  const checkIn = has(d, 'checkInDate') ? d.checkInDate : opts.partial ? opts.existing?.checkInDate : undefined;
  const checkOut = has(d, 'checkOutDate') ? d.checkOutDate : opts.partial ? opts.existing?.checkOutDate : undefined;
  if (!checkIn) return 'Check-in date is required';
  if (!checkOut) return 'Check-out date is required';
  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut)) return 'Dates must be YYYY-MM-DD';
  if (checkOut <= checkIn) return 'Check-out must be after check-in';
  for (const key of ['checkInTime', 'checkOutTime']) {
    const v = d[key];
    if (v !== undefined && v !== null && v !== '' && (typeof v !== 'string' || !TIME_RE.test(v))) {
      return 'Times must be HH:mm';
    }
  }
  return null;
}

export function validateRoom(room: any): string | null {
  if (room === null || typeof room !== 'object' || Array.isArray(room)) return 'Room must be an object';
  if (room.roomType != null && !(ROOM_TYPES as readonly string[]).includes(room.roomType)) return 'Unknown room type';
  if (room.beds != null) {
    if (!Array.isArray(room.beds)) return 'Beds must be an array';
    const seen = new Set<string>();
    for (const bed of room.beds) {
      if (!bed || !(BED_TYPES as readonly string[]).includes(bed.type)) return 'Unknown bed type';
      if (!Number.isInteger(bed.count) || bed.count < 1 || bed.count > 9) return 'Bed count must be 1 to 9';
      if (seen.has(bed.type)) return 'Each bed type may appear once';
      seen.add(bed.type);
    }
  }
  if (room.amenities != null) {
    if (!Array.isArray(room.amenities)) return 'Amenities must be an array';
    if (room.amenities.some((a: any) => !(AMENITIES as readonly string[]).includes(a))) return 'Unknown amenity';
  }
  if (room.refundability != null && !(REFUNDABILITY as readonly string[]).includes(room.refundability)) {
    return 'Unknown refundability';
  }
  if (room.cancelBy != null && room.cancelBy !== '' && (typeof room.cancelBy !== 'string' || !DATETIME_RE.test(room.cancelBy))) {
    return 'Cancel-by must be YYYY-MM-DD or YYYY-MM-DDTHH:mm';
  }
  return null;
}

export function validateCoupons(coupons: any): string | null {
  if (!Array.isArray(coupons)) return 'Coupons must be an array';
  for (const c of coupons) {
    if (!c || typeof c.code !== 'string' || !c.code.trim()) return 'Coupon code is required';
    if (c.savingsCash != null && (typeof c.savingsCash !== 'number' || !(c.savingsCash >= 0))) return 'Coupon savings must be 0 or more';
    if (c.savingsPoints != null && (!Number.isInteger(c.savingsPoints) || c.savingsPoints < 0)) return 'Coupon points must be a whole number, 0 or more';
  }
  return null;
}
