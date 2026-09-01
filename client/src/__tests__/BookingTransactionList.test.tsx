/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    listBookingTransactions: vi.fn(),
    addBookingTransaction: vi.fn(),
    deleteBookingTransaction: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { BookingTransactionList } from '../components/BookingTransactionList';

describe('BookingTransactionList', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    (tripApi.listBookingTransactions as any).mockResolvedValue([
      { id: 't1', bookingId: 'b1', amountCash: 78.98, amountPoints: 0, transactionDate: '2026-01-15', confirmationNumber: null, notes: 'Fee breakdown', createdAt: '' },
    ]);
  });

  it('lists transactions with running total', async () => {
    render(<BookingTransactionList tripId="trip-1" bookingId="b1" onChanged={() => {}} />);
    expect(await screen.findByText(/78.98/)).toBeTruthy();
    expect(await screen.findByText(/Fee breakdown/)).toBeTruthy();
  });

  it('adds a negative transaction for a price drop with a new confirmation number', async () => {
    (tripApi.addBookingTransaction as any).mockResolvedValue({
      id: 't2', bookingId: 'b1', amountCash: -10, amountPoints: 0, transactionDate: '2026-02-01', confirmationNumber: 'REBOOKED', notes: null, createdAt: '',
    });
    render(<BookingTransactionList tripId="trip-1" bookingId="b1" onChanged={() => {}} />);
    await screen.findByText(/78.98/);

    fireEvent.change(screen.getByLabelText(/amount \(cash\)/i), { target: { value: '-10' } });
    fireEvent.change(screen.getByLabelText(/new confirmation number/i), { target: { value: 'REBOOKED' } });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await waitFor(() => expect(tripApi.addBookingTransaction).toHaveBeenCalledWith('trip-1', 'b1', expect.objectContaining({
      amountCash: -10,
      confirmationNumber: 'REBOOKED',
    })));
  });

  it('shows a validation error when both amounts are left blank', async () => {
    render(<BookingTransactionList tripId="trip-1" bookingId="b1" onChanged={() => {}} />);
    await screen.findByText(/78.98/);
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));
    expect(await screen.findByText(/enter a cash or points amount/i)).toBeTruthy();
    expect(tripApi.addBookingTransaction).not.toHaveBeenCalled();
  });
});
