import { describe, it, expect } from 'vitest';
import { Booking } from '../types/trip';
import { bookingMoneyLine } from '../utils/bookingSummary';

function booking(extra: Partial<Booking>): Booking {
  return {
    id: 'b1', tripId: 't', confirmationNumber: null, advertisedPriceCash: null, advertisedPricePoints: null,
    loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '', elementIds: ['e1'], travelerIds: ['p1'],
    currentConfirmationNumber: null, actualTotalCash: 0, actualTotalPoints: 0, ...extra,
  };
}

describe('bookingMoneyLine', () => {
  it('shows advertised and paid with per-person amounts', () => {
    const line = bookingMoneyLine(booking({ advertisedPriceCash: 200, actualTotalCash: 10 }));
    expect(line).toBe('Advertised $200.00/person · Paid $10.00 ($10.00/person)');
  });

  it('divides paid cash across travelers', () => {
    const line = bookingMoneyLine(booking({ travelerIds: ['p1', 'p2'], actualTotalCash: 100 }));
    expect(line).toBe('Paid $100.00 ($50.00/person)');
  });

  it('shows points, with cash when both are present', () => {
    const line = bookingMoneyLine(booking({ advertisedPricePoints: 9000, actualTotalCash: 5.6, actualTotalPoints: 9000 }));
    expect(line).toBe('Advertised 9,000 pts/person · Paid 9,000 pts + $5.60 ($5.60/person)');
  });

  it('shows $0.00 paid when nothing has been paid and omits advertised when unset', () => {
    expect(bookingMoneyLine(booking({}))).toBe('Paid $0.00');
  });

  it('keeps the sign of refunds', () => {
    expect(bookingMoneyLine(booking({ actualTotalCash: -20 }))).toBe('Paid -$20.00 (-$20.00/person)');
  });
});
