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

  it('shows points, negative amounts with the sign first, and carries the original confirmation', async () => {
    (tripApi.listBookingTransactions as any).mockResolvedValue([
      { id: 't1', bookingId: 'b1', amountCash: 157.96, amountPoints: 0, transactionDate: '2026-10-24', confirmationNumber: null, notes: null, createdAt: '' },
      { id: 't2', bookingId: 'b1', amountCash: -20, amountPoints: 5000, transactionDate: '2026-10-26', confirmationNumber: 'XYZ789', notes: null, createdAt: '' },
    ]);
    renderList({ originalConfirmationNumber: 'ABC123' });
    expect(await screen.findByText('-$20.00')).toBeTruthy();
    expect(screen.getByText('5000 pts')).toBeTruthy();
    expect(screen.getByText('ABC123')).toBeTruthy();
    expect(screen.getByText('XYZ789')).toBeTruthy();
  });

  it('shows an empty message when there are no transactions', async () => {
    (tripApi.listBookingTransactions as any).mockResolvedValue([]);
    renderList();
    expect(await screen.findByText(/no transactions yet/i)).toBeTruthy();
  });

  it('keeps the add form collapsed until "+ Transaction" is clicked', async () => {
    renderList();
    await screen.findByText('$78.98');
    expect(screen.queryByLabelText(/amount \(cash\)/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /\+ transaction/i }));
    expect(screen.getByLabelText(/amount \(cash\)/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByLabelText(/amount \(cash\)/i)).toBeNull();
  });

  it('uses a multi-line textarea for notes', async () => {
    renderList();
    await screen.findByText('$78.98');
    fireEvent.click(screen.getByRole('button', { name: /\+ transaction/i }));
    const notes = screen.getByLabelText(/^notes$/i) as HTMLTextAreaElement;
    expect(notes.tagName).toBe('TEXTAREA');
  });

  it('adds a negative transaction with a new confirmation number, then collapses the form', async () => {
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

  it('edits a transaction with the form prefilled', async () => {
    (tripApi.updateBookingTransaction as any).mockResolvedValue({});
    const onChanged = vi.fn();
    renderList({ onChanged });
    await screen.findByText('$78.98');
    fireEvent.click(screen.getByRole('button', { name: 'Edit transaction' }));
    const cash = screen.getByLabelText('Amount (cash)') as HTMLInputElement;
    expect(cash.value).toBe('78.98');
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-01-15');
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Fee breakdown');
    fireEvent.change(cash, { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(tripApi.updateBookingTransaction).toHaveBeenCalledWith('trip-1', 'b1', 't1', {
      amountCash: 80, amountPoints: 0, transactionDate: '2026-01-15', confirmationNumber: null, notes: null, paymentMethodId: 'pm1',
    }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.queryByLabelText('Amount (cash)')).toBeNull();
  });

  it('keeps only one form open and reports editing', async () => {
    const onEditingChange = vi.fn();
    renderList({ onEditingChange });
    await screen.findByText('$78.98');
    fireEvent.click(screen.getByRole('button', { name: 'Edit transaction' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('button', { name: /\+ transaction/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: /\+ transaction/i })).toBeTruthy();
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
