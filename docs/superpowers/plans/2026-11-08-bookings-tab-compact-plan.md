# Bookings Tab Compact Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the Bookings tab of the flight dialog: compact booking blocks with a one-line money summary, a small transactions table, and collapsible add forms.

**Architecture:** A pure helper (`utils/bookingSummary.ts`) builds the money line. `BookingTransactionList` and `BookingCard` are rewritten with Mantine components and tokens, keeping their props, API calls and every field label. Add forms start collapsed. Legacy card styles in `trips.css` are removed once nothing references them.

**Tech Stack:** React 18, TypeScript, Mantine 8.3, `@tabler/icons-react`, Vitest + Testing Library (`renderWithMantine`).

**Spec:** `docs/superpowers/specs/2026-11-08-bookings-tab-compact-design.md`

## Conventions

- Run from repo root `/config/workspace/travel-list`, branch `feat/trip-page-compact-redesign` (or a new branch off it, e.g. `feat/bookings-tab-compact`; create it in Task 0).
- Tests: `npx vitest run <path>`. Types: `npx tsc -p tsconfig.json --noEmit`.
- Component tests use `renderWithMantine` from `client/src/test-utils/renderWithMantine` (real Mantine, `env="test"`).
- Do NOT use `pkill`/`killall`; leave the dev server (3000/3001) and the dev DB test data alone.
- Commit trailer on every commit: `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## Decisions refining the spec (apply in Task 0)

- The booking's "Actual total" and "Total paid" are the same number (`actualTotalCash`/`actualTotalPoints` are the sum of the transactions), so the money line shows one `Paid` figure with the per-person amount: `Advertised $200.00/person · Paid $10.00 ($10.00/person)`.
- The transactions table has four short columns (date, amount, confirmation, action) that fit at 390px, so no mobile stacking is needed.

## File map

| File | Action | Responsibility |
|---|---|---|
| `client/src/utils/bookingSummary.ts` | Create | `bookingMoneyLine(booking)` |
| `client/src/__tests__/bookingSummary.test.ts` | Create | Unit tests |
| `client/src/components/BookingTransactionList.tsx` | Rewrite | Table, inline remove confirm, collapsed add form |
| `client/src/__tests__/BookingTransactionList.test.tsx` | Rewrite | Updated + new tests |
| `client/src/components/BookingCard.tsx` | Rewrite | Compact booking blocks, collapsible add form |
| `client/src/__tests__/BookingCard.test.tsx` | Rewrite | Updated + new tests |
| `client/src/styles/trips.css` | Modify | Remove dead card/txn rules |
| `vitest.config.ts` | Modify | Whitelist `bookingSummary.test.ts` |
| docs usage maps, spec | Modify | Amendments |

---

### Task 0: Branch, spec amendment, whitelist

**Files:** Modify `docs/superpowers/specs/2026-11-08-bookings-tab-compact-design.md`, `vitest.config.ts`

- [ ] **Step 1: Branch**

```bash
git checkout -b feat/bookings-tab-compact
```

- [ ] **Step 2: Amend the spec**

In the spec, with the edit tool:
1. Replace the "Money line" bullet with: ``- Money line: `Advertised $X/person · Paid $T ($P/person)`; points are shown the same way (`9,000 pts + $5.60`). "Actual total" and "Total paid" are the same figure, so only `Paid` is shown. Advertised is omitted when neither price is set. Wraps on mobile.``
2. Replace `Stacks to two lines on mobile. A note renders` with `The four short columns fit on mobile, so there is no stacking. A note renders`.

- [ ] **Step 3: Whitelist the new test**

In `vitest.config.ts`, after the line containing `BookingCard.test.tsx`, add:

```ts
      'client/src/__tests__/bookingSummary.test.ts', // Booking money line helper
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs vitest.config.ts
git commit -m "chore: bookings tab spec amendments and whitelist

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 1: Booking money line helper

