import { useState, useEffect, useCallback, useId } from 'react';
import { BookingTransaction } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { formatMoney } from '../utils/money';

interface BookingTransactionListProps {
  tripId: string;
  bookingId: string;
  originalConfirmationNumber?: string | null;
  refreshKey?: number;
  onChanged: () => void;
}

function parseAmount(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function BookingTransactionList({ tripId, bookingId, originalConfirmationNumber = null, refreshKey = 0, onChanged }: BookingTransactionListProps) {
  const [transactions, setTransactions] = useState<BookingTransaction[]>([]);
  const [amountCash, setAmountCash] = useState('');
  const [amountPoints, setAmountPoints] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  const load = useCallback(async () => {
    const data = await tripApi.listBookingTransactions(tripId, bookingId);
    setTransactions(data);
  }, [tripId, bookingId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  let carriedConfirmation = originalConfirmationNumber;
  const rows = transactions.map(t => {
    if (t.confirmationNumber) carriedConfirmation = t.confirmationNumber;
    return { transaction: t, confirmation: carriedConfirmation };
  });

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
        {rows.map(({ transaction: t, confirmation }) => (
          <li key={t.id}>
            <span>{t.transactionDate}</span>{' '}
            {t.amountCash !== 0 && <span>{formatMoney(t.amountCash)}</span>}{' '}
            {t.amountPoints !== 0 && <span>{`${t.amountPoints} pts`}</span>}{' '}
            {confirmation && <span>{`Conf: ${confirmation}`}</span>}{' '}
            <button type="button" className="view-toggle-btn" onClick={() => removeTransaction(t.id)}>Remove</button>
            {t.notes && <div className="txn-notes">{t.notes}</div>}
          </li>
        ))}
      </ul>
      <p className="booking-transaction-total">
        Total paid: {formatMoney(runningTotalCash)}{runningTotalPoints !== 0 ? ` + ${runningTotalPoints} pts` : ''}
      </p>
      <div className="create-element-field">
        <label htmlFor={`${uid}-cash`}>Amount (cash)</label>
        <input id={`${uid}-cash`} type="number" step="0.01" value={amountCash} onChange={(e) => setAmountCash(e.target.value)} />
      </div>
      <div className="create-element-field">
        <label htmlFor={`${uid}-points`}>Amount (points)</label>
        <input id={`${uid}-points`} type="number" step="1" value={amountPoints} onChange={(e) => setAmountPoints(e.target.value)} />
      </div>
      <div className="create-element-field">
        <label htmlFor={`${uid}-date`}>Date</label>
        <input id={`${uid}-date`} type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
      </div>
      <div className="create-element-field">
        <label htmlFor={`${uid}-conf`}>New confirmation number</label>
        <input id={`${uid}-conf`} type="text" value={confirmationNumber} onChange={(e) => setConfirmationNumber(e.target.value)} placeholder="Optional, e.g. for rebooking" />
      </div>
      <div className="create-element-field">
        <label htmlFor={`${uid}-notes`}>Notes</label>
        <textarea id={`${uid}-notes`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. paste the fee/tax breakdown" />
      </div>
      <button type="button" className="view-toggle-btn" onClick={addTransaction} disabled={saving}>
        {saving ? 'Saving...' : 'Add Transaction'}
      </button>
    </div>
  );
}
