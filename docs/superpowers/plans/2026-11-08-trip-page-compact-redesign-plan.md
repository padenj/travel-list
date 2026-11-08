# Trip Page Compact Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the expansive, custom-dark trip detail page with a compact, Mantine-themed page (spreadsheet-style flight table, detail dialog with swipeable tabs) that is usable on desktop and mobile.

**Architecture:** `TripDetailPage` becomes a thin container that loads data and composes small units: `TripHeader`, `TripTravelersStrip`, `FlightsSection` (one CSS-grid row model that reflows to cards on mobile), `ElementDialog` (generic Modal + swipeable Tabs), `FlightDetailsTab`, `FlightSeatsTab`, `AddElementDialog`. Row data comes from pure helpers in `utils/flightRows.ts`. Existing `BookingCard`, `FlightSeatGrid`, `FlightLegsEditor`, `TripParticipantsPanel` keep their logic and markup; `trips.css` is re-tokenized to Mantine variables so they follow the site theme. No backend changes.

**Tech Stack:** React 18, TypeScript, Mantine 8.3 (`@mantine/core`, `@mantine/hooks`), `@tabler/icons-react`, CSS modules, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-trip-page-compact-redesign-design.md`

## Conventions for every task

- Run commands from the repo root `/config/workspace/travel-list`.
- Tests: `npx vitest run <path>`. Types: `npx tsc -p tsconfig.json --noEmit`.
- `vitest.config.ts` has an explicit `include` list; Task 0 pre-registers every new test file.
- Component tests render with `renderWithMantine` (Task 0), which wraps `MantineProvider env="test"` (no portals or transitions) and polyfills `matchMedia`, `ResizeObserver`, `scrollIntoView`.
- Do NOT use `pkill`/`killall`. The dev server runs on 3000 (Vite) / 3001 (API); leave it running.
- Do not delete the dev DB test data (`uitester` / Cabo trip).
- Commit after every task. Commit messages end with the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## File map

| File | Action | Responsibility |
|---|---|---|
| `client/src/test-utils/renderWithMantine.tsx` | Create | Test render helper and DOM polyfills |
| `client/src/utils/tripDates.ts` | Create | Date range and nights formatting |
| `client/src/utils/flightRows.ts` | Create | Pure row model: rows, totals, price/time labels |
| `client/src/utils/swipe.ts` | Create | Swipe direction and blocked-target detection |
| `client/src/components/FlightsSection.tsx` + `.module.css` | Create | Flights table/cards |
| `client/src/components/ElementDialog.tsx` | Create | Generic modal with tabs and swipe |
| `client/src/components/FlightDetailsTab.tsx` | Create | Read-only details, edit mode, delete |
| `client/src/components/FlightSeatsTab.tsx` | Create | Per-leg seat grids |
| `client/src/components/AddElementDialog.tsx` | Create | Create-flight form in a modal |
| `client/src/components/TripHeader.tsx` + `.module.css` | Create | Title, badge, dates, add button |
| `client/src/components/TripTravelersStrip.tsx` | Create | Traveler chips and Manage modal |
| `client/src/pages/TripDetailPage.tsx` | Rewrite | Container |
| `client/src/pages/TripsPage.tsx` | Rewrite | Mantine restyle |
| `client/src/styles/trips.css` | Modify | Re-tokenize, remove dead page-level rules |
| `client/src/__tests__/*` | Create/rewrite | See each task |
| `client/src/APIUsage.md`, `client/src/components/ComponentUsage.md` | Modify | Usage maps |
| `docs/superpowers/specs/2026-11-08-trip-page-compact-redesign-design.md` | Modify | Spec amendments (Task 0) |

---

### Task 0: Branch, spec amendments, test helper, whitelist

**Files:**
- Modify: `docs/superpowers/specs/2026-11-08-trip-page-compact-redesign-design.md`
- Modify: `vitest.config.ts`
- Create: `client/src/test-utils/renderWithMantine.tsx`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/trip-page-compact-redesign
git status -sb | head -3
```
Expected: `## feat/trip-page-compact-redesign`, clean tree (apart from untracked `.superpowers/`, which is gitignored).

- [ ] **Step 2: Amend the spec with the decisions made while planning**

In the spec, make these edits with the edit tool:

1. In "Page structure" item 1, replace `"Edit trip" and "+ Add" actions.` with `and a single "Add flight" action (no trip-edit UI exists today, so none is added).`
2. Add a new bullet to "Page structure" after item 5: `6. **Non-flight elements:** if the trip has hotel, car or activity elements (created before their sections exist), a muted line under the flights section says how many are hidden until those sections are built.`
3. In "Element dialog", replace the Seats bullet's text `; the seat count is shown in the tab label and loaded lazily` with `; the Bookings tab label shows the booking count, the Seats tab has no count (no cheap endpoint)`.
4. Replace the "Add flight modal" sentence with: `An "Add flight" modal (`AddElementDialog`) hosts the create form. It creates flights only (no type selector).`
5. In "Data flow", replace `(booking confirmation, falling back to the element's `bookingReference`)` with `(the booking's current confirmation number; the deprecated element-level `bookingReference` is not shown)`. Also add: `Row price is the linked bookings' advertised price; a booking linked to several flights shows "(shared)" on each row and is counted once in the section total.`
6. In "Errors and edge cases", replace the first two bullets with: `- Form and save errors show inline (Mantine `Alert`) next to the action; a failed page load shows an inline error with Retry; a failed background reload shows a dismissible alert above the page.` and `- Delete uses an inline two-step confirm ("Delete this flight?" Confirm/Cancel) inside the Details tab, not a nested modal.`
7. In "Components", replace the `FlightsSection` description `desktop table and mobile card list from one row model` with `one CSS-grid row model that reflows to stacked cards below 48em (no duplicate DOM)`.
8. In "Components" add rows: `FlightSeatsTab` (per-leg `FlightSeatGrid`), and in "Testing" note tests use `MantineProvider env="test"`.
9. Replace the sentence about `trips.css` in "Components" with: `Existing trip components keep their markup. `trips.css` is re-tokenized so its `--ctp-mocha-*` variables map to Mantine theme tokens (light/dark aware), and page-level rules that nothing references any more are removed. A small CSS module per new component handles row banding and mobile reflow.`

- [ ] **Step 3: Create the test helper**

Create `client/src/test-utils/renderWithMantine.tsx`:

```tsx
import React from 'react';
import { MantineProvider } from '@mantine/core';
import { render, RenderOptions } from '@testing-library/react';

let mobileViewport = false;

// Call before render to make `useMediaQuery('(max-width: ...)')` queries match.
export function setMobileViewport(value: boolean) {
  mobileViewport = value;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function installDomPolyfills() {
  window.matchMedia = ((query: string) => ({
    matches: mobileViewport && query.includes('max-width'),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = ResizeObserverStub;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

export function renderWithMantine(ui: React.ReactElement, options?: RenderOptions) {
  installDomPolyfills();
  return render(<MantineProvider env="test">{ui}</MantineProvider>, options);
}
```

- [ ] **Step 4: Pre-register the new test files in the whitelist**

In `vitest.config.ts`, after the line containing `FlightLegsEditor.test.tsx`, add (use the edit tool, then verify):

```ts
      'client/src/__tests__/tripDates.test.ts', // Trip date range formatting
      'client/src/__tests__/flightRows.test.ts', // Flight row model
      'client/src/__tests__/swipe.test.ts', // Swipe helpers
      'client/src/__tests__/FlightsSection.test.tsx', // Flights table/cards
      'client/src/__tests__/ElementDialog.test.tsx', // Dialog tabs and swipe
```

Verify: `grep -n "tripDates\|flightRows\|swipe\|FlightsSection\|ElementDialog" vitest.config.ts` shows 5 lines.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc -p tsconfig.json --noEmit` — Expected: no output.

```bash
git add docs/superpowers/specs vitest.config.ts client/src/test-utils
git commit -m "chore: branch setup, spec amendments and Mantine test helper

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 1: Trip date formatting helpers

**Files:**
- Create: `client/src/utils/tripDates.ts`
- Test: `client/src/__tests__/tripDates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/__tests__/tripDates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatTripDateRange, nightsBetween, formatNights } from '../utils/tripDates';

describe('tripDates', () => {
  it('formats a same-year range', () => {
    expect(formatTripDateRange('2026-08-29', '2026-09-05')).toBe('Aug 29 – Sep 5, 2026');
  });

  it('includes both years when the range crosses a year', () => {
    expect(formatTripDateRange('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027');
  });

  it('returns an empty string when either date is missing or invalid', () => {
    expect(formatTripDateRange(undefined, '2026-09-05')).toBe('');
    expect(formatTripDateRange('2026-08-29', undefined)).toBe('');
    expect(formatTripDateRange('nope', '2026-09-05')).toBe('');
  });

  it('counts nights between dates', () => {
    expect(nightsBetween('2026-08-29', '2026-09-05')).toBe(7);
    expect(nightsBetween('2026-09-01', '2026-09-01')).toBe(0);
  });

  it('returns null nights for missing or reversed dates', () => {
    expect(nightsBetween(undefined, '2026-09-05')).toBeNull();
    expect(nightsBetween('2026-09-05', '2026-08-29')).toBeNull();
  });

  it('pluralizes nights', () => {
    expect(formatNights(1)).toBe('1 night');
    expect(formatNights(7)).toBe('7 nights');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client/src/__tests__/tripDates.test.ts`
Expected: FAIL (cannot resolve `../utils/tripDates`).

- [ ] **Step 3: Implement**

Create `client/src/utils/tripDates.ts`:

```ts
type YMD = [number, number, number];

function parseYMD(value?: string | null): YMD | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function monthDay([year, month, day]: YMD): string {
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatTripDateRange(start?: string | null, end?: string | null): string {
  const s = parseYMD(start);
  const e = parseYMD(end);
  if (!s || !e) return '';
  if (s[0] === e[0]) return `${monthDay(s)} – ${monthDay(e)}, ${e[0]}`;
  return `${monthDay(s)}, ${s[0]} – ${monthDay(e)}, ${e[0]}`;
}

export function nightsBetween(start?: string | null, end?: string | null): number | null {
  const s = parseYMD(start);
  const e = parseYMD(end);
  if (!s || !e) return null;
  const diff = Math.round((Date.UTC(e[0], e[1] - 1, e[2]) - Date.UTC(s[0], s[1] - 1, s[2])) / 86400000);
  return diff >= 0 ? diff : null;
}

export function formatNights(nights: number): string {
  return `${nights} night${nights === 1 ? '' : 's'}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run client/src/__tests__/tripDates.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/tripDates.ts client/src/__tests__/tripDates.test.ts
git commit -m "feat: add trip date range helpers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Flight row model

**Files:**
- Create: `client/src/utils/flightRows.ts`
- Test: `client/src/__tests__/flightRows.test.ts`

Interfaces defined here and used by later tasks: `FlightRow`, `FlightRowLeg`, `FlightTotals`, `buildFlightRows(elements, bookings)`, `flightTotals(elements, bookings)`, `formatClock`, `formatRowDate`, `formatPrice`.

- [ ] **Step 1: Write the failing test**

Create `client/src/__tests__/flightRows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Booking, FlightLeg, TripElement } from '../types/trip';
import { buildFlightRows, flightTotals, formatClock, formatPrice, formatRowDate } from '../utils/flightRows';

function leg(overrides: Partial<FlightLeg>): FlightLeg {
  return {
    id: 'leg',
    elementId: 'el',
    legOrder: 1,
    departureAirport: 'DEN',
    departureDatetime: '2026-08-29T09:00',
    arrivalAirport: 'SJD',
    arrivalDatetime: '2026-08-29T13:05',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as FlightLeg;
}

function flight(id: string, name: string, legs: FlightLeg[], extra: Partial<TripElement> = {}): TripElement {
  return {
    id,
    tripId: 't',
    elementType: 'flight',
    name,
    sortPosition: 0,
    createdAt: '',
    updatedAt: '',
    legs,
    ...extra,
  } as TripElement;
}

function booking(id: string, elementIds: string[], extra: Partial<Booking> = {}): Booking {
  return {
    id,
    tripId: 't',
    confirmationNumber: null,
    advertisedPriceCash: null,
    advertisedPricePoints: null,
    loyaltyProgram: null,
    notes: null,
    createdAt: '',
    updatedAt: '',
    elementIds,
    travelerIds: [],
    currentConfirmationNumber: null,
    actualTotalCash: 0,
    actualTotalPoints: 0,
    ...extra,
  };
}

describe('flightRows formatting', () => {
  it('formats clock times', () => {
    expect(formatClock('2026-08-29T00:05')).toBe('12:05 AM');
    expect(formatClock('2026-08-29T09:00')).toBe('9:00 AM');
    expect(formatClock('2026-08-29T12:30')).toBe('12:30 PM');
    expect(formatClock('2026-08-29T19:35')).toBe('7:35 PM');
    expect(formatClock(undefined)).toBe('');
  });

  it('formats the row date with weekday', () => {
    expect(formatRowDate('2026-08-29T09:00')).toBe('Sat 8/29');
    expect(formatRowDate('')).toBe('');
  });

  it('formats cash, points, and both', () => {
    expect(formatPrice(5.6, 9000)).toBe('9,000 pts + $5.60');
    expect(formatPrice(undefined, 5000)).toBe('5,000 pts');
    expect(formatPrice(137, null)).toBe('$137.00');
    expect(formatPrice(null, null)).toBe('');
  });
});

describe('buildFlightRows', () => {
  const outbound = flight('el-1', 'DEN → PHX → SJD', [
    leg({ id: 'l2', legOrder: 2, departureAirport: 'PHX', departureDatetime: '2026-08-29T11:20', arrivalAirport: 'SJD', arrivalDatetime: '2026-08-29T13:05', airline: 'WN', flightNumber: '310' }),
    leg({ id: 'l1', legOrder: 1, departureAirport: 'DEN', departureDatetime: '2026-08-29T09:00', arrivalAirport: 'PHX', arrivalDatetime: '2026-08-29T10:10', airline: 'WN', flightNumber: '722', layoverMinutesAfter: 70 }),
  ]);
  const inbound = flight('el-2', 'SJD → DEN', [
    leg({ id: 'l3', departureAirport: 'SJD', departureDatetime: '2026-09-05T19:35', arrivalAirport: 'DEN', arrivalDatetime: '2026-09-06T00:10', airline: 'WN', flightNumber: '692' }),
  ]);

  it('builds sorted rows with ordered legs, layovers and day offsets', () => {
    const rows = buildFlightRows([inbound, outbound], []);
    expect(rows.map(r => r.id)).toEqual(['el-1', 'el-2']);
    expect(rows[0].dateLabel).toBe('Sat 8/29');
    expect(rows[0].legs).toEqual([
      { id: 'l1', label: 'WN722', route: 'DEN → PHX', times: '9:00 AM → 10:10 AM', layoverAfter: '1h 10m' },
      { id: 'l2', label: 'WN310', route: 'PHX → SJD', times: '11:20 AM → 1:05 PM', layoverAfter: null },
    ]);
    expect(rows[1].legs[0].times).toBe('7:35 PM → 12:10 AM +1');
  });

  it('sorts flights without legs last and shows no date', () => {
    const empty = flight('el-3', 'Home', []);
    const rows = buildFlightRows([empty, outbound], []);
    expect(rows.map(r => r.id)).toEqual(['el-1', 'el-3']);
    expect(rows[1].dateLabel).toBe('');
    expect(rows[1].legs).toEqual([]);
  });

  it('ignores non-flight elements', () => {
    const hotel = flight('el-h', 'Hotel', [], { elementType: 'hotel' });
    expect(buildFlightRows([hotel, outbound], []).map(r => r.id)).toEqual(['el-1']);
  });

  it('uses linked bookings for price, confirmation, count and shared flag', () => {
    const roundTrip = booking('b1', ['el-1', 'el-2'], { currentConfirmationNumber: 'XYZ789', confirmationNumber: 'ABC123', advertisedPriceCash: 11.2, advertisedPricePoints: 14000 });
    const solo = booking('b2', ['el-1'], { confirmationNumber: 'QRS456' });
    const rows = buildFlightRows([outbound, inbound], [roundTrip, solo]);
    expect(rows[0].confirmation).toBe('XYZ789, QRS456');
    expect(rows[0].priceLabel).toBe('14,000 pts + $11.20');
    expect(rows[0].priceShared).toBe(true);
    expect(rows[0].bookingCount).toBe(2);
    expect(rows[1].confirmation).toBe('XYZ789');
    expect(rows[1].bookingCount).toBe(1);
  });

  it('does not show the deprecated element-level booking reference', () => {
    const legacy = flight('el-4', 'Legacy', [leg({})], { bookingReference: 'LEGACY-REF' });
    expect(buildFlightRows([legacy], [])[0].confirmation).toBe('');
  });
});

describe('flightTotals', () => {
  it('counts each booking once even when it links several flights', () => {
    const a = flight('el-1', 'A', []);
    const b = flight('el-2', 'B', []);
    const shared = booking('b1', ['el-1', 'el-2'], { advertisedPriceCash: 11.2, advertisedPricePoints: 14000 });
    const other = booking('b2', ['el-2'], { advertisedPriceCash: 100 });
    const unrelated = booking('b3', ['hotel-1'], { advertisedPriceCash: 999 });
    const totals = flightTotals([a, b], [shared, other, unrelated]);
    expect(totals.cash).toBeCloseTo(111.2);
    expect(totals.points).toBe(14000);
    expect(totals.label).toBe('14,000 pts + $111.20');
  });

  it('returns an empty label when nothing is priced', () => {
    expect(flightTotals([flight('el-1', 'A', [])], []).label).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client/src/__tests__/flightRows.test.ts`
Expected: FAIL (cannot resolve `../utils/flightRows`).

- [ ] **Step 3: Implement**

Create `client/src/utils/flightRows.ts`:

```ts
import { Booking, TripElement } from '../types/trip';
import { formatLayover } from './flightLegs';
import { formatMoney } from './money';

export interface FlightRowLeg {
  id: string;
  label: string;
  route: string;
  times: string;
  layoverAfter: string | null;
}

export interface FlightRow {
  id: string;
  name: string;
  dateLabel: string;
  priceLabel: string;
  priceShared: boolean;
  confirmation: string;
  bookingCount: number;
  legs: FlightRowLeg[];
  sortKey: string;
}

export interface FlightTotals {
  cash: number;
  points: number;
  label: string;
}

const DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

// Stored times are airport-local wall-clock values, so no timezone conversion happens here.
export function formatClock(value?: string | null): string {
  const match = value?.match(DATETIME);
  if (!match) return '';
  const hour = Number(match[4]);
  return `${hour % 12 || 12}:${match[5]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function formatRowDate(value?: string | null): string {
  const match = value?.match(DATETIME);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${Number(match[2])}/${Number(match[3])}`;
}

function dayOffset(from?: string | null, to?: string | null): number {
  const a = from?.match(DATETIME);
  const b = to?.match(DATETIME);
  if (!a || !b) return 0;
  const diff = Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3]);
  return Math.round(diff / 86400000);
}

export function formatPrice(cash?: number | null, points?: number | null): string {
  const parts: string[] = [];
  if (points) parts.push(`${points.toLocaleString('en-US')} pts`);
  if (cash) parts.push(formatMoney(cash));
  return parts.join(' + ');
}

function legTimes(departure?: string, arrival?: string): string {
  const from = formatClock(departure);
  const to = formatClock(arrival);
  if (!from && !to) return '';
  const offset = dayOffset(departure, arrival);
  return `${from} → ${to}${offset > 0 ? ` +${offset}` : ''}`;
}

export function buildFlightRows(elements: TripElement[], bookings: Booking[]): FlightRow[] {
  return elements
    .filter(element => element.elementType === 'flight')
    .map(element => {
      const linked = bookings.filter(b => b.elementIds.includes(element.id));
      const legs = [...(element.legs ?? [])].sort((a, b) => a.legOrder - b.legOrder);
      const first = legs[0];
      const prices = linked
        .map(b => formatPrice(b.advertisedPriceCash, b.advertisedPricePoints))
        .filter(Boolean);
      const confirmations = linked
        .map(b => b.currentConfirmationNumber ?? b.confirmationNumber)
        .filter((c): c is string => Boolean(c));

      return {
        id: element.id,
        name: element.name,
        dateLabel: formatRowDate(first?.departureDatetime),
        priceLabel: prices.join(' · '),
        priceShared: linked.some(b => b.elementIds.length > 1),
        confirmation: confirmations.join(', '),
        bookingCount: linked.length,
        legs: legs.map((leg, index) => ({
          id: leg.id,
          label: `${leg.airline ?? ''}${leg.flightNumber ?? ''}`,
          route: `${leg.departureAirport || '—'} → ${leg.arrivalAirport || '—'}`,
          times: legTimes(leg.departureDatetime, leg.arrivalDatetime),
          layoverAfter:
            index < legs.length - 1 && leg.layoverMinutesAfter != null
              ? formatLayover(leg.layoverMinutesAfter)
              : null,
        })),
        sortKey: first?.departureDatetime ?? '9999',
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function flightTotals(elements: TripElement[], bookings: Booking[]): FlightTotals {
  const flightIds = new Set(elements.filter(e => e.elementType === 'flight').map(e => e.id));
  let cash = 0;
  let points = 0;
  for (const booking of bookings) {
    if (!booking.elementIds.some(id => flightIds.has(id))) continue;
    cash += booking.advertisedPriceCash ?? 0;
    points += booking.advertisedPricePoints ?? 0;
  }
  return { cash, points, label: formatPrice(cash, points) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run client/src/__tests__/flightRows.test.ts`
Expected: all passed. If `layoverMinutesAfter` is not on the `FlightLeg` type, `npx tsc` will say so — the field exists (the old page read `leg.layoverMinutesAfter`).

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/flightRows.ts client/src/__tests__/flightRows.test.ts
git commit -m "feat: add flight row model helpers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Swipe helpers

**Files:**
- Create: `client/src/utils/swipe.ts`
- Test: `client/src/__tests__/swipe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/__tests__/swipe.test.ts`:

```ts
/* @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { getSwipeDirection, isSwipeBlocked } from '../utils/swipe';

describe('getSwipeDirection', () => {
  it('detects a left swipe (finger moves left)', () => {
    expect(getSwipeDirection({ x: 200, y: 100 }, { x: 100, y: 110 })).toBe('left');
  });

  it('detects a right swipe', () => {
    expect(getSwipeDirection({ x: 100, y: 100 }, { x: 200, y: 90 })).toBe('right');
  });

  it('ignores short movements', () => {
    expect(getSwipeDirection({ x: 100, y: 100 }, { x: 130, y: 100 })).toBeNull();
  });

  it('ignores mostly vertical movements', () => {
    expect(getSwipeDirection({ x: 100, y: 100 }, { x: 160, y: 260 })).toBeNull();
  });
});

describe('isSwipeBlocked', () => {
  function tree() {
    const boundary = document.createElement('div');
    const wrapper = document.createElement('div');
    const input = document.createElement('input');
    const text = document.createElement('span');
    const guarded = document.createElement('div');
    const guardedChild = document.createElement('span');
    guarded.setAttribute('data-no-swipe', '');
    guarded.appendChild(guardedChild);
    wrapper.append(input, text, guarded);
    boundary.appendChild(wrapper);
    document.body.appendChild(boundary);
    return { boundary, input, text, guardedChild, wrapper };
  }

  it('blocks swipes that start in form controls', () => {
    const { boundary, input } = tree();
    expect(isSwipeBlocked(input, boundary)).toBe(true);
  });

  it('blocks swipes inside data-no-swipe regions', () => {
    const { boundary, guardedChild } = tree();
    expect(isSwipeBlocked(guardedChild, boundary)).toBe(true);
  });

  it('blocks swipes inside horizontally scrollable regions', () => {
    const { boundary, text, wrapper } = tree();
    wrapper.style.overflowX = 'auto';
    Object.defineProperty(wrapper, 'scrollWidth', { value: 500, configurable: true });
    Object.defineProperty(wrapper, 'clientWidth', { value: 200, configurable: true });
    expect(isSwipeBlocked(text, boundary)).toBe(true);
  });

  it('allows swipes on plain content', () => {
    const { boundary, text } = tree();
    expect(isSwipeBlocked(text, boundary)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client/src/__tests__/swipe.test.ts`
Expected: FAIL (cannot resolve `../utils/swipe`).

- [ ] **Step 3: Implement**

Create `client/src/utils/swipe.ts`:

```ts
export const SWIPE_MIN_DISTANCE = 50;
const HORIZONTAL_DOMINANCE = 1.5;

export type SwipeDirection = 'left' | 'right';

export function getSwipeDirection(
  start: { x: number; y: number },
  end: { x: number; y: number }
): SwipeDirection | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return null;
  if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_DOMINANCE) return null;
  return dx < 0 ? 'left' : 'right';
}

const INTERACTIVE = 'input, textarea, select, [data-no-swipe]';

// A swipe must not hijack typing, text selection, or horizontally scrollable regions.
export function isSwipeBlocked(target: EventTarget | null, boundary: HTMLElement | null): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el) {
    if (el.matches(INTERACTIVE)) return true;
    const overflowX = getComputedStyle(el).overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return true;
    if (el === boundary) break;
    el = el.parentElement;
  }
  return false;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run client/src/__tests__/swipe.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/swipe.ts client/src/__tests__/swipe.test.ts
git commit -m "feat: add swipe detection helpers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: FlightsSection (table that reflows to cards)

**Files:**
- Create: `client/src/components/FlightsSection.tsx`
- Create: `client/src/components/FlightsSection.module.css`
- Test: `client/src/__tests__/FlightsSection.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/__tests__/FlightsSection.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { FlightsSection } from '../components/FlightsSection';
import { FlightRow } from '../utils/flightRows';

const rows: FlightRow[] = [
  {
    id: 'el-1',
    name: 'DEN → SJD',
    dateLabel: 'Sat 8/29',
    priceLabel: '9,000 pts + $5.60',
    priceShared: true,
    confirmation: 'ABC123',
    bookingCount: 2,
    sortKey: '2026-08-29T09:00',
    legs: [
      { id: 'l1', label: 'WN722', route: 'DEN → PHX', times: '9:00 AM → 10:10 AM', layoverAfter: '1h 10m' },
      { id: 'l2', label: 'WN310', route: 'PHX → SJD', times: '11:20 AM → 1:05 PM', layoverAfter: null },
    ],
  },
  {
    id: 'el-2',
    name: 'Home',
    dateLabel: '',
    priceLabel: '',
    priceShared: false,
    confirmation: '',
    bookingCount: 0,
    sortKey: '9999',
    legs: [],
  },
];

describe('FlightsSection', () => {
  afterEach(() => cleanup());

  it('shows the count, total, rows and indented legs with layovers', () => {
    renderWithMantine(<FlightsSection rows={rows} totalLabel="9,000 pts + $5.60" onOpen={() => {}} />);

    expect(screen.getByText(/flights \(2\)/i)).toBeTruthy();
    expect(screen.getByText(/total 9,000 pts \+ \$5\.60/i)).toBeTruthy();
    expect(screen.getByText('DEN → SJD')).toBeTruthy();
    expect(screen.getByText('Sat 8/29')).toBeTruthy();
    expect(screen.getByText('ABC123')).toBeTruthy();
    expect(screen.getByText(/WN722 DEN → PHX/)).toBeTruthy();
    expect(screen.getByText('9:00 AM → 10:10 AM')).toBeTruthy();
    expect(screen.getByText(/1h 10m layover/i)).toBeTruthy();
    expect(screen.getByText(/shared/i)).toBeTruthy();
    expect(screen.getByText(/2 bookings/i)).toBeTruthy();
  });

  it('shows a muted note for flights without legs', () => {
    renderWithMantine(<FlightsSection rows={rows} totalLabel="" onOpen={() => {}} />);
    expect(screen.getByText(/no legs yet/i)).toBeTruthy();
    expect(screen.queryByText(/^total/i)).toBeNull();
  });

  it('opens a flight on click and on Enter/Space', () => {
    const onOpen = vi.fn();
    renderWithMantine(<FlightsSection rows={rows} totalLabel="" onOpen={onOpen} />);

    const rowButton = screen.getByRole('button', { name: /open DEN → SJD/i });
    fireEvent.click(rowButton);
    expect(onOpen).toHaveBeenLastCalledWith('el-1');

    const second = screen.getByRole('button', { name: /open Home/i });
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(onOpen).toHaveBeenLastCalledWith('el-2');
    fireEvent.keyDown(rowButton, { key: ' ' });
    expect(onOpen).toHaveBeenLastCalledWith('el-1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client/src/__tests__/FlightsSection.test.tsx`
Expected: FAIL (cannot resolve `../components/FlightsSection`).

- [ ] **Step 3: Implement the component**

Create `client/src/components/FlightsSection.tsx`:

```tsx
import { KeyboardEvent } from 'react';
import { Badge, Text } from '@mantine/core';
import { IconPlane } from '@tabler/icons-react';
import { FlightRow } from '../utils/flightRows';
import classes from './FlightsSection.module.css';

interface FlightsSectionProps {
  rows: FlightRow[];
  totalLabel: string;
  onOpen: (elementId: string) => void;
}

export function FlightsSection({ rows, totalLabel, onOpen }: FlightsSectionProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(id);
    }
  };

  return (
    <section aria-label="Flights" className={classes.section}>
      <div className={classes.band}>
        <Text fw={700} className={classes.bandTitle}>
          <IconPlane size={16} aria-hidden /> Flights ({rows.length})
        </Text>
        {totalLabel && (
          <Text size="sm" c="dimmed">
            Total {totalLabel}
          </Text>
        )}
      </div>

      <div className={`${classes.grid} ${classes.columns}`} aria-hidden>
        <span className={classes.name}>Flight</span>
        <span className={classes.date}>Date</span>
        <span className={classes.times}>Depart → Arrive</span>
        <span className={classes.price}>Price</span>
        <span className={classes.confirm}>Confirm #</span>
      </div>

      {rows.map((row, index) => (
        <div
          key={row.id}
          className={`${classes.grid} ${classes.row}`}
          data-tone={index % 2 === 0 ? 'a' : 'b'}
          role="button"
          tabIndex={0}
          aria-label={`Open ${row.name}`}
          onClick={() => onOpen(row.id)}
          onKeyDown={event => handleKeyDown(event, row.id)}
        >
          <span className={`${classes.name} ${classes.strong}`}>{row.name}</span>
          <span className={classes.date}>{row.dateLabel}</span>
          <span className={classes.price}>
            {row.priceLabel}
            {row.priceLabel && row.priceShared && <span className={classes.muted}> (shared)</span>}
          </span>
          <span className={classes.confirm}>{row.confirmation}</span>
          <span className={classes.badges}>
            {row.bookingCount > 0 && (
              <Badge size="sm" variant="light" tt="none">
                {row.bookingCount} {row.bookingCount === 1 ? 'booking' : 'bookings'}
              </Badge>
            )}
          </span>

          {row.legs.length === 0 && <span className={`${classes.note} ${classes.muted}`}>No legs yet</span>}

          {row.legs.map(leg => (
            <LegLines key={leg.id} leg={leg} />
          ))}
        </div>
      ))}
    </section>
  );
}

function LegLines({ leg }: { leg: FlightRow['legs'][number] }) {
  return (
    <>
      <span className={classes.legLabel}>{`${leg.label} ${leg.route}`.trim()}</span>
      <span className={classes.legTimes}>{leg.times}</span>
      {leg.layoverAfter && <span className={`${classes.note} ${classes.muted}`}>⏱ {leg.layoverAfter} layover</span>}
    </>
  );
}
```

- [ ] **Step 4: Implement the styles**

Create `client/src/components/FlightsSection.module.css`:

```css
.section {
  margin-top: var(--mantine-spacing-md);
  border: 1px solid var(--mantine-color-default-border);
  border-radius: var(--mantine-radius-sm);
  overflow: hidden;
}

.band {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--mantine-spacing-sm);
  padding: 6px 10px;
  background: var(--mantine-color-default-hover);
}

.bandTitle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) 0.8fr minmax(0, 1.5fr) minmax(0, 1.4fr) minmax(0, 1fr) auto;
  column-gap: var(--mantine-spacing-sm);
  align-items: baseline;
  padding: 4px 10px;
}

.columns {
  font-size: var(--mantine-font-size-xs);
  color: var(--mantine-color-dimmed);
  border-bottom: 1px solid var(--mantine-color-default-border);
}

.row {
  cursor: pointer;
  font-size: var(--mantine-font-size-sm);
  padding-top: 6px;
  padding-bottom: 6px;
}

.row[data-tone='a'] {
  background: var(--mantine-color-green-light);
}

.row[data-tone='b'] {
  background: var(--mantine-color-blue-light);
}

.row:hover {
  filter: brightness(0.96);
}

.row:focus-visible {
  outline: 2px solid var(--mantine-color-blue-filled);
  outline-offset: -2px;
}

.name {
  grid-column: 1;
}

.date {
  grid-column: 2;
}

.times {
  grid-column: 3;
}

.price {
  grid-column: 4;
}

.confirm {
  grid-column: 5;
}

.badges {
  grid-column: 6;
}

.strong {
  font-weight: 700;
}

.muted {
  color: var(--mantine-color-dimmed);
}

.legLabel {
  grid-column: 1;
  padding-left: 1.25rem;
}

.legTimes {
  grid-column: 3;
}

.note {
  grid-column: 1 / -1;
  padding-left: 1.25rem;
  font-size: var(--mantine-font-size-xs);
}

@media (max-width: 48em) {
  .grid {
    grid-template-columns: 1fr auto;
  }

  .columns {
    display: none;
  }

  .name,
  .price,
  .legLabel {
    grid-column: 1;
  }

  .date,
  .confirm {
    grid-column: 2;
    text-align: right;
  }

  .badges,
  .legTimes {
    grid-column: 1 / -1;
  }

  .legTimes {
    padding-left: 1.25rem;
    color: var(--mantine-color-dimmed);
  }
}
```

- [ ] **Step 5: Run to verify it passes, then commit**

Run: `npx vitest run client/src/__tests__/FlightsSection.test.tsx` — Expected: 3 passed.
Run: `npx tsc -p tsconfig.json --noEmit` — Expected: no output (if `*.module.css` imports are flagged as untyped, check `client/src/vite-env.d.ts` contains `/// <reference types="vite/client" />`; add it if missing).

```bash
git add client/src/components/FlightsSection.tsx client/src/components/FlightsSection.module.css client/src/__tests__/FlightsSection.test.tsx
git commit -m "feat: add compact FlightsSection with mobile reflow

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: ElementDialog (generic modal with swipeable tabs)

**Files:**
- Create: `client/src/components/ElementDialog.tsx`
- Test: `client/src/__tests__/ElementDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/__tests__/ElementDialog.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { ElementDialog, ElementDialogTab } from '../components/ElementDialog';

const tabs: ElementDialogTab[] = [
  { value: 'details', label: 'Details', content: <div>Details body <input aria-label="notes" /></div> },
  { value: 'bookings', label: 'Bookings', count: 2, content: <div>Bookings body</div> },
  { value: 'seats', label: 'Seats', content: <div>Seats body</div> },
];

function swipe(target: Element, from: number, to: number, y = 100) {
  fireEvent.touchStart(target, { touches: [{ clientX: from, clientY: y }] });
  fireEvent.touchEnd(target, { changedTouches: [{ clientX: to, clientY: y }] });
}

function renderDialog(props: Partial<React.ComponentProps<typeof ElementDialog>> = {}) {
  return renderWithMantine(<ElementDialog opened onClose={() => {}} title="DEN → SJD" tabs={tabs} {...props} />);
}

describe('ElementDialog', () => {
  afterEach(() => cleanup());

  it('shows the title and the first tab, with a count badge on tabs that have one', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('DEN → SJD')).toBeTruthy();
    expect(screen.getByText(/details body/i)).toBeTruthy();
    expect(screen.queryByText(/bookings body/i)).toBeNull();
    expect(screen.getByRole('tab', { name: /bookings/i }).textContent).toContain('2');
  });

  it('switches tabs on click and mounts only the active tab', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: /seats/i }));
    expect(screen.getByText(/seats body/i)).toBeTruthy();
    expect(screen.queryByText(/details body/i)).toBeNull();
  });

  it('moves to the next tab on a left swipe and the previous on a right swipe', () => {
    renderDialog();
    const body = screen.getByText(/details body/i).parentElement as HTMLElement;
    swipe(body, 250, 100);
    expect(screen.getByText(/bookings body/i)).toBeTruthy();

    swipe(screen.getByText(/bookings body/i), 100, 250);
    expect(screen.getByText(/details body/i)).toBeTruthy();
  });

  it('does not go past the first or last tab', () => {
    renderDialog();
    swipe(screen.getByText(/details body/i).parentElement as HTMLElement, 100, 250);
    expect(screen.getByText(/details body/i)).toBeTruthy();
  });

  it('ignores swipes that start in an input', () => {
    renderDialog();
    swipe(screen.getByLabelText('notes'), 250, 100);
    expect(screen.getByText(/details body/i)).toBeTruthy();
  });

  it('ignores swipes when swiping is disabled', () => {
    renderDialog({ swipeEnabled: false });
    swipe(screen.getByText(/details body/i).parentElement as HTMLElement, 250, 100);
    expect(screen.getByText(/details body/i)).toBeTruthy();
    expect(screen.queryByText(/bookings body/i)).toBeNull();
  });

  it('ignores mostly vertical movements', () => {
    renderDialog();
    const body = screen.getByText(/details body/i).parentElement as HTMLElement;
    fireEvent.touchStart(body, { touches: [{ clientX: 100, clientY: 50 }] });
    fireEvent.touchEnd(body, { changedTouches: [{ clientX: 40, clientY: 300 }] });
    expect(screen.getByText(/details body/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client/src/__tests__/ElementDialog.test.tsx`
Expected: FAIL (cannot resolve `../components/ElementDialog`).

- [ ] **Step 3: Implement**

Create `client/src/components/ElementDialog.tsx`:

```tsx
import { ReactNode, TouchEvent, useRef, useState } from 'react';
import { Badge, Modal, Tabs } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { getSwipeDirection, isSwipeBlocked } from '../utils/swipe';

export interface ElementDialogTab {
  value: string;
  label: string;
  count?: number;
  content: ReactNode;
}

interface ElementDialogProps {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  tabs: ElementDialogTab[];
  swipeEnabled?: boolean;
}

export function ElementDialog({ opened, onClose, title, tabs, swipeEnabled = true }: ElementDialogProps) {
  const isMobile = Boolean(useMediaQuery('(max-width: 48em)'));
  const [active, setActive] = useState(tabs[0]?.value ?? '');
  const bodyRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current =
      swipeEnabled && touch && !isSwipeBlocked(event.target, bodyRef.current)
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;

    const direction = getSwipeDirection(start, { x: touch.clientX, y: touch.clientY });
    if (!direction) return;

    const index = tabs.findIndex(tab => tab.value === active);
    const next = tabs[index + (direction === 'left' ? 1 : -1)];
    if (next) setActive(next.value);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg" fullScreen={isMobile} centered={!isMobile}>
      <Tabs value={active} onChange={value => value && setActive(value)} keepMounted={false}>
        <Tabs.List grow>
          {tabs.map(tab => (
            <Tabs.Tab
              key={tab.value}
              value={tab.value}
              rightSection={tab.count ? <Badge size="xs" circle>{tab.count}</Badge> : undefined}
            >
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <div ref={bodyRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ touchAction: 'pan-y' }}>
          {tabs.map(tab => (
            <Tabs.Panel key={tab.value} value={tab.value} pt="md">
              {tab.content}
            </Tabs.Panel>
          ))}
        </div>
      </Tabs>
    </Modal>
  );
}
```

The page mounts this component only while a flight is selected, so tab state resets to the first tab on every open; no reset effect is needed.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run client/src/__tests__/ElementDialog.test.tsx`
Expected: 7 passed. If the swipe tests fail because `fireEvent.touchStart` does not populate `touches`, pass a real list: `{ touches: [{ clientX: from, clientY: y }] as unknown as TouchList }`.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ElementDialog.tsx client/src/__tests__/ElementDialog.test.tsx
git commit -m "feat: add generic ElementDialog with swipeable tabs

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 6: FlightDetailsTab and FlightSeatsTab

These two are exercised through the page tests in Task 9 (they need the mocked `tripApi`), so this task has no separate test file; Task 9 is where the red/green loop happens for them. Write them now so Task 9 can assemble.

**Files:**
- Create: `client/src/components/FlightDetailsTab.tsx`
- Create: `client/src/components/FlightSeatsTab.tsx`

- [ ] **Step 1: Create `FlightSeatsTab.tsx`**

```tsx
import { Text } from '@mantine/core';
import { TripElement, TripParticipant } from '../types/trip';
import { FlightSeatGrid } from './FlightSeatGrid';
import { formatLegTime } from '../utils/flightLegs';

interface FlightSeatsTabProps {
  tripId: string;
  element: TripElement;
  travelers: TripParticipant[];
}

export function FlightSeatsTab({ tripId, element, travelers }: FlightSeatsTabProps) {
  const legs = element.legs ?? [];
  if (legs.length === 0) {
    return <Text c="dimmed">Add legs to this flight to assign seats.</Text>;
  }

  return (
    <div>
      {legs.map(leg => (
        <div key={leg.id} style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
          <Text fw={600} size="sm">
            {leg.departureAirport || '—'} → {leg.arrivalAirport || '—'}
            {leg.departureDatetime ? ` · ${formatLegTime(leg.departureDatetime)}` : ''}
          </Text>
          <FlightSeatGrid tripId={tripId} legId={leg.id} travelers={travelers} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `FlightDetailsTab.tsx`**

Read-only view by default; `Edit` switches to the edit form (reusing `FlightLegsEditor` and the `create-element-field` markup from `trips.css`).

```tsx
import { useEffect, useState } from 'react';
import { Alert, Anchor, Button, Group, Text } from '@mantine/core';
import { TripElement } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { FlightLegsEditor } from './FlightLegsEditor';
import {
  FlightLegDraft,
  draftHasDate,
  draftToPayload,
  emptyLegDraft,
  formatLayover,
  formatLegTime,
  legToDraft,
} from '../utils/flightLegs';

interface FlightDetailsTabProps {
  tripId: string;
  element: TripElement;
  onChanged: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
}

export function FlightDetailsTab({ tripId, element, onChanged, onDeleted, onEditingChange }: FlightDetailsTabProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(element.name);
  const [notes, setNotes] = useState(element.notes ?? '');
  const [legs, setLegs] = useState<FlightLegDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Swipe between tabs must stay off while a form is open; also reset when this tab unmounts.
  useEffect(() => {
    onEditingChange(editing);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onEditingChange(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const startEditing = () => {
    setName(element.name);
    setNotes(element.notes ?? '');
    setLegs(element.legs?.length ? element.legs.map(legToDraft) : [emptyLegDraft()]);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Element name is required');
      return;
    }
    if (!legs.every(draftHasDate)) {
      setError('Each flight needs a flight date or departure time');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await tripApi.updateElement(tripId, element.id, { name: name.trim(), notes: notes.trim() || undefined });
      await tripApi.syncLegs(tripId, element.id, legs.map(draftToPayload));
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save element');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      setError(null);
      await tripApi.deleteElement(tripId, element.id);
      await onDeleted();
    } catch (err) {
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : 'Failed to delete element');
    }
  };

  if (editing) {
    return (
      <div>
        {error && <Alert color="red" mb="sm">{error}</Alert>}
        <div className="create-element-field">
          <label htmlFor={`edit-name-${element.id}`}>Name</label>
          <input id={`edit-name-${element.id}`} type="text" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <FlightLegsEditor tripId={tripId} legs={legs} onChange={setLegs} idPrefix={`edit-leg-${element.id}`} />
        <div className="create-element-field">
          <label htmlFor={`edit-notes-${element.id}`}>Notes</label>
          <input id={`edit-notes-${element.id}`} type="text" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <Group mt="sm">
          <Button onClick={save} loading={saving}>Save changes</Button>
          <Button variant="default" onClick={() => setEditing(false)}>Cancel</Button>
        </Group>
      </div>
    );
  }

  const legList = element.legs ?? [];
  return (
    <div>
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      {legList.length === 0 && <Text c="dimmed">No legs yet — use Edit to add them.</Text>}
      {legList.map((leg, index) => (
        <div key={leg.id} style={{ marginBottom: 'var(--mantine-spacing-xs)' }}>
          <Text fw={600}>
            {leg.departureAirport || '—'} → {leg.arrivalAirport || '—'}{' '}
            <Text span c="dimmed" fw={400}>
              {[leg.airline, leg.flightNumber].filter(Boolean).join(' ')}
              {leg.departureDatetime ? ` · ${formatLegTime(leg.departureDatetime)}` : ''}
              {leg.arrivalDatetime ? ` → ${formatLegTime(leg.arrivalDatetime)}` : ''}
            </Text>
          </Text>
          {leg.checkPriceUrl && (
            <Anchor href={leg.checkPriceUrl} target="_blank" rel="noreferrer" size="sm">Check price</Anchor>
          )}
          {index < legList.length - 1 && leg.layoverMinutesAfter != null && (
            <Text size="sm" c="dimmed">Layover: {formatLayover(leg.layoverMinutesAfter)}</Text>
          )}
        </div>
      ))}
      {element.notes && <Text mt="sm">{element.notes}</Text>}

      <Group mt="md">
        <Button variant="light" onClick={startEditing}>Edit</Button>
        {confirmingDelete ? (
          <>
            <Text size="sm">Delete this flight?</Text>
            <Button color="red" size="xs" onClick={remove}>Confirm</Button>
            <Button variant="default" size="xs" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          </>
        ) : (
          <Button variant="subtle" color="red" onClick={() => setConfirmingDelete(true)}>Delete</Button>
        )}
      </Group>
    </div>
  );
}
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc -p tsconfig.json --noEmit` — Expected: no output.

```bash
git add client/src/components/FlightDetailsTab.tsx client/src/components/FlightSeatsTab.tsx
git commit -m "feat: add flight details and seats dialog tabs

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: AddElementDialog

Moves the create-flight form (name auto-generation, legs payload) into a modal.

**Files:**
- Create: `client/src/components/AddElementDialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { tripApi } from '../api/tripApi';
import { FlightLegsEditor } from './FlightLegsEditor';
import { FlightLegDraft, buildFlightName, draftHasDate, draftToPayload, emptyLegDraft } from '../utils/flightLegs';

interface AddElementDialogProps {
  tripId: string;
  opened: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

export function AddElementDialog({ tripId, opened, onClose, onCreated }: AddElementDialogProps) {
  const isMobile = Boolean(useMediaQuery('(max-width: 48em)'));
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [legs, setLegs] = useState<FlightLegDraft[]>([emptyLegDraft()]);
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (nameManuallyEdited) return;
    const generated = buildFlightName(legs);
    if (generated) setName(generated);
  }, [legs, nameManuallyEdited]);

  const reset = () => {
    setName('');
    setNotes('');
    setLegs([emptyLegDraft()]);
    setNameManuallyEdited(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Element name is required');
      return;
    }
    if (!legs.every(draftHasDate)) {
      setError('Each flight needs a flight date or departure time');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await tripApi.createElement(tripId, {
        elementType: 'flight',
        name: name.trim(),
        notes: notes.trim() || undefined,
        typeSpecificData: {
          legs: legs.map((draft, index) => ({ ...draftToPayload(draft), legOrder: index + 1 })),
        },
      });
      reset();
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add element');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Add flight" size="lg" fullScreen={isMobile}>
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      <div className="create-element-field">
        <label htmlFor="element-name">Name</label>
        <input
          id="element-name"
          type="text"
          value={name}
          onChange={e => {
            setName(e.target.value);
            setNameManuallyEdited(true);
          }}
          placeholder="e.g. Southwest Flight 1234"
        />
      </div>
      <div className="create-element-field">
        <label htmlFor="element-notes">Notes</label>
        <input id="element-notes" type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
      </div>
      <FlightLegsEditor tripId={tripId} legs={legs} onChange={setLegs} idPrefix="new-leg" />
      <Text size="sm" c="dimmed" mt="xs">
        Confirmation number, pricing, and travelers are entered per booking after saving this flight.
      </Text>
      <Group mt="md" justify="flex-end">
        <Button variant="default" onClick={handleClose}>Cancel</Button>
        <Button onClick={save} loading={saving}>Save flight</Button>
      </Group>
    </Modal>
  );
}
```

- [ ] **Step 2: Type-check and commit**

Run: `npx tsc -p tsconfig.json --noEmit` — Expected: no output. If `typeSpecificData.legs` is rejected, check `createElement`'s parameter type in `client/src/api/tripApi.ts` (it takes `Partial<TripElement> & { typeSpecificData?: Record<string, unknown> }`); inline literals are fine.

```bash
git add client/src/components/AddElementDialog.tsx
git commit -m "feat: add AddElementDialog for creating flights

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: TripHeader and TripTravelersStrip

**Files:**
- Create: `client/src/components/TripHeader.tsx`
- Create: `client/src/components/TripHeader.module.css`
- Create: `client/src/components/TripTravelersStrip.tsx`

- [ ] **Step 1: Create `TripHeader.module.css`**

```css
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mantine-spacing-sm);
  flex-wrap: wrap;
}

.meta {
  display: flex;
  align-items: center;
  gap: var(--mantine-spacing-xs);
  flex-wrap: wrap;
}

@media (max-width: 48em) {
  .add {
    position: fixed;
    right: var(--mantine-spacing-md);
    bottom: var(--mantine-spacing-md);
    z-index: 100;
    box-shadow: var(--mantine-shadow-md);
    border-radius: 999px;
  }
}
```

- [ ] **Step 2: Create `TripHeader.tsx`**

```tsx
import { Badge, Button, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { Trip } from '../types/trip';
import { formatNights, formatTripDateRange, nightsBetween } from '../utils/tripDates';
import classes from './TripHeader.module.css';

interface TripHeaderProps {
  trip: Trip;
  onAdd: () => void;
  addLabel?: string;
}

export function TripHeader({ trip, onAdd, addLabel = 'Add flight' }: TripHeaderProps) {
  const range = formatTripDateRange(trip.startDate, trip.endDate);
  const nights = nightsBetween(trip.startDate, trip.endDate);

  return (
    <div className={classes.header}>
      <div>
        <div className={classes.meta}>
          <Title order={2}>{trip.name}</Title>
          {trip.tripType && <Badge variant="light">{trip.tripType}</Badge>}
        </div>
        {(range || trip.description) && (
          <Text size="sm" c="dimmed">
            {range}
            {range && nights !== null ? ` · ${formatNights(nights)}` : ''}
            {range && trip.description ? ' · ' : ''}
            {trip.description}
          </Text>
        )}
      </div>
      <Button className={classes.add} leftSection={<IconPlus size={16} />} onClick={onAdd}>
        {addLabel}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create `TripTravelersStrip.tsx`**

```tsx
import { useState } from 'react';
import { Badge, Button, Group, Modal, Text } from '@mantine/core';
import { TripParticipant } from '../types/trip';
import { TripParticipantsPanel } from './TripParticipantsPanel';

const VISIBLE_CHIPS = 3;

interface TripTravelersStripProps {
  tripId: string;
  participants: TripParticipant[];
  refreshKey: number;
  onParticipantsChanged: (participants: TripParticipant[]) => void;
}

export function TripTravelersStrip({ tripId, participants, refreshKey, onParticipantsChanged }: TripTravelersStripProps) {
  const [managing, setManaging] = useState(false);
  const shown = participants.slice(0, VISIBLE_CHIPS);
  const extra = participants.length - shown.length;

  return (
    <>
      <Group gap="xs" mt="xs" wrap="wrap">
        <Text size="sm" fw={600}>Travelers</Text>
        {participants.length === 0 && <Text size="sm" c="dimmed">None yet</Text>}
        {shown.map(p => (
          <Badge key={p.id} variant="outline" tt="none">{p.displayName}</Badge>
        ))}
        {extra > 0 && <Badge variant="light" tt="none">+{extra}</Badge>}
        <Button size="compact-xs" variant="subtle" onClick={() => setManaging(true)}>Manage</Button>
      </Group>

      <Modal opened={managing} onClose={() => setManaging(false)} title="Manage travelers" size="lg">
        <TripParticipantsPanel tripId={tripId} refreshKey={refreshKey} onParticipantsChanged={onParticipantsChanged} />
      </Modal>
    </>
  );
}
```

Before committing, check how the old page/`TripParticipantsPanel` names a participant: run `grep -n "displayName\|name" client/src/types/trip.ts | head` and `grep -n "participant\." client/src/components/TripParticipantsPanel.tsx | head`. If the field is not `displayName`, use the real field in the chip (and keep the same field in the Task 9 test).

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc -p tsconfig.json --noEmit` — Expected: no output.

```bash
git add client/src/components/TripHeader.tsx client/src/components/TripHeader.module.css client/src/components/TripTravelersStrip.tsx
git commit -m "feat: add compact trip header and travelers strip

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Assemble TripDetailPage and rewrite its tests

**Files:**
- Rewrite: `client/src/pages/TripDetailPage.tsx`
- Rewrite: `client/src/__tests__/TripDetailPage.test.tsx`

- [ ] **Step 1: Read the existing test for mocking conventions**

Run: `sed -n 1,80p client/src/__tests__/TripDetailPage.test.tsx`
Note how `tripApi` and the child components (`TripParticipantsPanel`, `BookingCard`, `FlightSeatGrid`, `FlightLegsEditor`, `useParams`) are mocked; the rewritten test keeps those same mocks for the child components that are not under test, but renders with `renderWithMantine` and does **not** mock Mantine. Keep every scenario listed in Step 2, porting the exact payload expectations (`T15:10` / `T18:05` for the lookup autofill, `legOrder` 1 and 2 for two-leg create, `syncLegs` called with the edited legs) from the old file. Delete the old Mantine mock if present.

- [ ] **Step 2: Write the failing tests**

Replace the test file. Scenarios (each as its own `it`, using the old file's fixtures and mock style):

1. **Renders compact page** — trip name, type badge, `Aug 29 – Sep 5, 2026 · 7 nights`, traveler chips (3 shown + `+1` for four participants), a Flights section with row names and the booking confirmation (`listBookings` mocked to return one booking linked to a flight).
2. **Empty state** — no elements: shows a button named `Add your first flight`.
3. **No-dates header** — trip without dates renders no date text and no "night".
4. **Non-flight notice** — one hotel element plus one flight: `1 other element hidden until its section is built` is visible (plural: `N other elements hidden until their sections are built`).
5. **Create flight** — click `Add flight`, fill name, fill the leg editor (mocked `FlightLegsEditor` calls `onChange`), click `Save flight`; assert `createElement` called with `expect.objectContaining({ elementType: 'flight', name, typeSpecificData: { legs: [expect.objectContaining({ legOrder: 1 })] } })`, then the dialog closes and `listElements` is re-fetched.
6. **Auto-name until manually edited** — updating legs fills the name; after typing in Name, a later legs update does not overwrite it.
7. **Lookup autofill payload** — the `T15:10` / `T18:05` expectation from the old test.
8. **Two-leg create** — `legOrder` 1 and 2.
9. **Open dialog** — click a row; a dialog titled with the flight name appears with tabs `Details`, `Bookings`, `Seats`; the `BookingCard` mock renders under Bookings; Seats shows a `FlightSeatGrid` mock per leg.
10. **Edit legs** — in Details click `Edit`, change the legs, `Save changes`; `updateElement` then `syncLegs(tripId, elementId, [...])` called; the dialog stays open (silent reload).
11. **Delete** — click `Delete`, `Confirm`; `deleteElement` called and the dialog closes.
12. **Load failure** — `getTrip` rejects: an inline error and a `Retry` button; clicking Retry reloads.

Use `findBy*` for anything after an awaited API call, and wrap clicks that open modals with `await user.click` from `@testing-library/user-event` if the old tests used it (otherwise `fireEvent`).

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run client/src/__tests__/TripDetailPage.test.tsx`
Expected: FAIL (old page lacks the new UI).

- [ ] **Step 4: Rewrite the page**

Replace `client/src/pages/TripDetailPage.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, Container, Loader, Text } from '@mantine/core';
import { Booking, Trip, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { buildFlightRows, flightTotals } from '../utils/flightRows';
import { TripHeader } from '../components/TripHeader';
import { TripTravelersStrip } from '../components/TripTravelersStrip';
import { FlightsSection } from '../components/FlightsSection';
import { ElementDialog } from '../components/ElementDialog';
import { FlightDetailsTab } from '../components/FlightDetailsTab';
import { FlightSeatsTab } from '../components/FlightSeatsTab';
import { AddElementDialog } from '../components/AddElementDialog';
import { BookingCard } from '../components/BookingCard';
import '../styles/trips.css';

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [elements, setElements] = useState<TripElement[]>([]);
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [bookingsVersion, setBookingsVersion] = useState(0);
  const [participantsVersion, setParticipantsVersion] = useState(0);

  // Silent reload keeps open dialogs mounted; only the first load shows the spinner.
  const load = useCallback(async (id: string, initial = false) => {
    try {
      if (initial) setLoading(true);
      const [tripData, elementsData, participantsData, bookingsData] = await Promise.all([
        tripApi.getTrip(id),
        tripApi.listElements(id),
        tripApi.listParticipants(id),
        tripApi.listBookings(id),
      ]);
      setTrip(tripData);
      setElements(elementsData);
      setParticipants(participantsData);
      setBookings(bookingsData);
      setLoadError(null);
      setReloadError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load trip';
      if (initial) setLoadError(message);
      else setReloadError(message);
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tripId) load(tripId, true);
  }, [tripId, load]);

  useEffect(() => {
    if (!tripId || bookingsVersion === 0) return;
    tripApi.listBookings(tripId).then(setBookings).catch(() => undefined);
  }, [tripId, bookingsVersion]);

  const reload = useCallback(async () => {
    if (tripId) await load(tripId);
  }, [tripId, load]);

  const handleParticipantsFromBooking = (next: TripParticipant[]) => {
    setParticipants(next);
    setParticipantsVersion(v => v + 1);
  };

  const rows = useMemo(() => buildFlightRows(elements, bookings), [elements, bookings]);
  const totals = useMemo(() => flightTotals(elements, bookings), [elements, bookings]);
  const hiddenCount = elements.filter(e => e.elementType !== 'flight').length;
  const selected = elements.find(e => e.id === selectedId) ?? null;
  const selectedBookingCount = selected ? bookings.filter(b => b.elementIds.includes(selected.id)).length : 0;

  if (loading) {
    return <Container size="lg" py="md"><Loader size="sm" aria-label="Loading" /></Container>;
  }

  if (loadError) {
    return (
      <Container size="lg" py="md">
        <Alert color="red" title="Couldn't load trip">{loadError}</Alert>
        <Button mt="sm" variant="default" onClick={() => tripId && load(tripId, true)}>Retry</Button>
      </Container>
    );
  }

  if (!trip || !tripId) {
    return <Container size="lg" py="md"><Text>Trip not found</Text></Container>;
  }

  return (
    <Container size="lg" py="md">
      <TripHeader trip={trip} onAdd={() => setAdding(true)} />
      <TripTravelersStrip
        tripId={tripId}
        participants={participants}
        refreshKey={participantsVersion}
        onParticipantsChanged={setParticipants}
      />

      {reloadError && (
        <Alert color="red" mt="sm" withCloseButton onClose={() => setReloadError(null)}>{reloadError}</Alert>
      )}

      {rows.length === 0 ? (
        <Button mt="md" variant="light" onClick={() => setAdding(true)}>Add your first flight</Button>
      ) : (
        <FlightsSection rows={rows} totalLabel={totals.label} onOpen={setSelectedId} />
      )}

      {hiddenCount > 0 && (
        <Text size="sm" c="dimmed" mt="sm">
          {hiddenCount === 1
            ? '1 other element hidden until its section is built'
            : `${hiddenCount} other elements hidden until their sections are built`}
        </Text>
      )}

      <AddElementDialog
        tripId={tripId}
        opened={adding}
        onClose={() => setAdding(false)}
        onCreated={async () => {
          setAdding(false);
          await reload();
        }}
      />

      {selected && (
        <ElementDialog
          opened
          onClose={() => setSelectedId(null)}
          title={selected.name}
          swipeEnabled={!editingDetails}
          tabs={[
            {
              value: 'details',
              label: 'Details',
              content: (
                <FlightDetailsTab
                  key={selected.id}
                  tripId={tripId}
                  element={selected}
                  onChanged={reload}
                  onDeleted={async () => {
                    setSelectedId(null);
                    await reload();
                  }}
                  onEditingChange={setEditingDetails}
                />
              ),
            },
            {
              value: 'bookings',
              label: 'Bookings',
              count: selectedBookingCount,
              content: (
                <BookingCard
                  tripId={tripId}
                  elementId={selected.id}
                  elements={elements}
                  participants={participants}
                  onParticipantsChanged={handleParticipantsFromBooking}
                  refreshKey={bookingsVersion}
                  onBookingsChanged={() => setBookingsVersion(v => v + 1)}
                />
              ),
            },
            {
              value: 'seats',
              label: 'Seats',
              content: <FlightSeatsTab tripId={tripId} element={selected} travelers={participants} />,
            },
          ]}
        />
      )}
    </Container>
  );
}
```

Note: in the spec the Bookings tab count comes from trip-level bookings; `selectedBookingCount` uses the page's `bookings` list. `bookingsVersion` bumps refetch it.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run client/src/__tests__/TripDetailPage.test.tsx`
Expected: all scenarios pass. Debug with the `systematic-debugging` skill if not. Then: `npx tsc -p tsconfig.json --noEmit` — no output.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/TripDetailPage.tsx client/src/__tests__/TripDetailPage.test.tsx
git commit -m "feat: rebuild trip detail page as compact container

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Restyle TripsPage with Mantine

**Files:**
- Rewrite: `client/src/pages/TripsPage.tsx`
- Modify: `client/src/__tests__/TripsPage.test.tsx`

Preserve these queries from the existing test: button `Create Trip`, placeholder `Trip name`, labels `Start date` / `End date`, button `Save Trip`, and `findByText('Cabo')` after creation.

- [ ] **Step 1: Update the test to render via `renderWithMantine`**

In `client/src/__tests__/TripsPage.test.tsx` replace `render(` with `renderWithMantine(` (import from `../test-utils/renderWithMantine`), remove any Mantine mock, and add one test: when `listTrips` rejects, an inline alert shows the message **and the Create Trip button is still present** (errors no longer replace the page). Run it: `npx vitest run client/src/__tests__/TripsPage.test.tsx` — Expected: the new error test FAILS (the old page swaps the whole page for the error).

- [ ] **Step 2: Rewrite the page**

```tsx
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Container, Group, Loader, Modal, SegmentedControl, SimpleGrid, Stack, Text, TextInput, Title, Badge } from '@mantine/core';
import { Trip } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { formatTripDateRange } from '../utils/tripDates';
import '../styles/trips.css';

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrips = async () => {
    try {
      setLoading(true);
      setError(null);
      setTrips(await tripApi.listTrips());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrips();
  }, []);

  const createTrip = async () => {
    if (!name || !startDate || !endDate) {
      setError('Name, start date, and end date are required');
      return;
    }
    try {
      setCreating(true);
      setError(null);
      await tripApi.createTrip({ name, startDate, endDate });
      setName('');
      setStartDate('');
      setEndDate('');
      setShowCreate(false);
      await loadTrips();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trip');
    } finally {
      setCreating(false);
    }
  };

  const tripCard = (trip: Trip) => (
    <Card key={trip.id} component="a" href={`/trips/${trip.id}`} withBorder padding="sm">
      <Group justify="space-between" wrap="nowrap">
        <Text fw={600}>{trip.name}</Text>
        {trip.tripType && <Badge variant="light">{trip.tripType}</Badge>}
      </Group>
      <Text size="sm" c="dimmed">{formatTripDateRange(trip.startDate, trip.endDate)}</Text>
      {trip.description && <Text size="sm">{trip.description}</Text>}
    </Card>
  );

  return (
    <Container size="lg" py="md">
      <Group justify="space-between" mb="md">
        <Title order={2}>Trips</Title>
        <Group>
          <SegmentedControl
            value={viewMode}
            onChange={value => setViewMode(value as 'list' | 'card')}
            data={[
              { value: 'list', label: 'List' },
              { value: 'card', label: 'Cards' },
            ]}
          />
          <Button onClick={() => setShowCreate(true)}>Create Trip</Button>
        </Group>
      </Group>

      {error && <Alert color="red" mb="md" withCloseButton onClose={() => setError(null)}>{error}</Alert>}

      <Modal opened={showCreate} onClose={() => setShowCreate(false)} title="Create trip">
        <Stack>
          <TextInput placeholder="Trip name" aria-label="Trip name" value={name} onChange={e => setName(e.currentTarget.value)} />
          <TextInput type="date" label="Start date" value={startDate} onChange={e => setStartDate(e.currentTarget.value)} />
          <TextInput type="date" label="End date" value={endDate} onChange={e => setEndDate(e.currentTarget.value)} />
          <Button onClick={createTrip} loading={creating}>Save Trip</Button>
        </Stack>
      </Modal>

      {loading ? (
        <Loader size="sm" aria-label="Loading trips" />
      ) : trips.length === 0 ? (
        <Text c="dimmed">No trips yet. Create your first trip!</Text>
      ) : viewMode === 'card' ? (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>{trips.map(tripCard)}</SimpleGrid>
      ) : (
        <Stack gap="xs">{trips.map(tripCard)}</Stack>
      )}
    </Container>
  );
}
```

The cards stay plain anchors (`href`) because the tests render without a Router.

- [ ] **Step 3: Run and commit**

Run: `npx vitest run client/src/__tests__/TripsPage.test.tsx` — Expected: all pass. If the existing test fills the form with `getByLabelText('Trip name')`, `aria-label` covers it; if it clicks "Toggle Card View", update that test to click `Cards`.
Run: `npx tsc -p tsconfig.json --noEmit` — no output.

```bash
git add client/src/pages/TripsPage.tsx client/src/__tests__/TripsPage.test.tsx
git commit -m "feat: restyle trips list page with Mantine

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: Re-tokenize trips.css and remove dead rules

**Files:**
- Modify: `client/src/styles/trips.css`

- [ ] **Step 1: Replace the variable block (lines 1–10)**

Replace the `:root { --ctp-mocha-* }` block with:

```css
:root {
  --ctp-mocha-base: var(--mantine-color-body);
  --ctp-mocha-surface0: light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6));
  --ctp-mocha-surface1: var(--mantine-color-default-border);
  --ctp-mocha-lavender: light-dark(var(--mantine-color-blue-7), var(--mantine-color-blue-3));
  --ctp-mocha-green: light-dark(var(--mantine-color-green-1), var(--mantine-color-green-9));
  --ctp-mocha-text: var(--mantine-color-text);
  --ctp-mocha-subtext: var(--mantine-color-dimmed);
}
```

Before replacing, view the original block (`sed -n 1,12p client/src/styles/trips.css`) and make sure every variable it defines (e.g. a text-on-accent or red variable) has a mapping; add any that exist in the file but are missing from the list above, using the closest Mantine token. Also run `grep -on "var(--ctp-mocha-[a-z0-9]*" client/src/styles/trips.css | sed 's/.*var(//' | sort -u` to confirm no used variable is left undefined.

- [ ] **Step 2: Remove page-level classes no longer referenced**

For each class selector in the file, check usage:

```bash
for c in $(grep -o '^\.[a-zA-Z0-9_-]*' client/src/styles/trips.css | sort -u | sed 's/^\.//'); do
  n=$(grep -rl --include=*.tsx -e "$c" client/src | wc -l); echo "$n $c"
done | sort -n | head -60
```

A class with count `0` is unreferenced: delete its rule blocks (including nested/descendant and media-query variants). Expected removals include the old `.trip-detail-page`, `.trip-header`, `.trips-page`, `.trips-header`, `.trip-item`, `.element-card`, `.element-group`, `.element-list`, `.elements-section`, `.element-header`, `.element-pricing`, `.edit-element-form`, etc. **Keep** anything with a count > 0, in particular `.sr-only`, `.create-element-field`, `.view-toggle-btn`, `.error`, `.no-elements`, and all booking/seat/flight-legs/txn/participant classes used by inner components. A class name that is a substring of another (e.g. `price` in `price-input`) can produce false positives — those are safe (kept). Check by eye that nothing in a remaining rule depends on a deleted parent selector.

- [ ] **Step 3: Verify and commit**

Run: `npx tsc -p tsconfig.json --noEmit && npx vitest run client/src/__tests__ --reporter=dot 2>&1 | tail -15`
Expected: only the known pre-existing `no such table: families` failures remain (about 11–12 packing-list/family tests).

```bash
git add client/src/styles/trips.css
git commit -m "style: map trips.css variables to Mantine tokens, drop dead rules

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 12: Docs, full verification, visual check

**Files:**
- Modify: `client/src/APIUsage.md`, `client/src/components/ComponentUsage.md`

- [ ] **Step 1: Update usage docs**

- In `client/src/APIUsage.md`, add `client/src/pages/TripDetailPage.tsx` to the `tripApi.listBookings` entry and map `tripApi.createElement` to `components/AddElementDialog.tsx`, and `updateElement` / `syncLegs` / `deleteElement` to `components/FlightDetailsTab.tsx` (remove them from the page entry if the page no longer imports them).
- In `client/src/components/ComponentUsage.md`, add entries: `FlightsSection`, `ElementDialog`, `FlightDetailsTab`, `FlightSeatsTab`, `AddElementDialog`, `TripHeader`, `TripTravelersStrip` (all used by `pages/TripDetailPage.tsx`; `FlightDetailsTab`/`FlightSeatsTab` are passed into `ElementDialog`). Update the `TripParticipantsPanel`, `BookingCard`, `FlightSeatGrid` entries to say where they are now mounted (`TripTravelersStrip` modal; `TripDetailPage` Bookings tab; `FlightSeatsTab`).

- [ ] **Step 2: Type-check and tests**

Run: `npx tsc -p tsconfig.json --noEmit` — Expected: no output.
Run: `npx vitest run client/src/__tests__/tripDates.test.ts client/src/__tests__/flightRows.test.ts client/src/__tests__/swipe.test.ts client/src/__tests__/FlightsSection.test.tsx client/src/__tests__/ElementDialog.test.tsx client/src/__tests__/TripDetailPage.test.tsx client/src/__tests__/TripsPage.test.tsx` — Expected: all pass.
Run: `npx vitest run 2>&1 | tail -20` — Expected: only the known `families` failures (compare with `git stash`-free baseline: those fail on `main` too).

- [ ] **Step 3: Visual check with Playwright against the dev server**

The dev server is already running on 3000/3001 (do not restart it). Login `uitester` / `UiTest123!`; Cabo trip id `b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6`. Reuse `/tmp/lib.cjs` (`open()` logs in) if it still exists. Write a throwaway script under `/tmp` (not in the repo) that:

1. At 1440×900 opens `/trips/b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6`, screenshots to `/tmp/shots/desktop.png`, and asserts `document.documentElement.scrollHeight <= window.innerHeight` (the whole trip fits without scrolling).
2. Clicks the first flight row, asserts a dialog with tabs Details/Bookings/Seats, clicks each tab, screenshots.
3. At 390×844 reloads, asserts `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal overflow), checks the dialog is full-screen, and checks that the floating `Add flight` button is visible bottom-right.
4. Opens `/trips` at both sizes and screenshots.

View the screenshots with the `view` tool and confirm the page matches the site's look (light/dark follow theme, readable text). Fix any issue found in the relevant component, re-run its tests, and commit the fix.

- [ ] **Step 4: Stop the brainstorm companion and finish**

```bash
ls .superpowers/brainstorm/
bash /config/.copilot/installed-plugins/superpowers-marketplace/superpowers/skills/brainstorming/scripts/stop-server.sh /config/workspace/travel-list/.superpowers/brainstorm/2160283-1794155259 || true
git status -sb | head
git add client/src/APIUsage.md client/src/components/ComponentUsage.md
git commit -m "docs: update usage maps for trip page components

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Then use the `finishing-a-development-branch` skill (note: `feat/trip-page-compact-redesign` is stacked on `fix/flight-ux-review`, which is stacked on `feat/flight-bookings-redesign`; neither is merged yet).

---

## Self-review notes

- **Spec coverage:** page structure (Tasks 4, 8, 9), travelers strip + Manage modal (8), flight rows with legs/layovers/shared price/totals (2, 4), dialog with Details/Bookings/Seats, mobile full-screen and swipe incl. disabled while editing (5, 6, 9), add dialog (7), TripsPage restyle (10), theme tokens (11), docs (12), mobile floating add button (8), error/empty/non-flight states (9), tests (1–5, 9, 10, 12).
- **Type consistency:** `FlightRow`/`FlightRowLeg`/`FlightTotals` defined in Task 2 and used in 4 and 9; `ElementDialogTab`/`swipeEnabled` in 5 and 9; `FlightDetailsTab` props (`onChanged`, `onDeleted`, `onEditingChange`) match Task 9 usage; `AddElementDialog` props (`tripId`, `opened`, `onClose`, `onCreated`) match Task 9; `TripTravelersStrip` props match Task 9.
- **Known assumption to verify while implementing:** the participant display field name (Task 8, Step 3) and the old test's mocking style (Task 9, Step 1).
