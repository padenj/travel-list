import { useEffect, useId, useState } from 'react';
import { Alert, Button, Group, Modal, SimpleGrid, Text, TextInput, Textarea } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { BookingTransaction } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { formatMoney } from '../utils/money';
import { PaymentMethodSelect } from './PaymentMethodSelect';
import { useReportNestedModal } from '../contexts/NestedModalContext';

interface TransactionFormModalProps {
  opened: boolean;
  tripId: string;
  bookingId: string;
  /** null = add a new transaction */
  transaction: BookingTransaction | null;
  onClose: () => void;
  onSaved: () => void;
}

interface TransactionForm {
  amountCash: string;
  amountPoints: string;
  transactionDate: string;
  confirmationNumber: string;
  notes: string;
  paymentMethodId: string | null;
}

const EMPTY_FORM: TransactionForm = {
  amountCash: '', amountPoints: '', transactionDate: '', confirmationNumber: '', notes: '', paymentMethodId: null,
};

function formFromTransaction(t: BookingTransaction | null): TransactionForm {
  if (!t) return EMPTY_FORM;
  return {
    amountCash: t.amountCash !== 0 ? String(t.amountCash) : '',
    amountPoints: t.amountPoints !== 0 ? String(t.amountPoints) : '',
    transactionDate: t.transactionDate,
    confirmationNumber: t.confirmationNumber ?? '',
    notes: t.notes ?? '',
    paymentMethodId: t.paymentMethodId ?? null,
  };
}

function parseAmount(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatTransactionDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function transactionSummary(t: BookingTransaction): string {
  const amounts: string[] = [];
  if (t.amountCash !== 0) amounts.push(formatMoney(t.amountCash));
  if (t.amountPoints !== 0) amounts.push(`${t.amountPoints.toLocaleString('en-US')} pts`);
  const parts = [formatTransactionDate(t.transactionDate)];
  if (amounts.length) parts.push(amounts.join(' + '));
  if (t.paymentMethodNickname) parts.push(t.paymentMethodNickname);
  return parts.join(' · ');
}

export function TransactionFormModal({ opened, tripId, bookingId, transaction, onClose, onSaved }: TransactionFormModalProps) {
  const isMobile = Boolean(useMediaQuery('(max-width: 48em)'));
  const [form, setForm] = useState<TransactionForm>(() => formFromTransaction(transaction));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  useReportNestedModal(opened);

  useEffect(() => {
    if (opened) {
      setForm(formFromTransaction(transaction));
      setError(null);
    }
  }, [opened, transaction]);

  const set = <K extends keyof TransactionForm>(key: K, value: TransactionForm[K]) => setForm(prev => ({ ...prev, [key]: value }));

  const submit = async () => {
    const cash = parseAmount(form.amountCash);
    const points = parseAmount(form.amountPoints);
    if ((cash === undefined || cash === 0) && (points === undefined || points === 0)) {
      setError('Please enter a cash or points amount');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      if (transaction) {
        await tripApi.updateBookingTransaction(tripId, bookingId, transaction.id, {
          amountCash: cash ?? 0,
          amountPoints: points ?? 0,
          ...(form.transactionDate ? { transactionDate: form.transactionDate } : {}),
          confirmationNumber: form.confirmationNumber.trim() || null,
          notes: form.notes.trim() || null,
          paymentMethodId: form.paymentMethodId,
        });
      } else {
        await tripApi.addBookingTransaction(tripId, bookingId, {
          amountCash: cash,
          amountPoints: points,
          transactionDate: form.transactionDate || undefined,
          confirmationNumber: form.confirmationNumber.trim() || undefined,
          notes: form.notes.trim() || undefined,
          paymentMethodId: form.paymentMethodId,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={transaction ? 'Edit transaction' : 'Add transaction'}
      size="md"
      zIndex={300}
      fullScreen={isMobile}
      centered={!isMobile}
    >
      {transaction && <Text size="sm" c="dimmed" mb="sm">{transactionSummary(transaction)}</Text>}
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
        <TextInput id={`${uid}-cash`} label="Amount (cash)" type="number" step="0.01" value={form.amountCash} onChange={e => set('amountCash', e.currentTarget.value)} />
        <TextInput id={`${uid}-points`} label="Amount (points)" type="number" step="1" value={form.amountPoints} onChange={e => set('amountPoints', e.currentTarget.value)} />
        <TextInput id={`${uid}-date`} label="Date" type="date" value={form.transactionDate} onChange={e => set('transactionDate', e.currentTarget.value)} />
        <PaymentMethodSelect value={form.paymentMethodId} onChange={id => set('paymentMethodId', id)} />
        <TextInput id={`${uid}-conf`} label="New confirmation number" placeholder="Optional, e.g. for rebooking" value={form.confirmationNumber} onChange={e => set('confirmationNumber', e.currentTarget.value)} />
      </SimpleGrid>
      <Textarea id={`${uid}-notes`} mt="xs" label="Notes" rows={3} placeholder="Optional, e.g. paste the fee/tax breakdown" value={form.notes} onChange={e => set('notes', e.currentTarget.value)} />
      <Group mt="md" justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving}>{transaction ? 'Save' : 'Add transaction'}</Button>
      </Group>
    </Modal>
  );
}
