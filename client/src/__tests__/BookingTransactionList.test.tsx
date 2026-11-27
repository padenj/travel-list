/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    listBookingTransactions: vi.fn(),
    addBookingTransaction: vi.fn(),
    deleteBookingTransaction: vi.fn(),
    updateBookingTransaction: vi.fn(),
  },
}));

vi.mock('../api/paymentMethodApi', () => ({
  paymentMethodApi: {
    list: vi.fn().mockResolvedValue([{ id: 'pm1', nickname: 'Visa - 1234', archived: false, transactionCount: 1, createdAt: '', updatedAt: '' }]),
    create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { BookingTransactionList } from '../components/BookingTransactionList';

function renderList(props: Partial<React.ComponentProps<typeof BookingTransactionList>> = {}) {
  return renderWithMantine(<BookingTransactionList tripId="trip-1" bookingId="b1" onChanged={() => {}} {...props} />);
}

describe('BookingTransactionList', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    (tripApi.listBookingTransactions as any).mockResolvedValue([
      { id: 't1', bookingId: 'b1', amountCash: 78.98, amountPoints: 0, transactionDate: '2026-01-15', confirmationNumber: null, notes: 'Fee breakdown', paymentMethodId: 'pm1', paymentMethodNickname: 'Visa - 1234', createdAt: '' },
    ]);
  });

  it('lists transactions in a table with the note on a second line', async () => {
    renderList();
    expect(await screen.findByText('$78.98')).toBeTruthy();
    expect(screen.getByText('2026-01-15')).toBeTruthy();
    expect(screen.getByText(/Fee breakdown/)).toBeTruthy();
    expect(screen.queryByText(/total paid/i)).toBeNull();
  });

  it('shows points, negative amounts, and only a transaction’s own new confirmation number', async () => {
    (tripApi.listBookingTransactions as any).mockResolvedValue([
      { id: 't1', bookingId: 'b1', amountCash: 157.96, amountPoints: 0, transactionDate: '2026-10-24', confirmationNumber: null, notes: null, createdAt: '' },
      { id: 't2', bookingId: 'b1', amountCash: -20, amountPoints: 5000, transactionDate: '2026-10-26', confirmationNumber: 'XYZ789', notes: null, createdAt: '' },
    ]);
    renderList();
    expect(await screen.findByText('-$20.00')).toBeTruthy();
    expect(screen.getByText('5000 pts')).toBeTruthy();
    expect(screen.getByText('New conf # XYZ789')).toBeTruthy();
    expect(screen.getAllByText(/New conf #/)).toHaveLength(1);
  });

  it('shows an empty message when there are no transactions', async () => {
    (tripApi.listBookingTransactions as any).mockResolvedValue([]);
    renderList();
    expect(await screen.findByText(/no transactions yet/i)).toBeTruthy();
  });

  it('opens an "Add transaction" dialog from "+ Transaction"', async () => {
    renderList();
    await screen.findByText('$78.98');
    expect(screen.queryByLabelText(/amount \(cash\)/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /\+ transaction/i }));
    expect(await screen.findByRole('dialog', { name: 'Add transaction' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByLabelText(/amount \(cash\)/i)).toBeNull());
  });

  it('uses a multi-line textarea for notes', async () => {
    renderList();
    await screen.findByText('$78.98');
    fireEvent.click(screen.getByRole('button', { name: /\+ transaction/i }));
    const notes = screen.getByLabelText(/^notes$/i) as HTMLTextAreaElement;
    expect(notes.tagName).toBe('TEXTAREA');
  });

  it('adds a transaction through the dialog, then closes it and reloads', async () => {
    (tripApi.addBookingTransaction as any).mockResolvedValue({
      id: 't2', bookingId: 'b1', amountCash: -10, amountPoints: 0, transactionDate: '2026-02-01', confirmationNumber: 'REBOOKED', notes: null, createdAt: '',
    });
    const onChanged = vi.fn();
    renderList({ onChanged });
    await screen.findByText('$78.98');

    fireEvent.click(screen.getByRole('button', { name: /\+ transaction/i }));
    fireEvent.change(screen.getByLabelText(/amount \(cash\)/i), { target: { value: '-10' } });
    fireEvent.change(screen.getByLabelText(/new confirmation number/i), { target: { value: 'REBOOKED' } });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await waitFor(() => expect(tripApi.addBookingTransaction).toHaveBeenCalledWith('trip-1', 'b1', expect.objectContaining({
      amountCash: -10,
      confirmationNumber: 'REBOOKED',
    })));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(tripApi.listBookingTransactions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByLabelText(/amount \(cash\)/i)).toBeNull());
  });

  it('shows a validation error when both amounts are left blank', async () => {
    renderList();
    await screen.findByText('$78.98');
    fireEvent.click(screen.getByRole('button', { name: /\+ transaction/i }));
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));
    expect(await screen.findByText(/enter a cash or points amount/i)).toBeTruthy();
    expect(tripApi.addBookingTransaction).not.toHaveBeenCalled();
  });

  it('asks for confirmation before removing, and cancel keeps the transaction', async () => {
    (tripApi.deleteBookingTransaction as any).mockResolvedValue(undefined);
    const onChanged = vi.fn();
    renderList({ onChanged });
    await screen.findByText('$78.98');

    fireEvent.click(screen.getByRole('button', { name: /remove transaction/i }));
    expect(screen.getByText(/remove\?/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(tripApi.deleteBookingTransaction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /remove transaction/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    await waitFor(() => expect(tripApi.deleteBookingTransaction).toHaveBeenCalledWith('trip-1', 'b1', 't1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('reports the number of transactions after loading', async () => {
    const onCountChange = vi.fn();
    renderList({ onCountChange });
    await screen.findByText('$78.98');
    expect(onCountChange).toHaveBeenLastCalledWith(1);
  });

  it('reports editing state while the add-transaction form is open', async () => {
    const onEditingChange = vi.fn();
    renderList({ onEditingChange });
    await screen.findByText('$78.98');
    expect(onEditingChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: /\+ transaction/i }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('shows the payment method on each row', async () => {
    renderList();
    expect(await screen.findByText('Visa - 1234')).toBeTruthy();
  });

  it('edits a transaction in an "Edit transaction" dialog', async () => {
    (tripApi.updateBookingTransaction as any).mockResolvedValue({});
    const onChanged = vi.fn();
    renderList({ onChanged });
    await screen.findByText('$78.98');
    fireEvent.click(screen.getByRole('button', { name: 'Edit transaction' }));
    expect(await screen.findByRole('dialog', { name: 'Edit transaction' })).toBeTruthy();
    expect(screen.getByText('Jan 15, 2026 · $78.98 · Visa - 1234')).toBeTruthy();
    const cash = screen.getByLabelText('Amount (cash)') as HTMLInputElement;
    expect(cash.value).toBe('78.98');
    fireEvent.change(cash, { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(tripApi.updateBookingTransaction).toHaveBeenCalledWith('trip-1', 'b1', 't1', {
      amountCash: 80, amountPoints: 0, transactionDate: '2026-01-15', confirmationNumber: null, notes: null, paymentMethodId: 'pm1',
    }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText('Amount (cash)')).toBeNull());
  });

  it('reports editing while the edit dialog is open', async () => {
    const onEditingChange = vi.fn();
    renderList({ onEditingChange });
    await screen.findByText('$78.98');
    fireEvent.click(screen.getByRole('button', { name: 'Edit transaction' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('sends the chosen payment method when adding', async () => {
    (tripApi.addBookingTransaction as any).mockResolvedValue({});
    renderList();
    await screen.findByText('$78.98');
    fireEvent.click(screen.getByRole('button', { name: /\+ transaction/i }));
    fireEvent.change(screen.getByLabelText('Amount (cash)'), { target: { value: '25' } });
    const select = screen.getByRole('textbox', { name: 'Payment method' });
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole('option', { name: 'Visa - 1234' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    await waitFor(() => expect(tripApi.addBookingTransaction).toHaveBeenCalledWith('trip-1', 'b1', expect.objectContaining({
      amountCash: 25, paymentMethodId: 'pm1',
    })));
  });
});
