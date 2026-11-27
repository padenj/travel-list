# Transaction Modal and Row Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move add/edit transaction into a stacked modal and stop repeating the booking confirmation number on every transaction row.

**Architecture:** A new `TransactionFormModal` owns the form state, validation and API calls for one transaction (add when `transaction` is null). `BookingTransactionList` becomes a plain list that opens the modal and reloads on save. Spec: `docs/superpowers/specs/2026-11-27-transaction-modal-design.md`.

**Tech Stack:** React 18, Mantine 8.3 (`Modal`, `useMediaQuery`), vitest + @testing-library/react (no jest-dom).

**Ground rules:** client tsc baseline is 93 `error TS` lines (`npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"`); new test files must be added to the `include` whitelist in `vitest.config.ts`; commit trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

---

## File map

- Create `client/src/components/TransactionFormModal.tsx` — modal, form, validation, save.
- Create `client/src/__tests__/TransactionFormModal.test.tsx`.
- Modify `client/src/components/BookingTransactionList.tsx` — remove inline form and carried confirmation; open the modal.
- Modify `client/src/__tests__/BookingTransactionList.test.tsx`.
- Modify `client/src/components/BookingBlock.tsx`, `client/src/components/LodgingPaymentsTab.tsx` — drop `originalConfirmationNumber`.
- Modify `vitest.config.ts` — whitelist the new test.
- Modify `client/src/components/ComponentUsage.md` — record the new component.

---

### Task 1: `TransactionFormModal`

**Files:** Create `client/src/components/TransactionFormModal.tsx`, `client/src/__tests__/TransactionFormModal.test.tsx`; modify `vitest.config.ts`.

- [ ] **Step 1: Write the failing test** — `client/src/__tests__/TransactionFormModal.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, screen, waitFor, fireEvent } from '@testing-library/react';
import { Modal } from '@mantine/core';
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
      <Modal opened onClose={parentClose} title="Stay">
        <TransactionFormModal opened tripId="trip-1" bookingId="b1" transaction={null} onClose={onClose} onSaved={() => {}} />
      </Modal>,
    );
    const cash = await screen.findByLabelText('Amount (cash)');
    fireEvent.keyDown(cash, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(parentClose).not.toHaveBeenCalled();
  });
});
```

Add `'client/src/__tests__/TransactionFormModal.test.tsx', // Add/edit transaction modal` to the top of the `include` list in `vitest.config.ts`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run client/src/__tests__/TransactionFormModal.test.tsx`
Expected: FAIL — cannot resolve `../components/TransactionFormModal`.

- [ ] **Step 3: Implement** — `client/src/components/TransactionFormModal.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { Alert, Button, Group, Modal, SimpleGrid, Text, TextInput, Textarea } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { BookingTransaction } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { formatMoney } from '../utils/money';
import { PaymentMethodSelect } from './PaymentMethodSelect';

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

// Mantine modal key handlers live on the React tree, so an Escape inside this (portaled) modal
// would otherwise bubble to the stay/flight dialog that renders it and close that too.
const stopEscape = (e: React.KeyboardEvent) => {
  if (e.key === 'Escape') e.stopPropagation();
};

export function TransactionFormModal({ opened, tripId, bookingId, transaction, onClose, onSaved }: TransactionFormModalProps) {
  const isMobile = Boolean(useMediaQuery('(max-width: 48em)'));
  const [form, setForm] = useState<TransactionForm>(() => formFromTransaction(transaction));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

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
    <div onKeyDown={stopEscape}>
      <Modal
        opened={opened}
        onClose={onClose}
        title={transaction ? 'Edit transaction' : 'Add transaction'}
        size="lg"
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
    </div>
  );
}
```

If the Escape test still sees `parentClose` called, check how Mantine 8's `ModalBaseContent` handles `onKeyDown` and move `stopEscape` to the modal content (`<Modal ... onKeyDown>` is not forwarded; use `Modal.Root`/`Modal.Content onKeyDown` instead).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run client/src/__tests__/TransactionFormModal.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/TransactionFormModal.tsx client/src/__tests__/TransactionFormModal.test.tsx vitest.config.ts
git commit -m "feat(client): add/edit transaction modal

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `BookingTransactionList` uses the modal; rows stop carrying the confirmation

**Files:** Modify `client/src/components/BookingTransactionList.tsx`, `client/src/__tests__/BookingTransactionList.test.tsx`, `client/src/components/BookingBlock.tsx` (line ~148), `client/src/components/LodgingPaymentsTab.tsx` (line ~39).

- [ ] **Step 1: Update the tests** — in `client/src/__tests__/BookingTransactionList.test.tsx`:

Replace the test `'shows points, negative amounts with the sign first, and carries the original confirmation'` with:

```tsx
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
```

Replace `'keeps the add form collapsed until "+ Transaction" is clicked'` with:

```tsx
  it('opens an "Add transaction" dialog from "+ Transaction"', async () => {
    renderList();
    await screen.findByText('$78.98');
    expect(screen.queryByLabelText(/amount \(cash\)/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /\+ transaction/i }));
    expect(await screen.findByRole('dialog', { name: 'Add transaction' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByLabelText(/amount \(cash\)/i)).toBeNull());
  });
