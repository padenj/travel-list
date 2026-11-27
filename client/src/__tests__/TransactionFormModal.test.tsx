/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/tripApi', () => ({
  tripApi: { addBookingTransaction: vi.fn(), updateBookingTransaction: vi.fn() },
}));
vi.mock('../api/paymentMethodApi', () => ({
  paymentMethodApi: {
    list: vi.fn().mockResolvedValue([{ id: 'pm1', nickname: 'Southwest CC 1234', archived: false, transactionCount: 1, createdAt: '', updatedAt: '' }]),
    create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { TransactionFormModal, transactionSummary } from '../components/TransactionFormModal';
import { ElementDialog } from '../components/ElementDialog';
import type { BookingTransaction } from '../types/trip';

const txn: BookingTransaction = {
  id: 't1', bookingId: 'b1', amountCash: 5, amountPoints: 2000, transactionDate: '2026-11-27',
  confirmationNumber: null, notes: 'Fee breakdown', paymentMethodId: 'pm1', paymentMethodNickname: 'Southwest CC 1234', createdAt: '',
};

function renderModal(props: Partial<React.ComponentProps<typeof TransactionFormModal>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  renderWithMantine(
    <TransactionFormModal opened tripId="trip-1" bookingId="b1" transaction={null} onClose={onClose} onSaved={onSaved} {...props} />,
  );
  return { onClose, onSaved };
}

describe('transactionSummary', () => {
  it('joins date, amounts and payment method', () => {
    expect(transactionSummary(txn)).toBe('Nov 27, 2026 · $5.00 + 2,000 pts · Southwest CC 1234');
  });
  it('omits zero amounts and a missing method', () => {
    expect(transactionSummary({ ...txn, amountPoints: 0, paymentMethodNickname: null })).toBe('Nov 27, 2026 · $5.00');
  });
});

describe('TransactionFormModal', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.clearAllMocks());

  it('adds a transaction', async () => {
    (tripApi.addBookingTransaction as any).mockResolvedValue({});
    const { onSaved } = renderModal();
    expect(await screen.findByText('Add transaction', { selector: 'h2' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Amount (cash)'), { target: { value: '-10' } });
    fireEvent.change(screen.getByLabelText('New confirmation number'), { target: { value: 'REBOOKED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    await waitFor(() => expect(tripApi.addBookingTransaction).toHaveBeenCalledWith('trip-1', 'b1', expect.objectContaining({
      amountCash: -10, confirmationNumber: 'REBOOKED', paymentMethodId: null,
    })));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('edits a transaction with the form prefilled and shows the summary', async () => {
    (tripApi.updateBookingTransaction as any).mockResolvedValue({});
    const { onSaved } = renderModal({ transaction: txn });
    expect(await screen.findByText('Edit transaction', { selector: 'h2' })).toBeTruthy();
    expect(screen.getByText('Nov 27, 2026 · $5.00 + 2,000 pts · Southwest CC 1234')).toBeTruthy();
    const cash = screen.getByLabelText('Amount (cash)') as HTMLInputElement;
    expect(cash.value).toBe('5');
    expect((screen.getByLabelText('Amount (points)') as HTMLInputElement).value).toBe('2000');
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-11-27');
    fireEvent.change(cash, { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(tripApi.updateBookingTransaction).toHaveBeenCalledWith('trip-1', 'b1', 't1', {
      amountCash: 8, amountPoints: 2000, transactionDate: '2026-11-27', confirmationNumber: null, notes: null, paymentMethodId: 'pm1',
    }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('requires an amount', async () => {
    const { onSaved } = renderModal();
    fireEvent.click(await screen.findByRole('button', { name: 'Add transaction' }));
    expect(await screen.findByText(/enter a cash or points amount/i)).toBeTruthy();
    expect(tripApi.addBookingTransaction).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows API errors and stays open', async () => {
    (tripApi.addBookingTransaction as any).mockRejectedValue(new Error('Payment method is archived'));
    const { onSaved, onClose } = renderModal();
    fireEvent.change(await screen.findByLabelText('Amount (cash)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(await screen.findByText('Payment method is archived')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancel closes', async () => {
    const { onClose } = renderModal();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape closes only this modal, not the dialog underneath', async () => {
    const parentClose = vi.fn();
    const onClose = vi.fn();
    renderWithMantine(
      <ElementDialog opened onClose={parentClose} title="Stay" tabs={[{
        value: 'payments', label: 'Payments',
        content: <TransactionFormModal opened tripId="trip-1" bookingId="b1" transaction={null} onClose={onClose} onSaved={() => {}} />,
      }]} />,
    );
    const cash = await screen.findByLabelText('Amount (cash)');
    fireEvent.keyDown(cash, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(parentClose).not.toHaveBeenCalled();
  });
});
