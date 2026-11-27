import { useState, useEffect, useCallback, useRef } from 'react';
import { ActionIcon, Alert, Button, Group, Table, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { BookingTransaction } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { formatMoney } from '../utils/money';
import { TransactionFormModal } from './TransactionFormModal';

interface BookingTransactionListProps {
  tripId: string;
  bookingId: string;
  refreshKey?: number;
  onChanged: () => void;
  onCountChange?: (count: number) => void;
  onEditingChange?: (editing: boolean) => void;
}

export function BookingTransactionList({ tripId, bookingId, refreshKey = 0, onChanged, onCountChange, onEditingChange }: BookingTransactionListProps) {
  const [transactions, setTransactions] = useState<BookingTransaction[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  // Kept after closing so the modal doesn't flip to "Add transaction" while it fades out.
  const [editingTransaction, setEditingTransaction] = useState<BookingTransaction | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    onEditingChangeRef.current?.(modalOpen);
  }, [modalOpen]);
  useEffect(() => () => onEditingChangeRef.current?.(false), []);

  const openAdd = () => {
    setError(null);
    setConfirmingId(null);
    setEditingTransaction(null);
    setModalOpen(true);
  };

  const openEdit = (t: BookingTransaction) => {
    setError(null);
    setConfirmingId(null);
    setEditingTransaction(t);
    setModalOpen(true);
  };

  const handleSaved = async () => {
    setModalOpen(false);
    await load();
    onChanged();
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
        <Button size="compact-xs" variant="subtle" onClick={openAdd}>+ Transaction</Button>
      </Group>

      {error && <Alert color="red" mb="xs">{error}</Alert>}

      {transactions.length === 0 ? (
        <Text size="sm" c="dimmed">No transactions yet</Text>
      ) : (
        <Table fz="sm" verticalSpacing={2} horizontalSpacing="xs" withRowBorders={false}>
          <Table.Tbody>
            {transactions.map(t => (
              <Table.Tr key={t.id}>
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
                  {t.confirmationNumber && <Text size="xs" c="dimmed">{`New conf # ${t.confirmationNumber}`}</Text>}
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
                      <ActionIcon variant="subtle" size="sm" aria-label="Edit transaction" onClick={() => openEdit(t)}>
                        <IconPencil size={14} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" size="sm" aria-label="Remove transaction" onClick={() => setConfirmingId(t.id)}>
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

      <TransactionFormModal
        opened={modalOpen}
        tripId={tripId}
        bookingId={bookingId}
        transaction={editingTransaction}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
