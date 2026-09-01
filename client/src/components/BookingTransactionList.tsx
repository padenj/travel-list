import { useState, useEffect, useCallback } from 'react';
import { BookingTransaction } from '../types/trip';
import { tripApi } from '../api/tripApi';

interface BookingTransactionListProps {
  tripId: string;
  bookingId: string;
  onChanged: () => void;
}

function parseAmount(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatCashTotal(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const absolute = Math.abs(amount);
  const dollars = Math.trunc(absolute);
  const cents = Math.round((absolute - dollars) * 100);
  return `${sign}$${dollars}${cents !== 0 ? ` (${cents.toString().padStart(2, '0')}¢)` : ''}`;
}

export function BookingTransactionList({ tripId, bookingId, onChanged }: BookingTransactionListProps) {
  const [transactions, setTransactions] = useState<BookingTransaction[]>([]);
  const [amountCash, setAmountCash] = useState('');
  const [amountPoints, setAmountPoints] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await tripApi.listBookingTransactions(tripId, bookingId);
    setTransactions(data);
  }, [tripId, bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const runningTotalCash = transactions.reduce((sum, t) => sum + t.amountCash, 0);
  const runningTotalPoints = transactions.reduce((sum, t) => sum + t.amountPoints, 0);

  const addTransaction = async () => {
    const cash = parseAmount(amountCash);
    const points = parseAmount(amountPoints);
    if ((cash === undefined || cash === 0) && (points === undefined || points === 0)) {
      setError('Please enter a cash or points amount');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await tripApi.addBookingTransaction(tripId, bookingId, {
        amountCash: cash,
        amountPoints: points,
        transactionDate: transactionDate || undefined,
        confirmationNumber: confirmationNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setAmountCash('');
      setAmountPoints('');
      setTransactionDate('');
      setConfirmationNumber('');
      setNotes('');
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transaction');
    } finally {
      setSaving(false);
    }
  };

  const removeTransaction = async (id: string) => {
    await tripApi.deleteBookingTransaction(tripId, bookingId, id);
    await load();
    onChanged();
  };

  return (
    <div className="booking-transaction-list">
      <h4>Transactions</h4>
      {error && <p className="error">{error}</p>}
      <ul>
        {transactions.map(t => (
          <li key={t.id}>
            <span>{t.transactionDate}</span>{' '}
            <span>{t.amountCash !== 0 ? `$${t.amountCash.toFixed(2)}` : ''}</span>{' '}
            <span>{t.amountPoints !== 0 ? `${t.amountPoints} pts` : ''}</span>{' '}
            {t.confirmationNumber && <span>Conf: {t.confirmationNumber}</span>}{' '}
            {t.notes && <span className="element-notes">{t.notes}</span>}
            <button type="button" onClick={() => removeTransaction(t.id)}>Remove</button>
          </li>
        ))}
      </ul>
      <p className="booking-transaction-total">
        Total paid: {formatCashTotal(runningTotalCash)}{runningTotalPoints !== 0 ? ` + ${runningTotalPoints} pts` : ''}
      </p>
      <div className="create-element-field">
        <label htmlFor={`txn-cash-${bookingId}`}>Amount (cash)</label>
        <input id={`txn-cash-${bookingId}`} type="number" step="0.01" value={amountCash} onChange={(e) => setAmountCash(e.target.value)} />
      </div>
      <div className="create-element-field">
        <label htmlFor={`txn-points-${bookingId}`}>Amount (points)</label>
        <input id={`txn-points-${bookingId}`} type="number" step="1" value={amountPoints} onChange={(e) => setAmountPoints(e.target.value)} />
      </div>
      <div className="create-element-field">
        <label htmlFor={`txn-date-${bookingId}`}>Date</label>
        <input id={`txn-date-${bookingId}`} type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
      </div>
      <div className="create-element-field">
        <label htmlFor={`txn-conf-${bookingId}`}>New confirmation number</label>
        <input id={`txn-conf-${bookingId}`} type="text" value={confirmationNumber} onChange={(e) => setConfirmationNumber(e.target.value)} placeholder="Optional, e.g. for rebooking" />
      </div>
      <div className="create-element-field">
        <label htmlFor={`txn-notes-${bookingId}`}>Notes</label>
        <input id={`txn-notes-${bookingId}`} type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. fee/tax breakdown" />
      </div>
      <button type="button" onClick={addTransaction} disabled={saving}>
        {saving ? 'Saving...' : 'Add Transaction'}
      </button>
    </div>
  );
}