**Files:** Create `client/src/utils/bookingSummary.ts`; Test `client/src/__tests__/bookingSummary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Booking } from '../types/trip';
import { bookingMoneyLine } from '../utils/bookingSummary';

function booking(extra: Partial<Booking>): Booking {
  return {
    id: 'b1', tripId: 't', confirmationNumber: null, advertisedPriceCash: null, advertisedPricePoints: null,
    loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '', elementIds: ['e1'], travelerIds: ['p1'],
    currentConfirmationNumber: null, actualTotalCash: 0, actualTotalPoints: 0, ...extra,
  };
}

describe('bookingMoneyLine', () => {
  it('shows advertised and paid with per-person amounts', () => {
    const line = bookingMoneyLine(booking({ advertisedPriceCash: 200, actualTotalCash: 10 }));
    expect(line).toBe('Advertised $200.00/person · Paid $10.00 ($10.00/person)');
  });

  it('divides paid cash across travelers', () => {
    const line = bookingMoneyLine(booking({ travelerIds: ['p1', 'p2'], actualTotalCash: 100 }));
    expect(line).toBe('Paid $100.00 ($50.00/person)');
  });

  it('shows points, with cash when both are present', () => {
    const line = bookingMoneyLine(booking({ advertisedPricePoints: 9000, actualTotalCash: 5.6, actualTotalPoints: 9000 }));
    expect(line).toBe('Advertised 9,000 pts/person · Paid 9,000 pts + $5.60 ($5.60/person)');
  });

  it('shows $0.00 paid when nothing has been paid and omits advertised when unset', () => {
    expect(bookingMoneyLine(booking({}))).toBe('Paid $0.00');
  });

  it('keeps the sign of refunds', () => {
    expect(bookingMoneyLine(booking({ actualTotalCash: -20 }))).toBe('Paid -$20.00 (-$20.00/person)');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/__tests__/bookingSummary.test.ts` — Expected: FAIL (cannot resolve module).

- [ ] **Step 3: Implement**

```ts
import { Booking } from '../types/trip';
import { formatPrice } from './flightRows';
import { formatMoney } from './money';

export function bookingMoneyLine(booking: Booking): string {
  const parts: string[] = [];

  const advertised = formatPrice(booking.advertisedPriceCash, booking.advertisedPricePoints);
  if (advertised) parts.push(`Advertised ${advertised}/person`);

  const paid = formatPrice(booking.actualTotalCash, booking.actualTotalPoints);
  if (!paid) {
    parts.push('Paid $0.00');
  } else if (booking.actualTotalCash !== 0 && booking.travelerIds.length > 0) {
    const perPerson = formatMoney(booking.actualTotalCash / booking.travelerIds.length);
    parts.push(`Paid ${paid} (${perPerson}/person)`);
  } else {
    parts.push(`Paid ${paid}`);
  }

  return parts.join(' · ');
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run client/src/__tests__/bookingSummary.test.ts` — Expected: 5 passed.

```bash
git add client/src/utils/bookingSummary.ts client/src/__tests__/bookingSummary.test.ts
git commit -m "feat: add booking money line helper

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Compact BookingTransactionList

**Files:** Rewrite `client/src/components/BookingTransactionList.tsx`; Rewrite `client/src/__tests__/BookingTransactionList.test.tsx`

- [ ] **Step 1: Rewrite the test file (the failing tests)**

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    listBookingTransactions: vi.fn(),
    addBookingTransaction: vi.fn(),
    deleteBookingTransaction: vi.fn(),
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
      { id: 't1', bookingId: 'b1', amountCash: 78.98, amountPoints: 0, transactionDate: '2026-01-15', confirmationNumber: null, notes: 'Fee breakdown', createdAt: '' },
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
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/__tests__/BookingTransactionList.test.tsx` — Expected: FAIL (old UI has no "+ Transaction", still shows total, etc.).

- [ ] **Step 3: Rewrite the component**

