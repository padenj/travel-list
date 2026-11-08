import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { ActionIcon, Alert, Button, Group, SimpleGrid, Table, Text, TextInput, Textarea } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { BookingTransaction } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { formatMoney } from '../utils/money';

interface BookingTransactionListProps {
  tripId: string;
  bookingId: string;
  originalConfirmationNumber?: string | null;
  refreshKey?: number;
  onChanged: () => void;
  onCountChange?: (count: number) => void;
}

function parseAmount(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function BookingTransactionList({ tripId, bookingId, originalConfirmationNumber = null, refreshKey = 0, onChanged, onCountChange }: BookingTransactionListProps) {
  const [transactions, setTransactions] = useState<BookingTransaction[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
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

  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  useEffect(() => {
    onCountChangeRef.current?.(transactions.length);
  }, [transactions.length]);

  let carriedConfirmation = originalConfirmationNumber;
  const rows = transactions.map(t => {
    if (t.confirmationNumber) carriedConfirmation = t.confirmationNumber;
    return { transaction: t, confirmation: carriedConfirmation };
  });

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
      setShowForm(false);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transaction');
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
        <Button size="compact-xs" variant="subtle" onClick={() => setShowForm(prev => !prev)}>
          {showForm ? 'Cancel' : '+ Transaction'}
        </Button>
      </Group>

      {error && <Alert color="red" mb="xs">{error}</Alert>}

      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">No transactions yet</Text>
      ) : (
        <Table fz="sm" verticalSpacing={2} horizontalSpacing="xs" withRowBorders={false}>
          <Table.Tbody>
            {rows.map(({ transaction: t, confirmation }) => (
              <Table.Tr key={t.id}>
                <Table.Td>
                  <span>{t.transactionDate}</span>
                  {t.notes && <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>{t.notes}</Text>}
                </Table.Td>
                <Table.Td>
                  {t.amountCash !== 0 && <span>{formatMoney(t.amountCash)}</span>}{' '}
                  {t.amountPoints !== 0 && <span>{`${t.amountPoints} pts`}</span>}
                </Table.Td>
                <Table.Td c="dimmed">{confirmation}</Table.Td>
                <Table.Td ta="right">
                  {confirmingId === t.id ? (
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <Text size="xs">Remove?</Text>
                      <Button size="compact-xs" color="red" onClick={() => removeTransaction(t.id)}>Confirm</Button>
                      <Button size="compact-xs" variant="default" onClick={() => setConfirmingId(null)}>Cancel</Button>
                    </Group>
                  ) : (
                    <ActionIcon variant="subtle" color="red" size="sm" aria-label="Remove transaction" onClick={() => setConfirmingId(t.id)}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {showForm && (
        <div>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" mt="xs">
            <TextInput id={`${uid}-cash`} label="Amount (cash)" type="number" step="0.01" value={amountCash} onChange={e => setAmountCash(e.currentTarget.value)} />
            <TextInput id={`${uid}-points`} label="Amount (points)" type="number" step="1" value={amountPoints} onChange={e => setAmountPoints(e.currentTarget.value)} />
            <TextInput id={`${uid}-date`} label="Date" type="date" value={transactionDate} onChange={e => setTransactionDate(e.currentTarget.value)} />
            <TextInput id={`${uid}-conf`} label="New confirmation number" placeholder="Optional, e.g. for rebooking" value={confirmationNumber} onChange={e => setConfirmationNumber(e.currentTarget.value)} />
          </SimpleGrid>
          <Textarea id={`${uid}-notes`} mt="xs" label="Notes" rows={3} placeholder="Optional, e.g. paste the fee/tax breakdown" value={notes} onChange={e => setNotes(e.currentTarget.value)} />
          <Button mt="xs" size="xs" onClick={addTransaction} loading={saving}>Add transaction</Button>
        </div>
      )}
    </div>
  );
}