```

In `'adds a negative transaction with a new confirmation number, then collapses the form'` rename to `'adds a transaction through the dialog, then closes it and reloads'`, add `expect(tripApi.listBookingTransactions).toHaveBeenCalledTimes(2)` inside a `waitFor` after the `onChanged` assertion, and keep the rest.

Replace `'edits a transaction with the form prefilled'` with:

```tsx
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
```

Replace `'keeps only one form open and reports editing'` with:

```tsx
  it('reports editing while the edit dialog is open', async () => {
    const onEditingChange = vi.fn();
    renderList({ onEditingChange });
    await screen.findByText('$78.98');
    fireEvent.click(screen.getByRole('button', { name: 'Edit transaction' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });
```

Tests `'uses a multi-line textarea for notes'`, `'shows a validation error…'`, `'reports editing state while the add-transaction form is open'` and `'sends the chosen payment method when adding'` stay as they are; if a `getBy…` on a field races the modal opening, change it to `await screen.findBy…`.

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run client/src/__tests__/BookingTransactionList.test.tsx`
Expected: FAIL in the new/changed tests (no dialog role, `New conf #` missing).

- [ ] **Step 3: Implement** — replace `client/src/components/BookingTransactionList.tsx` with:

```tsx
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

// `modal` is null (closed), 'add', or the transaction being edited.
type ModalState = null | 'add' | BookingTransaction;

export function BookingTransactionList({ tripId, bookingId, refreshKey = 0, onChanged, onCountChange, onEditingChange }: BookingTransactionListProps) {
  const [transactions, setTransactions] = useState<BookingTransaction[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
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
    onEditingChangeRef.current?.(modal !== null);
  }, [modal]);
  useEffect(() => () => onEditingChangeRef.current?.(false), []);

  const openAdd = () => {
    setError(null);
    setConfirmingId(null);
    setModal('add');
  };

  const openEdit = (t: BookingTransaction) => {
    setError(null);
    setConfirmingId(null);
    setModal(t);
  };

  const handleSaved = async () => {
    setModal(null);
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
        opened={modal !== null}
        tripId={tripId}
        bookingId={bookingId}
        transaction={modal === 'add' ? null : modal}
        onClose={() => setModal(null)}
        onSaved={handleSaved}
      />
    </div>
  );
}
```

Then remove the `originalConfirmationNumber={booking.confirmationNumber}` line from `client/src/components/BookingBlock.tsx` and `client/src/components/LodgingPaymentsTab.tsx`.

- [ ] **Step 4: Run tests + types**

Run: `npx vitest run client/src/__tests__/BookingTransactionList.test.tsx client/src/__tests__/TransactionFormModal.test.tsx client/src/__tests__/BookingCard.test.tsx client/src/__tests__/LodgingPaymentsTab.test.tsx client/src/__tests__/LodgingDetailsTab.test.tsx`
Expected: PASS. If `BookingCard`/`LodgingPaymentsTab` tests asserted the booking confirmation inside the transaction list, update them to the new `New conf #` behaviour.

Run: `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"` → `93`.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/BookingTransactionList.tsx client/src/components/BookingBlock.tsx client/src/components/LodgingPaymentsTab.tsx client/src/__tests__/BookingTransactionList.test.tsx
git commit -m "feat(client): open transactions in a modal; label new confirmation numbers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Docs and verification

- [ ] **Step 1:** In `client/src/components/ComponentUsage.md` add `TransactionFormModal` — used by `BookingTransactionList`.
- [ ] **Step 2:** Full run: `npx vitest run` (all pass) and client tsc (93).
- [ ] **Step 3: Browser smoke** at 1440×900 and 390×844 against the running dev server (http://localhost:3000, uitester / UiTest123!): open a stay → Payments → ✏️ → modal titled "Edit transaction" over the stay dialog with the summary; Payment method dropdown opens above the modal; mobile modal is full screen; Escape closes only the modal; Save updates the row. Rows show no booking confirmation number. Screenshots to `/config/workspace/shots/txm-*.png` (not committed).
- [ ] **Step 4: Commit docs**

```bash
git add client/src/components/ComponentUsage.md
git commit -m "docs: TransactionFormModal usage

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