```tsx
import { useState, useEffect, useCallback, useId } from 'react';
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
}

function parseAmount(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function BookingTransactionList({ tripId, bookingId, originalConfirmationNumber = null, refreshKey = 0, onChanged }: BookingTransactionListProps) {
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
```

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run client/src/__tests__/BookingTransactionList.test.tsx` — Expected: 8 passed. If a `Cancel` query is ambiguous (form-toggle Cancel vs inline Cancel never coexist in these tests), fix the test query, not the component.
Run: `npx tsc -p tsconfig.json --noEmit` — Expected: no output (BookingCard still compiles; it only passes existing props).

```bash
git add client/src/components/BookingTransactionList.tsx client/src/__tests__/BookingTransactionList.test.tsx
git commit -m "feat: compact transactions table with inline remove confirm

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Compact BookingCard

**Files:** Rewrite `client/src/components/BookingCard.tsx`; Rewrite `client/src/__tests__/BookingCard.test.tsx`

- [ ] **Step 1: Rewrite the test file (the failing tests)**

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { Booking, TripElement, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    listBookings: vi.fn(),
    createBooking: vi.fn(),
    createParticipant: vi.fn(),
    listBookingTransactions: vi.fn(),
    addBookingTransaction: vi.fn(),
    deleteBookingTransaction: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { BookingCard } from '../components/BookingCard';

const elements: TripElement[] = [
  { id: 'el-1', tripId: 'trip-1', elementType: 'flight', name: 'Departure Flights', sortPosition: 0, createdAt: '', updatedAt: '' },
  { id: 'el-2', tripId: 'trip-1', elementType: 'flight', name: 'Return Flights', sortPosition: 1, createdAt: '', updatedAt: '' },
];

const participants: TripParticipant[] = [
  { id: 'p1', tripId: 'trip-1', displayName: 'Alice', createdAt: '' },
];

function makeBooking(extra: Partial<Booking> = {}): Booking {
  return {
    id: 'b1', tripId: 'trip-1', confirmationNumber: 'ABC123', advertisedPriceCash: 79, advertisedPricePoints: null,
    loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '',
    elementIds: ['el-1'], travelerIds: ['p1'], currentConfirmationNumber: 'ABC123', actualTotalCash: 0, actualTotalPoints: 0,
    ...extra,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof BookingCard>> = {}) {
  return renderWithMantine(
    <BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} {...props} />
  );
}

describe('BookingCard', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    (tripApi.listBookings as any).mockResolvedValue([]);
    (tripApi.listBookingTransactions as any).mockResolvedValue([]);
  });

  it('shows "no bookings yet" and no redundant heading when there are none', async () => {
    renderCard();
    expect(await screen.findByText(/no bookings yet for this flight/i)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /^bookings$/i })).toBeNull();
  });

  it('keeps the add form collapsed until "+ Booking" is clicked and collapses on cancel', async () => {
    renderCard();
    await screen.findByText(/no bookings/i);
    expect(screen.queryByLabelText(/confirmation number/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /\+ booking/i }));
    expect(screen.getByLabelText(/confirmation number/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByLabelText(/confirmation number/i)).toBeNull();
  });

  it('creates a booking with an existing traveler, advertised per-person price, and a linked second element', async () => {
    const created = makeBooking({ elementIds: ['el-1', 'el-2'] });
    (tripApi.createBooking as any).mockResolvedValue(created);
    (tripApi.listBookings as any).mockResolvedValueOnce([]).mockResolvedValueOnce([created]);

    renderCard();
    await screen.findByText(/no bookings/i);

    fireEvent.click(screen.getByRole('button', { name: /\+ booking/i }));
    fireEvent.change(screen.getByLabelText(/confirmation number/i), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText(/advertised price per person \(cash\)/i), { target: { value: '79' } });
    fireEvent.click(screen.getByLabelText('Alice'));
    fireEvent.click(screen.getByLabelText('Return Flights'));
    fireEvent.click(screen.getByRole('button', { name: /save booking/i }));

    await waitFor(() => expect(tripApi.createBooking).toHaveBeenCalledWith('trip-1', expect.objectContaining({
      confirmationNumber: 'ABC123',
      advertisedPriceCash: 79,
      travelerIds: ['p1'],
      elementIds: expect.arrayContaining(['el-1', 'el-2']),
    })));
    expect(await screen.findByText('ABC123')).toBeTruthy();
    expect(screen.queryByLabelText(/confirmation number/i)).toBeNull();
  });

  it('requires at least one traveler', async () => {
    renderCard();
    await screen.findByText(/no bookings/i);
    fireEvent.click(screen.getByRole('button', { name: /\+ booking/i }));
    fireEvent.click(screen.getByRole('button', { name: /save booking/i }));
    expect(await screen.findByText(/select or add at least one traveler/i)).toBeTruthy();
    expect(tripApi.createBooking).not.toHaveBeenCalled();
  });

  it('renders a compact booking: confirmation, traveler chips and the money line', async () => {
    (tripApi.listBookings as any).mockResolvedValue([makeBooking({ advertisedPriceCash: 200, actualTotalCash: 10 })]);
    renderCard();
    expect(await screen.findByText('ABC123')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Advertised $200.00/person · Paid $10.00 ($10.00/person)')).toBeTruthy();
    expect(screen.queryByText(/originally booked/i)).toBeNull();
  });

  it('shows "Also covers" for a booking linked to more than one element', async () => {
    (tripApi.listBookings as any).mockResolvedValue([makeBooking({ elementIds: ['el-1', 'el-2'] })]);
    renderCard();
    expect(await screen.findByText(/also covers/i)).toBeTruthy();
    expect(await screen.findByText('Return Flights')).toBeTruthy();
  });

  it('shows the original confirmation after a rebook changed the current one', async () => {
    (tripApi.listBookings as any).mockResolvedValue([
      makeBooking({ currentConfirmationNumber: 'XYZ789', actualTotalCash: 137.96 }),
    ]);
    renderCard();
    expect(await screen.findByText('XYZ789')).toBeTruthy();
    expect(screen.getByText('orig ABC123')).toBeTruthy();
    expect(screen.getByText(/\$137\.96 \(\$137\.96\/person\)/)).toBeTruthy();
  });

  it('shows a placeholder when a booking has no confirmation number', async () => {
    (tripApi.listBookings as any).mockResolvedValue([
      makeBooking({ confirmationNumber: null, currentConfirmationNumber: null }),
    ]);
    renderCard();
    expect(await screen.findByText(/no confirmation number/i)).toBeTruthy();
  });

  it('refetches bookings when refreshKey changes', async () => {
    const { rerender } = renderCard({ refreshKey: 0 });
    await waitFor(() => expect(tripApi.listBookings).toHaveBeenCalledTimes(1));
    rerender(
      <BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} refreshKey={1} />
    );
    await waitFor(() => expect(tripApi.listBookings).toHaveBeenCalledTimes(2));
  });
});
```

Note: `rerender` from `renderWithMantine` re-renders without the `MantineProvider` wrapper. If the last test fails with a missing-provider error, wrap the rerendered element: `rerender(<MantineProvider env="test"><BookingCard .../></MantineProvider>)` with `import { MantineProvider } from '@mantine/core'`. (Fixing the test, not the component.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/__tests__/BookingCard.test.tsx` — Expected: FAIL (old UI has "+ Add Booking", always-visible form, etc.).

