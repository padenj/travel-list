import { describe, it, expect } from 'vitest';
import {
  emptyPriceEntry, toDues, fromDues, validatePriceEntry, duesLine, hasDueAtBooking, dueAtBookingLabel,
  todayLocal, emptyFirstPayment, firstTransactionPayload, PriceEntryValue,
} from '../utils/priceEntry';
import { dueTotals } from '../utils/dues';

const entry = (extra: Partial<PriceEntryValue>): PriceEntryValue => ({ ...emptyPriceEntry(), ...extra });

describe('toDues', () => {
  it('pay at booking: the other amount is due at check-in', () => {
    expect(toDues(entry({ totalCash: '1612.40', otherCash: '182.40', notes: ' Resort fee ' }))).toEqual({
      dueAtBookingCash: 1430, dueAtBookingPoints: null, dueLaterCash: 182.4, dueLaterNotes: 'Resort fee', payAt: 'booking',
    });
  });

  it('pay at check-in: the other amount is a deposit due at booking', () => {
    expect(toDues(entry({ totalCash: '500', otherCash: '100', payAt: 'checkin' }))).toMatchObject({
      dueAtBookingCash: 100, dueLaterCash: 400, payAt: 'checkin',
    });
    expect(toDues(entry({ totalCash: '500', payAt: 'checkin' }))).toMatchObject({ dueAtBookingCash: null, dueLaterCash: 500 });
  });

  it('points are always due at booking; blank cash stays null', () => {
    expect(toDues(entry({ totalPoints: '9000', payAt: 'checkin' }))).toEqual({
      dueAtBookingCash: null, dueAtBookingPoints: 9000, dueLaterCash: null, dueLaterNotes: null, payAt: 'checkin',
    });
  });

  it('rounds to cents and drops a zero other amount', () => {
    expect(toDues(entry({ totalCash: '100.10', otherCash: '0.30' }))).toMatchObject({ dueAtBookingCash: 99.8, dueLaterCash: 0.3 });
    expect(toDues(entry({ totalCash: '50', otherCash: '0' }))).toMatchObject({ dueAtBookingCash: 50, dueLaterCash: null });
  });
});

describe('fromDues', () => {
  it('rebuilds the entry (legacy rows default to pay at booking)', () => {
    expect(fromDues({ dueAtBookingCash: 1430, dueLaterCash: 182.4, dueLaterNotes: 'Resort fee' })).toEqual({
      totalCash: '1612.4', totalPoints: '', payAt: 'booking', otherCash: '182.4', notes: 'Resort fee',
    });
    expect(fromDues({ dueAtBookingCash: 100, dueLaterCash: 400, payAt: 'checkin' })).toMatchObject({ totalCash: '500', otherCash: '100' });
    expect(fromDues({})).toEqual(emptyPriceEntry());
  });

  it('round-trips', () => {
    const v = entry({ totalCash: '1250', totalPoints: '9000', otherCash: '39.6', notes: 'Resort fee' });
    expect(fromDues(toDues(v))).toEqual(v);
  });
});

describe('validatePriceEntry', () => {
  it('accepts blank and valid values', () => {
    expect(validatePriceEntry(emptyPriceEntry())).toBeNull();
    expect(validatePriceEntry(entry({ totalCash: '10', otherCash: '10' }))).toBeNull();
  });
  it('rejects bad values', () => {
    expect(validatePriceEntry(entry({ totalCash: '-1' }))).toBe('Amounts must be 0 or more');
    expect(validatePriceEntry(entry({ otherCash: 'abc' }))).toBe('Amounts must be 0 or more');
    expect(validatePriceEntry(entry({ totalPoints: '1.5' }))).toBe('Points must be a whole number, 0 or more');
    expect(validatePriceEntry(entry({ otherCash: '5' }))).toBe('Enter the total price (cash) first');
    expect(validatePriceEntry(entry({ totalCash: '5', otherCash: '6' }))).toBe("Due at check-in can't be more than the total price");
    expect(validatePriceEntry(entry({ totalCash: '5', otherCash: '6', payAt: 'checkin' })))
      .toBe("Due at booking (deposit) can't be more than the total price");
  });
});

describe('summaries', () => {
  it('dueTotals is null until a due field is set', () => {
    expect(dueTotals({})).toBeNull();
    expect(dueTotals({ dueAtBookingCash: 0.1, dueLaterCash: 0.2, dueAtBookingPoints: 5 })).toEqual({ cash: 0.3, points: 5 });
  });

  it('duesLine', () => {
    const d = { dueAtBookingCash: 1250, dueAtBookingPoints: 9000, dueLaterCash: 39.6, dueLaterNotes: 'Resort fee' };
    expect(duesLine(d)).toBe('At booking 9,000 pts + $1,250.00 · At check-in $39.60 (Resort fee)');
    expect(duesLine(d, { withTotal: true })).toBe('Total 9,000 pts + $1,289.60 · At booking 9,000 pts + $1,250.00 · At check-in $39.60 (Resort fee)');
    expect(duesLine({})).toBe('');
  });

  it('hasDueAtBooking / dueAtBookingLabel', () => {
    expect(hasDueAtBooking(entry({ totalCash: '500', payAt: 'checkin' }))).toBe(false);
    expect(hasDueAtBooking(entry({ totalPoints: '9000', payAt: 'checkin' }))).toBe(true);
    expect(hasDueAtBooking(entry({ totalCash: '5', otherCash: '6' }))).toBe(false);
    expect(dueAtBookingLabel(entry({ totalCash: '1289.60', totalPoints: '9000', otherCash: '39.60' }))).toBe('9,000 pts + $1,250.00');
  });
});

describe('first payment', () => {
  it('todayLocal formats the local date', () => {
    expect(todayLocal(new Date(2027, 0, 5, 23, 30))).toBe('2027-01-05');
  });

  it('builds the payload only when enabled and something is due at booking', () => {
    const first = { ...emptyFirstPayment(new Date(2027, 0, 5)), paymentMethodId: 'pm1' };
    expect(first).toMatchObject({ enabled: true, transactionDate: '2027-01-05' });
    const due = entry({ totalCash: '100' });
    expect(firstTransactionPayload(first, due)).toEqual({ transactionDate: '2027-01-05', paymentMethodId: 'pm1' });
    expect(firstTransactionPayload({ ...first, enabled: false }, due)).toBeUndefined();
    expect(firstTransactionPayload(first, entry({ totalCash: '100', payAt: 'checkin' }))).toBeUndefined();
  });
});
