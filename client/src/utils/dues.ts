import { BookingMoneyFields } from '../types/trip';

type DueFields = Pick<BookingMoneyFields, 'dueAtBookingCash' | 'dueAtBookingPoints' | 'dueLaterCash'>;

// The booking's total price, derived from its dues. Null when no due field is set.
export function dueTotals(d: DueFields): { cash: number; points: number } | null {
  if (d.dueAtBookingCash == null && d.dueAtBookingPoints == null && d.dueLaterCash == null) return null;
  return {
    cash: Math.round(((d.dueAtBookingCash ?? 0) + (d.dueLaterCash ?? 0)) * 100) / 100,
    points: d.dueAtBookingPoints ?? 0,
  };
}
