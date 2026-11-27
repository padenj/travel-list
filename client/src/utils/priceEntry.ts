import { BookingMoneyFields, FirstTransactionPayload, PayAt } from '../types/trip';
import { dueTotals } from './dues';
import { formatPrice } from './flightRows';
import { formatMoney } from './money';

// What the user types: a total, when most of it is paid, and the amount paid at the other time.
export interface PriceEntryValue {
  totalCash: string;
  totalPoints: string;
  payAt: PayAt;
  otherCash: string;
  notes: string;
}

export interface Dues {
  dueAtBookingCash: number | null;
  dueAtBookingPoints: number | null;
  dueLaterCash: number | null;
  dueLaterNotes: string | null;
  payAt: PayAt;
}

export const OTHER_AMOUNT_LABEL: Record<PayAt, string> = {
  booking: 'Due at check-in',
  checkin: 'Due at booking (deposit)',
};

export function emptyPriceEntry(): PriceEntryValue {
  return { totalCash: '', totalPoints: '', payAt: 'booking', otherCash: '', notes: '' };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const str = (n: number | null | undefined) => (n == null ? '' : String(n));

function parse(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function toDues(v: PriceEntryValue): Dues {
  const total = parse(v.totalCash);
  const other = round2(parse(v.otherCash) ?? 0);
  let atBooking: number | null = null;
  let later: number | null = null;
  if (total != null) {
    const main = round2(total - other);
    if (v.payAt === 'booking') {
      atBooking = main;
      later = other || null;
    } else {
      atBooking = other || null;
      later = main;
    }
  }
  return {
    dueAtBookingCash: atBooking,
    dueAtBookingPoints: parse(v.totalPoints),
    dueLaterCash: later,
    dueLaterNotes: v.notes.trim() || null,
    payAt: v.payAt,
  };
}

export function fromDues(b: BookingMoneyFields): PriceEntryValue {
  const payAt = b.payAt ?? 'booking';
  const totals = dueTotals(b);
  const hasCash = b.dueAtBookingCash != null || b.dueLaterCash != null;
  return {
    totalCash: hasCash && totals ? String(totals.cash) : '',
    totalPoints: str(b.dueAtBookingPoints),
    payAt,
    otherCash: str(payAt === 'booking' ? b.dueLaterCash : b.dueAtBookingCash),
    notes: b.dueLaterNotes ?? '',
  };
}

export function validatePriceEntry(v: PriceEntryValue): string | null {
  for (const s of [v.totalCash, v.otherCash]) {
    if (s.trim()) {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) return 'Amounts must be 0 or more';
    }
  }
  if (v.totalPoints.trim()) {
    const n = Number(v.totalPoints);
    if (!Number.isInteger(n) || n < 0) return 'Points must be a whole number, 0 or more';
  }
  const total = parse(v.totalCash);
  const other = parse(v.otherCash);
  if (other && total == null) return 'Enter the total price (cash) first';
  if (other != null && total != null && other > total) return `${OTHER_AMOUNT_LABEL[v.payAt]} can't be more than the total price`;
  return null;
}

type DueLineFields = Pick<BookingMoneyFields, 'dueAtBookingCash' | 'dueAtBookingPoints' | 'dueLaterCash' | 'dueLaterNotes'>;

// "Total … · At booking … · At check-in … (note)"; empty when no due field is set.
export function duesLine(d: DueLineFields, { withTotal = false }: { withTotal?: boolean } = {}): string {
  const totals = dueTotals(d);
  if (!totals) return '';
  const atBooking = formatPrice(d.dueAtBookingCash, d.dueAtBookingPoints);
  return [
    withTotal ? `Total ${formatPrice(totals.cash, totals.points) || formatMoney(0)}` : '',
    atBooking ? `At booking ${atBooking}` : '',
    d.dueLaterCash ? `At check-in ${formatMoney(d.dueLaterCash)}${d.dueLaterNotes ? ` (${d.dueLaterNotes})` : ''}` : '',
  ].filter(Boolean).join(' · ');
}

export function hasDueAtBooking(v: PriceEntryValue): boolean {
  if (validatePriceEntry(v)) return false;
  const d = toDues(v);
  return (d.dueAtBookingCash ?? 0) > 0 || (d.dueAtBookingPoints ?? 0) > 0;
}

export function dueAtBookingLabel(v: PriceEntryValue): string {
  const d = toDues(v);
  return formatPrice(d.dueAtBookingCash, d.dueAtBookingPoints);
}

export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// "Also record payment" state used while creating a booking.
export interface FirstPaymentDraft {
  enabled: boolean;
  transactionDate: string;
  paymentMethodId: string | null;
}

export function emptyFirstPayment(now: Date = new Date()): FirstPaymentDraft {
  return { enabled: true, transactionDate: todayLocal(now), paymentMethodId: null };
}

export function firstTransactionPayload(first: FirstPaymentDraft, price: PriceEntryValue): FirstTransactionPayload | undefined {
  if (!first.enabled || !hasDueAtBooking(price)) return undefined;
  return { transactionDate: first.transactionDate || todayLocal(), paymentMethodId: first.paymentMethodId };
}