- [ ] **Step 3: Rewrite the component**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { Alert, Badge, Button, Checkbox, Group, Paper, SimpleGrid, Text, TextInput } from '@mantine/core';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { BookingTransactionList } from './BookingTransactionList';
import { bookingMoneyLine } from '../utils/bookingSummary';

interface BookingCardProps {
  tripId: string;
  elementId: string;
  elements: TripElement[];
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  refreshKey?: number;
  onBookingsChanged?: () => void;
}

function parseNumberInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function BookingCard({ tripId, elementId, elements, participants, onParticipantsChanged, refreshKey = 0, onBookingsChanged }: BookingCardProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [advertisedPriceCash, setAdvertisedPriceCash] = useState('');
  const [advertisedPricePoints, setAdvertisedPricePoints] = useState('');
  const [loyaltyProgram, setLoyaltyProgram] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>([]);
  const [newTravelerName, setNewTravelerName] = useState('');
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([elementId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await tripApi.listBookings(tripId, elementId);
    setBookings(data);
  }, [tripId, elementId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleBookingsChanged = useCallback(async () => {
    await load();
    onBookingsChanged?.();
  }, [load, onBookingsChanged]);

  const toggleTraveler = (participantId: string) => {
    setSelectedTravelerIds(prev =>
      prev.includes(participantId) ? prev.filter(id => id !== participantId) : [...prev, participantId]
    );
  };

  const toggleElement = (id: string) => {
    setSelectedElementIds(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const saveBooking = async () => {
    try {
      setSaving(true);
      setError(null);
      const travelerIds = [...selectedTravelerIds];

      if (newTravelerName.trim()) {
        const created = await tripApi.createParticipant(tripId, { displayName: newTravelerName.trim() });
        travelerIds.push(created.id);
        onParticipantsChanged([...participants, created]);
      }

      if (travelerIds.length === 0) {
        setError('Select or add at least one traveler');
        return;
      }
      if (selectedElementIds.length === 0) {
        setError('Select at least one element this booking covers');
        return;
      }

      await tripApi.createBooking(tripId, {
        confirmationNumber: confirmationNumber.trim() || undefined,
        advertisedPriceCash: parseNumberInput(advertisedPriceCash),
        advertisedPricePoints: parseNumberInput(advertisedPricePoints),
        loyaltyProgram: loyaltyProgram.trim() || undefined,
        notes: notes.trim() || undefined,
        elementIds: selectedElementIds,
        travelerIds,
      });

      setConfirmationNumber('');
      setAdvertisedPriceCash('');
      setAdvertisedPricePoints('');
      setLoyaltyProgram('');
      setNotes('');
      setSelectedTravelerIds([]);
      setNewTravelerName('');
      setSelectedElementIds([elementId]);
      setShowForm(false);
      await handleBookingsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save booking');
    } finally {
      setSaving(false);
    }
  };

  const otherElements = elements.filter(e => e.id !== elementId && e.elementType === 'flight');

  return (
    <div>
      <Group justify="flex-end">
        <Button size="compact-sm" variant="light" onClick={() => setShowForm(prev => !prev)}>
          {showForm ? 'Cancel' : '+ Booking'}
        </Button>
      </Group>

      {error && <Alert color="red" mt="xs">{error}</Alert>}

      {showForm && (
        <Paper withBorder p="sm" mt="xs">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <TextInput id={`booking-conf-${elementId}`} label="Confirmation number" value={confirmationNumber} onChange={e => setConfirmationNumber(e.currentTarget.value)} />
            <TextInput id={`booking-loyalty-${elementId}`} label="Loyalty program" value={loyaltyProgram} onChange={e => setLoyaltyProgram(e.currentTarget.value)} />
            <TextInput id={`booking-price-cash-${elementId}`} label="Advertised price per person (cash)" type="number" step="0.01" value={advertisedPriceCash} onChange={e => setAdvertisedPriceCash(e.currentTarget.value)} />
            <TextInput id={`booking-price-points-${elementId}`} label="Advertised price per person (points)" type="number" step="1" value={advertisedPricePoints} onChange={e => setAdvertisedPricePoints(e.currentTarget.value)} />
          </SimpleGrid>
          <TextInput mt="xs" id={`booking-notes-${elementId}`} label="Notes" value={notes} onChange={e => setNotes(e.currentTarget.value)} />

          <Text size="sm" fw={600} mt="sm">Travelers on this booking</Text>
          <Group gap="sm" mt={4}>
            {participants.map(p => (
              <Checkbox key={p.id} label={p.displayName} checked={selectedTravelerIds.includes(p.id)} onChange={() => toggleTraveler(p.id)} />
            ))}
          </Group>
          <TextInput
            mt="xs"
            id={`booking-new-traveler-${elementId}`}
            label="+ New traveler"
            placeholder="Name of traveler not yet on the trip"
            value={newTravelerName}
            onChange={e => setNewTravelerName(e.currentTarget.value)}
          />

          {otherElements.length > 0 && (
            <>
              <Text size="sm" fw={600} mt="sm">Also applies to</Text>
              <Group gap="sm" mt={4}>
                {otherElements.map(el => (
                  <Checkbox key={el.id} label={el.name} checked={selectedElementIds.includes(el.id)} onChange={() => toggleElement(el.id)} />
                ))}
              </Group>
            </>
          )}

          <Button mt="sm" size="xs" onClick={saveBooking} loading={saving}>Save booking</Button>
        </Paper>
      )}

      {bookings.length === 0 && !showForm && (
        <Text size="sm" c="dimmed" mt="xs">No bookings yet for this flight</Text>
      )}

      {bookings.map(booking => {
        const travelerNames = booking.travelerIds.map(id => participants.find(p => p.id === id)?.displayName || id);
        const otherLinkedElements = booking.elementIds
          .filter(id => id !== elementId)
          .map(id => elements.find(e => e.id === id))
          .filter((e): e is TripElement => !!e);

        return (
          <Paper key={booking.id} withBorder p="xs" mt="xs">
            <Group gap="xs">
              <Text fw={700}>{booking.currentConfirmationNumber || 'No confirmation number'}</Text>
              {booking.confirmationNumber && booking.confirmationNumber !== booking.currentConfirmationNumber && (
                <Text size="xs" c="dimmed">{`orig ${booking.confirmationNumber}`}</Text>
              )}
              {travelerNames.map((name, index) => (
                <Badge key={`${name}-${index}`} variant="outline" tt="none" size="sm">{name}</Badge>
              ))}
            </Group>
            <Text size="sm" c="dimmed">{bookingMoneyLine(booking)}</Text>
            {otherLinkedElements.length > 0 && (
              <Text size="xs" c="dimmed">
                Also covers:{' '}
                {otherLinkedElements.map((e, index) => (
                  <span key={e.id}>
                    {index > 0 ? ', ' : ''}
                    {e.name}
                  </span>
                ))}
              </Text>
            )}
            <BookingTransactionList
              tripId={tripId}
              bookingId={booking.id}
              originalConfirmationNumber={booking.confirmationNumber}
              refreshKey={refreshKey}
              onChanged={handleBookingsChanged}
            />
          </Paper>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run client/src/__tests__/BookingCard.test.tsx client/src/__tests__/BookingTransactionList.test.tsx client/src/__tests__/TripDetailPage.test.tsx` — Expected: all pass (the page test mocks `BookingCard`).
Run: `npx tsc -p tsconfig.json --noEmit` — Expected: no output.

```bash
git add client/src/components/BookingCard.tsx client/src/__tests__/BookingCard.test.tsx
git commit -m "feat: compact booking blocks with collapsible add form

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Remove dead styles, docs, full verification, visual check

**Files:** Modify `client/src/styles/trips.css`, `client/src/components/ComponentUsage.md`

- [ ] **Step 1: Find now-unreferenced classes**

```bash
for c in element-card element-header booking-card-section booking-card-header booking-form booking-transaction-list booking-transaction-total txn-notes no-elements view-toggle-btn create-element-field; do
  echo "$(grep -rl --include=*.tsx -e "$c" client/src | grep -v __tests__ | wc -l) $c"
done
```
Expected: `0` for `element-card`, `element-header`, `booking-card-section`, `booking-card-header`, `booking-form`, `booking-transaction-list`, `booking-transaction-total`, `txn-notes`. Classes with a non-zero count stay. Check `FlightSeatGrid`/other components before deleting anything with a non-zero count.

- [ ] **Step 2: Delete the zero-count rules from `client/src/styles/trips.css`**

Remove the rule blocks (and their `:hover`, `h3`, and the `@media (max-width: 768px) { .element-header {...} }` block) for every class that showed `0`: `.element-card`, `.element-card:hover`, `.element-header`, `.element-card h3`, `.txn-notes`, `.booking-transaction-list textarea`, plus any `.booking-*` rules. Keep `.no-elements` if its count is non-zero, and keep `.view-toggle-btn`/`.create-element-field` while any component references them. Re-run the loop from Step 1 afterwards and also `grep -n "booking\|txn\|element-card\|element-header" client/src/styles/trips.css` — Expected: no leftover rules for removed classes.

- [ ] **Step 3: Update `client/src/components/ComponentUsage.md`**

Add a line under the existing `BookingCard` entry: used by `pages/TripDetailPage.tsx` Bookings tab; renders `BookingTransactionList` and uses `utils/bookingSummary.ts`. Note `BookingTransactionList` is used only by `BookingCard`.

- [ ] **Step 4: Full verification**

Run: `npx tsc -p tsconfig.json --noEmit` — Expected: no output.
Run: `npx vitest run 2>&1 | tail -20` — Expected: only the 12 known `no such table: families` server/integration failures.

- [ ] **Step 5: Visual check with Playwright**

The dev server is already running on `http://localhost:3000` (do not restart it; do not modify dev data beyond adding and removing throwaway transactions you create yourself). Login `uitester` / `UiTest123!`, Cabo trip `/trips/b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6`, flight "Wn0722" (it has bookings ABC123/XYZ789 with transactions). In a throwaway script under `/tmp` (not in the repo, use `/tmp/lib.cjs` `open()` if present):
1. At 1440×900 open the flight dialog → Bookings tab; screenshot to `/tmp/shots/bookings-desktop.png`. Assert the tab's content height is well under the old layout (the dialog body no longer needs scrolling for two bookings with their transactions, or at most a small scroll), and `scrollWidth <= clientWidth`.
2. Click `+ Booking`, screenshot the open form, click Cancel. Click one `+ Transaction`, screenshot, cancel. Click a transaction's remove icon, confirm the inline `Remove?` prompt appears, click Cancel (do not delete real data).
3. At 390×844 repeat the Bookings tab screenshot; assert no horizontal overflow.
View the screenshots with the `view` tool and check readability, theme and wrapping. Fix real issues in the components (re-run the Task 2/3 tests) and commit them separately.

- [ ] **Step 6: Commit**

```bash
git add client/src/styles/trips.css client/src/components/ComponentUsage.md
git commit -m "style: drop unused booking card styles, update usage docs

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-review notes

- **Spec coverage:** heading removed + `+ Booking` toggle + two-column form + chips (Task 3); bordered blocks, header with orig/traveler chips, money line, also-covers, empty state (Tasks 1, 3); transactions table, note line, icon Remove with inline confirm, collapsed add form, Total moved to money line (Task 2); styling cleanup (Task 4); tests incl. Playwright (Tasks 1–4). Spec amendments (single `Paid` figure, no mobile stacking) are applied in Task 0.
- **Type consistency:** `bookingMoneyLine(booking: Booking)` defined in Task 1 and used in Task 3; `BookingTransactionList` props unchanged; `BookingCard` props unchanged, so `TripDetailPage` needs no change.
- **Assumptions to verify while implementing:** `rerender` provider wrapping (Task 3 note); whether other components still use `.no-elements`, `.view-toggle-btn`, `.create-element-field` (Task 4 Step 1).
