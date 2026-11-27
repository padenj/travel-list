import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { ActionIcon, Alert, Button, Group, SimpleGrid, Table, Text, TextInput, Textarea } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { BookingTransaction } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { formatMoney } from '../utils/money';
import { PaymentMethodSelect } from './PaymentMethodSelect';

interface BookingTransactionListProps {
  tripId: string;
  bookingId: string;
  originalConfirmationNumber?: string | null;
  refreshKey?: number;
  onChanged: () => void;
  onCountChange?: (count: number) => void;
  onEditingChange?: (editing: boolean) => void;
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

function formFromTransaction(t: BookingTransaction): TransactionForm {
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

// `mode` is null (closed), 'add', or the id of the transaction being edited. Only one form is open at a time.
export function BookingTransactionList({ tripId, bookingId, originalConfirmationNumber = null, refreshKey = 0, onChanged, onCountChange, onEditingChange }: BookingTransactionListProps) {
  const [transactions, setTransactions] = useState<BookingTransaction[]>([]);
  const [mode, setMode] = useState<string | null>(null);
  const [form, setForm] = useState<TransactionForm>(EMPTY_FORM);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
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

  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  useEffect(() => {
    onCountChangeRef.current?.(transactions.length);
  }, [transactions.length]);

  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;
  useEffect(() => {
    onEditingChangeRef.current?.(mode !== null);
  }, [mode]);
  useEffect(() => () => onEditingChangeRef.current?.(false), []);

  let carriedConfirmation = originalConfirmationNumber;
  const rows = transactions.map(t => {
    if (t.confirmationNumber) carriedConfirmation = t.confirmationNumber;
    return { transaction: t, confirmation: carriedConfirmation };
  });

  const set = <K extends keyof TransactionForm>(key: K, value: TransactionForm[K]) => setForm(prev => ({ ...prev, [key]: value }));

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setMode('add');
  };

  const openEdit = (t: BookingTransaction) => {
    setForm(formFromTransaction(t));
    setError(null);
    setConfirmingId(null);
    setMode(t.id);
  };

  const close = () => {
    setMode(null);
    setForm(EMPTY_FORM);
  };

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
      if (mode === 'add') {
        await tripApi.addBookingTransaction(tripId, bookingId, {
          amountCash: cash,
          amountPoints: points,
          transactionDate: form.transactionDate || undefined,
          confirmationNumber: form.confirmationNumber.trim() || undefined,
          notes: form.notes.trim() || undefined,
          paymentMethodId: form.paymentMethodId,
        });
      } else if (mode) {
        await tripApi.updateBookingTransaction(tripId, bookingId, mode, {
          amountCash: cash ?? 0,
          amountPoints: points ?? 0,
          ...(form.transactionDate ? { transactionDate: form.transactionDate } : {}),
          confirmationNumber: form.confirmationNumber.trim() || null,
          notes: form.notes.trim() || null,
          paymentMethodId: form.paymentMethodId,
        });
      }
      close();
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  };

  const removeTransaction = async (id: string) => {
    try {
      setError(null);
      await tripApi.deleteBookingTransaction(tripId, bookingId, id);
      setConfirmingId(null);
      await load();
      onChanged();
    } catch (err) {
      setConfirmingId(null);
      setError(err instanceof Error ? err.message : 'Failed to remove transaction');
    }
  };

  return (
    <div>
      <Group justify="space-between" mt="xs" mb={4}>
        <Text size="sm" fw={600}>Transactions</Text>
        {mode === null && (
          <Button size="compact-xs" variant="subtle" onClick={openAdd}>+ Transaction</Button>
        )}
      </Group>

      {error && <Alert color="red" mb="xs">{error}</Alert>}

      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">No transactions yet</Text>
      ) : (
        <Table fz="sm" verticalSpacing={2} horizontalSpacing="xs" withRowBorders={false}>
          <Table.Tbody>
            {rows.map(({ transaction: t, confirmation }) => (
              <Table.Tr key={t.id} bg={mode === t.id ? 'var(--mantine-color-blue-light)' : undefined}>
                <Table.Td>
                  <span>{t.transactionDate}</span>
                  {t.notes && <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>{t.notes}</Text>}
                </Table.Td>
                <Table.Td>
                  {t.amountCash !== 0 && <span>{formatMoney(t.amountCash)}</span>}{' '}
                  {t.amountPoints !== 0 && <span>{`${t.amountPoints} pts`}</span>}
                </Table.Td>
                <Table.Td c="dimmed">
                  {t.paymentMethodNickname && <div>{t.paymentMethodNickname}</div>}
                  {confirmation && <div>{confirmation}</div>}
                </Table.Td>
                <Table.Td ta="right">
                  {confirmingId === t.id ? (
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <Text size="xs">Remove?</Text>
                      <Button size="compact-xs" color="red" onClick={() => removeTransaction(t.id)}>Confirm</Button>
                      <Button size="compact-xs" variant="default" onClick={() => setConfirmingId(null)}>Cancel</Button>
                    </Group>
                  ) : (
                    <Group gap={2} justify="flex-end" wrap="nowrap">
                      <ActionIcon variant="subtle" size="sm" aria-label="Edit transaction" disabled={mode !== null} onClick={() => openEdit(t)}>
                        <IconPencil size={14} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" size="sm" aria-label="Remove transaction" disabled={mode !== null} onClick={() => setConfirmingId(t.id)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {mode !== null && (
        <div>
          {mode !== 'add' && <Text size="sm" fw={600} mt="xs">Edit transaction</Text>}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" mt="xs">
            <TextInput id={`${uid}-cash`} label="Amount (cash)" type="number" step="0.01" value={form.amountCash} onChange={e => set('amountCash', e.currentTarget.value)} />
            <TextInput id={`${uid}-points`} label="Amount (points)" type="number" step="1" value={form.amountPoints} onChange={e => set('amountPoints', e.currentTarget.value)} />
            <TextInput id={`${uid}-date`} label="Date" type="date" value={form.transactionDate} onChange={e => set('transactionDate', e.currentTarget.value)} />
            <PaymentMethodSelect value={form.paymentMethodId} onChange={id => set('paymentMethodId', id)} />
            <TextInput id={`${uid}-conf`} label="New confirmation number" placeholder="Optional, e.g. for rebooking" value={form.confirmationNumber} onChange={e => set('confirmationNumber', e.currentTarget.value)} />
          </SimpleGrid>
          <Textarea id={`${uid}-notes`} mt="xs" label="Notes" rows={3} placeholder="Optional, e.g. paste the fee/tax breakdown" value={form.notes} onChange={e => set('notes', e.currentTarget.value)} />
          <Group mt="xs" gap="xs">
            <Button size="xs" onClick={submit} loading={saving}>{mode === 'add' ? 'Add transaction' : 'Save'}</Button>
            <Button size="xs" variant="default" onClick={close}>Cancel</Button>
          </Group>
        </div>
      )}
    </div>
  );
}
