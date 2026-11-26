/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { LodgingPaymentsTab } from '../components/LodgingPaymentsTab';
import { Booking } from '../types/trip';

vi.mock('../components/BookingTransactionList', () => ({
  BookingTransactionList: (props: { bookingId: string }) => <div>{`transactions for ${props.bookingId}`}</div>,
}));

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1', tripId: 't1', confirmationNumber: 'H-1', advertisedPriceCash: 1612, advertisedPricePoints: null, loyaltyProgram: null,
    notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: [], currentConfirmationNumber: 'H-1',
    actualTotalCash: 1430, actualTotalPoints: 0, ...overrides,
  };
}

function renderTab(b: Booking | null) {
  return renderWithMantine(
    <LodgingPaymentsTab tripId="t1" booking={b} refreshKey={0} onChanged={() => {}} onCountChange={() => {}} onEditingChange={() => {}} />,
  );
}

describe('LodgingPaymentsTab', () => {
  afterEach(() => cleanup());

  it('summarises dues, paid and remaining', () => {
    renderTab(booking({ dueAtBookingCash: 1430, dueLaterCash: 182.4, dueLaterNotes: 'Resort fee' }));
    expect(screen.getByText('Due $1,612.40 · Paid $1,430.00')).toBeTruthy();
    expect(screen.getByText('Remaining $182.40 at check-in')).toBeTruthy();
    expect(screen.getByText('Resort fee')).toBeTruthy();
    expect(screen.getByText('transactions for b1')).toBeTruthy();
  });

  it('hints when no amounts are due', () => {
    renderTab(booking());
    expect(screen.getByText("Add amounts due on the Details tab to track what's remaining.")).toBeTruthy();
    expect(screen.getByText('transactions for b1')).toBeTruthy();
  });

  it('asks to save details when there is no booking', () => {
    renderTab(null);
    expect(screen.getByText('Save the stay details to start recording payments.')).toBeTruthy();
    expect(screen.queryByText(/transactions for/)).toBeNull();
  });
});
