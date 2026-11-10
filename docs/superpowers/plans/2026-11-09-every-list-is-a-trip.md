# Every List Is a Trip: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every live packing list belongs to exactly one trip, through exactly one destination. List names are always the label "Trip · Destination" (or just "Trip" when the two names match). The selector, dashboard, Packing Lists page and Trips page treat the trip as the unit, and when a person moves between destinations their personal items and checks move with them.

**Architecture:**

- **Server:**
  - A shared label helper (Task 1).
  - A one-off migration that wraps every list without a destination in a trip shell (Task 2).
  - Repository changes that keep stored list names equal to labels, and a shared `moveMembersTx` used by destination create/update (`moveFrom: true`) and by the legacy split (Task 3).
  - A new `tripListService` holding the trip-level rules: create with a first destination, shell trips, rename sync, the last-destination guard, re-homing, and copy (Task 4).
  - Routes call it (Tasks 5–7).
- **Client:**
  - Types and API (Task 8).
  - A per-trip selector (Task 9).
  - A new `ManageDestinationsDrawer` opened from the dashboard, the Edit list dialog and the Packing Lists page (Tasks 10–13).
  - `moveFrom` and the shared-items choice in `AddDestinationDialog` (Task 14).
  - "No dates" on the Trips page (Task 15).
  - `SplitListDialog` deleted (Task 16).
- **Wrap-up:** docs (Task 17) and verification, including a 390px manual check against the migrated shared dev database (Task 18).

**Tech Stack:** Express + SQLite (`sqlite`/`sqlite3`, TypeScript via tsx, ESM, `.cjs` migrations), React 18 + Mantine 8, vitest + Testing Library + supertest.

**Spec:** `docs/superpowers/specs/2026-11-09-every-list-is-a-trip-design.md`. Background: `docs/superpowers/specs/2026-11-08-multi-destination-trips-design.md`.

## Tasks

| # | Task | Depends on |
|---|---|---|
| 1 | Label helper on server and client | – |
| 2 | Migration `20261109_01_trip_shells_for_lists.cjs` | 1 (inlines the same rule) |
| 3 | Repository naming and adoption, `moveMembersTx`, split refactor | 1 |
| 4 | `tripListService` (trip-level rules) | 3 |
| 5 | Destination routes: `moveFrom`, `sharedItemsTo`, `last_destination` | 4 |
| 6 | Trip routes: optional dates, first destination, rename, delete cascade, copy | 4 |
| 7 | Packing-list routes: new list gets a trip; delete and rename follow trip rules | 4 |
| 8 | Client API and types | – (server behaviour from 5–7) |
| 9 | Selector: one entry per trip, trip order | 8 |
| 10 | `ManageDestinationsDrawer` (+ `zIndex`/`onOpenList` props) | 8 |
| 11 | Dashboard: Destinations button replaces Split; labels | 10 |
| 12 | Edit list dialog: label title, destination rename, Destinations, Move carries items | 10 |
| 13 | Manage Packing Lists: one card per trip | 9, 10 |
| 14 | AddDestinationDialog `moveFrom` + shared-items choice; hide last Delete | 8, 10 |
| 15 | Trips page: dateless create and "No dates" | 8 |
| 16 | Remove `SplitListDialog` | 11, 13 |
| 17 | Usage docs | 1–16 |
| 18 | Full verification and 390px check | all |

## File map

**Server:**

- Create:
  - `server/utils/destinationLabel.ts` (+ test)
  - `server/migrations/migrations/20261109_01_trip_shells_for_lists.cjs`
  - `server/__tests__/trip-shells-migration.test.ts`
  - `server/services/tripListService.ts` (+ test)
  - `server/__tests__/trips.routes.test.ts`
- Modify:
  - `server/repositories/tripDestinationRepository.ts` (+ test)
  - `server/repositories/tripRepository.ts` (+ test)
  - `server/services/tripSplitService.ts` (+ test)
  - `server/routes/tripRoutes.ts`
  - `server/routes.ts`
  - `server/__tests__/trip-destinations.routes.test.ts`

**Client:**

- Create:
  - `client/src/utils/destinationLabel.ts`
  - `client/src/components/ManageDestinationsDrawer.tsx`
  - tests `destinationLabel.test.ts`, `destinationErrors.test.ts`, `ManageDestinationsDrawer.test.tsx`
- Modify:
  - `client/src/types/trip.ts`
  - `client/src/api/tripApi.ts`
  - `client/src/utils/destinationErrors.ts`
  - `client/src/utils/listOptions.ts`
  - `client/src/utils/dashboardGroups.ts`
  - components `Dashboard`, `GlobalListEditDrawer`, `ManagePackingLists`, `TripPackingSection`, `AddDestinationDialog`
  - `client/src/pages/TripsPage.tsx`
  - their tests
  - `vitest.config.ts`
- Delete:
  - `client/src/components/SplitListDialog.tsx`
  - `client/src/__tests__/SplitListDialog.test.tsx`

**Docs:**

- `client/src/APIUsage.md`
- `client/src/components/ComponentUsage.md`
- `docs/ServerAPIUsage.md`

---

## Shared context

The rest of this section is also saved as the `00-preamble.md` handed to each subagent.



- **Repo:** `/config/.paseo/worktrees/0zd8zt0o/lazy-dragonfly`
- **Branch:** `feature/multi-destination-trip-lists`
- **Spec:** `docs/superpowers/specs/2026-11-09-every-list-is-a-trip-design.md`
- **Background spec:** `docs/superpowers/specs/2026-11-08-multi-destination-trips-design.md`
- **Full plan (all tasks in one file):** `docs/superpowers/plans/2026-11-09-every-list-is-a-trip.md`

### Goal

Every live packing list belongs to exactly one trip, through exactly one destination. Every live trip has at least one destination.

- List names are always the label "Trip · Destination", or just "Trip" when the two names match.
- The selector, dashboard, Packing Lists page and Trips page treat a trip as the unit.
- Destinations are managed from a new `ManageDestinationsDrawer`.
- When a person moves between destinations, their personal items and checks move with them (`moveFrom: true` → `moveMembersTx`).
- `SplitListDialog` is removed.

### Stack

- **Server:**
  - Express with SQLite through the `sqlite` package, written in TypeScript and run with tsx.
  - The package is ESM (`"type": "module"`), so migrations are `.cjs` files in `server/migrations/migrations/`.
  - Foreign keys are not enforced: `ON DELETE CASCADE` does nothing, so delete dependent rows by hand.
- **Client:** React 18 with Mantine 8, in `client/src`.
- **Tests:** vitest, run from the repo root.
  - Server tests use an in-memory DB built from `SCHEMAS` in `server/db.ts` (not from migrations). Call `await closeDb()` in `afterEach`.
  - **Client test files only run if they are listed in the `include` array of `vitest.config.ts`.**

### Commands (run from the repo root)

| What | Command | Expected |
|---|---|---|
| Targeted tests | `npx vitest run <path> [<path> ...]` | all pass |
| Server type check | `npx tsc -p tsconfig.build.json --noEmit` | no output, exit 0 |
| Client type check | `npx tsc -p client/tsconfig.json --noEmit \| grep -c "error TS"` | ≤ 93, the pre-existing baseline; must not increase |

### Conventions for every task

- Work TDD-style: write the failing test, run it and watch it fail, implement, run it and watch it pass, then commit.
- Commit only the files the task names, using `git add <paths>`, never `git add -A`. End every commit message with:

  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```

- Never write to `/tmp`.
- **Server route tests:**
  - App setup: `app = express(); app.use(express.json()); app.use('/api', routes)` with `routes` imported from `'../routes'`.
  - Seed with `seedFamilyTrip()` from `server/test-utils/destinationFixtures.ts`. It returns `{ db, familyId, dad, mom, ava, leo, tripId }`; the trip is "Spring Break", dated 2027-03-01 → 2027-03-08, with no destination.
  - Auth: ``auth = `Bearer ${generateToken(dadRow)}` `` where `dadRow = await seed.db.get('SELECT * FROM users WHERE id = ?', [seed.dad])` and `generateToken` comes from `'../auth'`.
  - Other fixtures: `createList(familyId, name, memberIds)` (a raw list with no trip), `createMasterItem(familyId, name, { memberIds?, wholeFamily? })`, `addToList(listId, itemId)`, `setCheck(pliId, memberId|null, checked)`, `listRows(listId)` and `checksFor(pliId)`.
  - SSE spy: `vi.spyOn(sse, 'broadcastEvent').mockImplementation(() => undefined as never)` with `import * as sse from '../sse'`.
- **Client component tests:**
  - Wrap renders in `renderWithMantine` / `setMobileViewport` from `client/src/test-utils/renderWithMantine.tsx`. Some older tests mock `@mantine/core` with passthroughs instead; keep whichever style the file already uses.
  - Mock `../api` and `../api/tripApi` with `vi.mock`.
- **Transactions:** `withTransaction(db, fn)` in `server/utils/transaction.ts` uses a process-wide lock and AsyncLocalStorage. A nested call on the same db runs `fn` directly. Functions ending in `Tx` assume their caller owns the transaction.
- **Errors:** `DestinationValidationError(code)` becomes a 400 `{ error: code }` (404 when the code is `not_found`). `DestinationConflictError` becomes a 409 `member_in_other_destination`. Both go through `sendDestinationError` in `server/routes/tripRoutes.ts`.

### Design decisions (resolved spec ambiguities)

Every task must follow these.

1. **Label.** `destinationListLabel(trip, dest)`:
   - Trim both names.
   - If the trip name is empty, return the destination name.
   - If the destination name is empty, or the names match case-insensitively, return the trip name.
   - Otherwise return `` `${trip} · ${dest}` `` (U+00B7 middle dot, with a space on each side).
   - `namesMatch(a, b)` compares the trimmed, lower-cased names.
   - The migration inlines a copy of this logic, because a `.cjs` file cannot import TypeScript.
2. **Stored list name = label.** `TripDestinationRepository.syncListNamesTx(db, tripId)` rewrites the names and returns only the ids of lists whose name actually changed. Callers use those ids for SSE.
3. **`moveMembersTx(db, { fromListId, toListId, memberIds })`** lives in `server/services/tripSplitService.ts` and moves membership as well as rows.
   - It handles each personal row on the source list: rows whose item is not whole-family and has a non-null `item_id`.
     - **Owners** are the item's `item_members` who are also members of the source list. **Movers** are the owners who are in `memberIds`.
     - No movers → the row stays.
     - Every owner moves → the row moves, and its audit history is re-pointed.
     - Only some owners move → the row is copied for the movers (`copyRowForMembersTx`), and their checks and not-needed rows go with the copy.
     - The target already has a row for the same `item_id` → the movers' checks and not-needed rows are re-pointed to that row. If the target row already has a check or not-needed row for that member, the source's row for that member is dropped. On a full move the source row is then deleted and its audit re-pointed.
   - Whole-family rows stay.
   - Finally, the movers are removed from the source list's members and added to the target's members with `INSERT OR IGNORE`.
4. **`pullMembersIntoDestinationTx(db, { tripId, destinationId, memberIds })`** runs `moveMembersTx` from every other live destination of the trip that holds some of `memberIds`.
   - If a destination would be left with no members, it throws `DestinationValidationError('would_empty_destination')` (400).
   - It returns the ids of the lists it touched.
5. **Adopting a list** (`packingListId` on destination create, or the split source) is allowed when the list has no live destination (legacy), or when its current live trip has exactly one live destination and is a different trip.
   - That old trip and its destination are soft-deleted, and its `trip_packing_lists` link is removed.
   - Otherwise the request fails with `list_already_destination`.
6. **Deleting a destination that is not the last one** goes through `deleteDestinationTx`:
   - After the optional shared-items move, soft-delete the destination and remove its link.
   - Then, if `deleteList` is set or the list is now empty, soft-delete the list.
   - Otherwise **re-home** the list into a new dateless trip named after the destination (`createShellTripForListTx`), which keeps the invariant.
   - Deleting the last destination → 409 `last_destination`.
7. **`DELETE /packing-lists/:id`:**
   - If the list is its trip's only destination, soft-delete the trip, its destinations and its lists.
   - Otherwise, delete the destination with `deleteList: true`.
8. **`PUT /packing-lists/:id` with `name` on a destination list** renames the destination through `renameDestinationTx`. It does not write the raw list name.
9. **Rename rules:**
   - `renameDestinationTx`: if the trip has exactly one live destination and the old destination name matched the trip name, rename the trip too.
   - `applyTripRenameTx(db, tripId, oldName, newName)`: rename every live destination whose name matched the old trip name.
   - Both then run `syncListNamesTx`.
10. **Migration:**
    - Step 1 names the new destination after the trip only when the trip has no live destination yet. Otherwise it uses the list name, so a trip never gets two destinations with the trip's name.
    - Step 1 handles each list once, using its oldest link first.
    - Step 1 does not add `trip_participants`.
    - Tracking table: `migration_trip_shells(kind, id)`, where kind is `'trip' | 'destination' | 'list' | 'link'`. A `'link'` id is `` `${tripId}|${listId}` `` and is recorded only when the migration inserted that link.
11. **Copy:**
    - `POST /trips/:tripId/copy` creates a dateless trip with status `planning`. It copies the description and trip type, but not bookings, elements, participants or dates.
    - A destination whose name matched the source trip name takes the new trip name.
    - It copies the destination color, the list members (only live users of the family), the `packing_list_templates` links, and item rows (unchecked, not "not needed", `added_during_packing = 0`) with their `packing_list_item_templates` provenance.
    - One-off rows (master item has `isOneOff = 1`, or `item_id` is NULL) are copied only when `includeOneOffs` is set. A one-off with a master item gets a new one-off master item with the same members and whole-family flag.
    - Response: 201 `{ trip, destinations }`.
12. **Selector order:**
    - Upcoming dated trips first, ordered by start date ascending. A trip is upcoming when `(endDate ?? startDate) >= today` (local `YYYY-MM-DD`).
    - Then past dated trips, by start date descending.
    - Then dateless trips, by name (case-insensitive).
    - A legacy list without `trip_destination` becomes its own dateless entry.
    - Entry label: "<trip>" when the trip has one listed destination, "<trip> · N destinations" when it has N ≥ 2.
13. **Dashboard:** `isTrip = groups.length > 1`. Group names are labels. The header "<trip> · N destinations" is shown only when there are 2 or more groups.
14. **Offline:** destination, trip and copy actions are disabled and show "Needs a connection".
15. **`GlobalListEditDrawer` Move:** when the drawer knows its own destination id, Move sends one `updateDestination(tripId, ownDestinationId, { memberIds, moveFrom: true })` so items follow the person, then re-saves members as before. When the own destination is unknown, it keeps the old two-step path.
16. **What stays:** `POST /trips/:tripId/split` and `tripApi.splitList` remain for old clients. New List (`PackingListPage` → `createPackingList`) keeps its dialog; the server wraps the new list in a shell trip.
17. **Edit list dialog title** is the stored list name (the label). The inline name text next to the pencil is removed because it duplicated the title.
18. **`sharedItemsTo`** is honoured only when the trip had exactly one live destination before the create. The client sends it only when its fresh `listDestinations` call returns one destination, and shows the radio choice only when its `destinations` prop has one entry and it is not editing.
19. **Copy (client):** the copy drawer defaults the name to "<trip> (copy)". It calls `tripApi.copyTrip`, notifies "Trip copied", and opens the first new destination list in the edit dialog. Legacy cards for lists without a trip keep the old client-side copy.
20. **Layering:** `ManageDestinationsDrawer` uses zIndex 3100, above `GlobalListEditDrawer` (3000). Its menus and dialogs use zIndex + 10.
21. **Trips page dates:** both dates or neither. If only one is filled in, the page shows "Add both dates or leave both empty." Dated trips keep the server order; dateless trips follow under "No dates".

### Shared names and signatures (must match across tasks)

```ts
// server/utils/destinationLabel.ts and client/src/utils/destinationLabel.ts
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean;
export function destinationListLabel(tripName: string | null | undefined, destinationName: string | null | undefined): string;

// server/repositories/tripDestinationRepository.ts
export interface InsertDestinationInput { tripId: string; familyId: string; name: string; memberIds: string[]; packingListId?: string; allowNoMembers?: boolean }
export interface ListTripSummary { tripId; tripName; destinationId; destinationName; position; destinationCount; color: string | null; tripStartDate: string | null; tripEndDate: string | null }
TripDestinationRepository#insertDestinationTx(db, input): Promise<string>        // destination id
TripDestinationRepository#syncListNamesTx(db, tripId): Promise<string[]>         // changed list ids
TripDestinationRepository#updateTx(db, existing: TripDestination, familyId, { color?, position?, memberIds? }): Promise<void>
TripDestinationRepository#update(id, familyId, { name?, color?, position?, memberIds? }): Promise<TripDestination>
TripDestinationRepository#ensureParticipantsTx(db, tripId, memberIds)           // now public

// server/services/tripSplitService.ts
export async function moveMembersTx(db, { fromListId, toListId, memberIds }): Promise<void>;
export async function pullMembersIntoDestinationTx(db, { tripId, destinationId, memberIds }): Promise<string[]>;

// server/services/tripListService.ts
export class LastDestinationError extends Error {}            // message 'last_destination'
export async function insertTripTx(db, input: NewTripInput): Promise<string>;
export async function createTripWithFirstDestination(input: NewTripInput & { memberIds: string[] }): Promise<{ tripId: string; destinationId: string }>;
export async function createShellTripForListTx(db, { familyId, listId, name }): Promise<string>;   // trip id
export async function renameDestinationTx(db, destinationId, name): Promise<string[]>;
export async function applyTripRenameTx(db, tripId, oldName, newName): Promise<string[]>;
export async function createDestination(input: CreateDestinationInput): Promise<{ destinationId: string; touchedListIds: string[] }>;
export async function updateDestination(input: UpdateDestinationInput): Promise<string[]>;
export async function deleteDestinationTx(db, { destination, familyId, moveSharedItemsToListId, deleteList }): Promise<number>;
export async function copyTrip({ sourceTripId, familyId, name, includeOneOffs }): Promise<string>;  // new trip id

// client
tripApi.copyTrip(tripId, { name, includeOneOffs }): Promise<{ trip: Trip; destinations: TripDestination[] }>
DestinationWritePayload gains moveFrom?: boolean; sharedItemsTo?: 'existing' | 'new'
groupListsByTrip(lists), sortTripGroups(groups, today), tripGroupLabel(group), todayIso() in client/src/utils/listOptions.ts
ManageDestinationsDrawer({ tripId, opened, onClose }) in client/src/components/ManageDestinationsDrawer.tsx
TripPackingSection gains optional props onOpenList?: () => void and zIndex?: number
AddDestinationDialog gains optional prop zIndex?: number
```

New server error codes: `would_empty_destination` (400), `last_destination` (409), `invalid_shared_items_to` (400).

---

## Task 1: Label helper on server and client

The label rule is shared by the server, the client and the migration. Build it first, with identical tests on both sides.

**Files:**
- Create: `server/utils/destinationLabel.ts`
- Create: `server/utils/destinationLabel.test.ts`
- Create: `client/src/utils/destinationLabel.ts`
- Create: `client/src/__tests__/destinationLabel.test.ts`
- Modify: `vitest.config.ts` (add the client test to `include`)

- [ ] **Step 1: Write the failing server test**

Create `server/utils/destinationLabel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { destinationListLabel, namesMatch } from './destinationLabel';

describe('destinationListLabel', () => {
  it('joins different names with a middle dot', () => {
    expect(destinationListLabel('Cabo', 'San Lucas')).toBe('Cabo · San Lucas');
  });

  it('uses only the trip name when the names are equal', () => {
    expect(destinationListLabel('Cabo', 'Cabo')).toBe('Cabo');
  });

  it('ignores case and surrounding spaces when comparing', () => {
    expect(destinationListLabel(' Cabo ', 'cABO  ')).toBe('Cabo');
  });

  it('trims both names in the joined label', () => {
    expect(destinationListLabel('  Cabo ', ' San Lucas ')).toBe('Cabo · San Lucas');
  });

  it('falls back to whichever name is present', () => {
    expect(destinationListLabel('', 'Paris')).toBe('Paris');
    expect(destinationListLabel('Spring Break', '')).toBe('Spring Break');
    expect(destinationListLabel(null, undefined)).toBe('');
  });
});

describe('namesMatch', () => {
  it('compares trimmed, case-insensitive names', () => {
    expect(namesMatch(' Spring Break', 'spring break ')).toBe(true);
    expect(namesMatch('Spring Break', 'Spring')).toBe(false);
    expect(namesMatch(null, '')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run server/utils/destinationLabel.test.ts`
Expected: FAIL, "Failed to resolve import "./destinationLabel"".

- [ ] **Step 3: Implement the server helper**

Create `server/utils/destinationLabel.ts`:

```ts
const clean = (value: string | null | undefined) => (value ?? '').trim();

/** True when two names are equal ignoring case and surrounding spaces. */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

/** The name shown for a destination's list: "Trip · Destination", or just "Trip" when the names match. */
export function destinationListLabel(tripName: string | null | undefined, destinationName: string | null | undefined): string {
  const trip = clean(tripName);
  const destination = clean(destinationName);
  if (!trip) return destination;
  if (!destination || namesMatch(trip, destination)) return trip;
  return `${trip} · ${destination}`;
}
```

- [ ] **Step 4: Run the server test and watch it pass**

Run: `npx vitest run server/utils/destinationLabel.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the client test**

Create `client/src/__tests__/destinationLabel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { destinationListLabel, namesMatch } from '../utils/destinationLabel';

describe('destinationListLabel (client)', () => {
  it('joins different names with a middle dot', () => {
    expect(destinationListLabel('Cabo', 'San Lucas')).toBe('Cabo · San Lucas');
  });

  it('uses only the trip name when the names are equal', () => {
    expect(destinationListLabel('Cabo', 'Cabo')).toBe('Cabo');
  });

  it('ignores case and surrounding spaces when comparing', () => {
    expect(destinationListLabel(' Cabo ', 'cABO  ')).toBe('Cabo');
  });

  it('trims both names in the joined label', () => {
    expect(destinationListLabel('  Cabo ', ' San Lucas ')).toBe('Cabo · San Lucas');
  });

  it('falls back to whichever name is present', () => {
    expect(destinationListLabel('', 'Paris')).toBe('Paris');
    expect(destinationListLabel('Spring Break', '')).toBe('Spring Break');
    expect(destinationListLabel(null, undefined)).toBe('');
  });
});

describe('namesMatch (client)', () => {
  it('compares trimmed, case-insensitive names', () => {
    expect(namesMatch(' Spring Break', 'spring break ')).toBe(true);
    expect(namesMatch('Spring Break', 'Spring')).toBe(false);
    expect(namesMatch(null, '')).toBe(true);
  });
});
```

Then add it to `vitest.config.ts` by inserting this line directly after the `'client/src/__tests__/listOptions.test.ts', ...` line:

```ts
      'client/src/__tests__/destinationLabel.test.ts', // Destination list label helper
```

- [ ] **Step 6: Run the client test and watch it fail**

Run: `npx vitest run client/src/__tests__/destinationLabel.test.ts`
Expected: FAIL, "Failed to resolve import "../utils/destinationLabel"".

- [ ] **Step 7: Implement the client helper**

Create `client/src/utils/destinationLabel.ts`. Its contents are byte-for-byte the same as the server file, apart from the first comment line:

```ts
// Same rule as server/utils/destinationLabel.ts; keep the two in step.
const clean = (value: string | null | undefined) => (value ?? '').trim();

/** True when two names are equal ignoring case and surrounding spaces. */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

/** The name shown for a destination's list: "Trip · Destination", or just "Trip" when the names match. */
export function destinationListLabel(tripName: string | null | undefined, destinationName: string | null | undefined): string {
  const trip = clean(tripName);
  const destination = clean(destinationName);
  if (!trip) return destination;
  if (!destination || namesMatch(trip, destination)) return trip;
  return `${trip} · ${destination}`;
}
```

- [ ] **Step 8: Run both tests and the type checks**

Run: `npx vitest run server/utils/destinationLabel.test.ts client/src/__tests__/destinationLabel.test.ts`
Expected: PASS (12 tests).

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no output.

Run: `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"`
Expected: `93` or lower.

- [ ] **Step 9: Commit**

```bash
git add server/utils/destinationLabel.ts server/utils/destinationLabel.test.ts client/src/utils/destinationLabel.ts client/src/__tests__/destinationLabel.test.ts vitest.config.ts
git commit -m "feat: add destination list label helper

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Migration `20261109_01_trip_shells_for_lists.cjs`

This migration moves every existing list into a trip, so that the "every list is a trip" invariant holds before the new code runs. It depends on nothing else in this plan: it inlines its own copy of the label rule.

**Files:**
- Create: `server/migrations/migrations/20261109_01_trip_shells_for_lists.cjs`
- Create: `server/__tests__/trip-shells-migration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/trip-shells-migration.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { getDb, closeDb } from '../db';
import migration from '../migrations/migrations/20261109_01_trip_shells_for_lists.cjs';

type Db = Awaited<ReturnType<typeof getDb>>;

async function seedFamily(db: Db) {
  const familyId = uuidv4();
  await db.run(`INSERT INTO families (id, name) VALUES (?, 'Fam')`, [familyId]);
  const user = async (name: string, deleted = false) => {
    const id = uuidv4();
    await db.run(
      `INSERT INTO users (id, name, username, role, familyId, deleted_at) VALUES (?, ?, ?, 'FamilyMember', ?, ?)`,
      [id, name, `${name}-${id}`, familyId, deleted ? new Date().toISOString() : null]
    );
    return id;
  };
  return { familyId, dad: await user('Dad'), mom: await user('Mom'), ava: await user('Ava'), gone: await user('Gone', true) };
}

async function makeList(db: Db, familyId: string, name: string, memberIds: string[], deleted = false) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO packing_lists (id, family_id, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, familyId, name, now, now, deleted ? now : null]
  );
  for (const m of memberIds) await db.run(`INSERT INTO packing_list_members (packing_list_id, member_id) VALUES (?, ?)`, [id, m]);
  return id;
}

async function makeTrip(db: Db, familyId: string, name: string, deleted = false) {
  const id = uuidv4();
  await db.run(
    `INSERT INTO trips (id, family_id, name, start_date, end_date, status, deleted_at) VALUES (?, ?, ?, '2027-03-01', '2027-03-08', 'booked', ?)`,
    [id, familyId, name, deleted ? new Date().toISOString() : null]
  );
  return id;
}

const link = (db: Db, tripId: string, listId: string) =>
  db.run(`INSERT INTO trip_packing_lists (trip_id, packing_list_id) VALUES (?, ?)`, [tripId, listId]);

async function makeDestination(db: Db, tripId: string, name: string, listId: string, position = 0, color = 'blue') {
  const id = uuidv4();
  await db.run(
    `INSERT INTO trip_destinations (id, trip_id, name, color, position, packing_list_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, tripId, name, color, position, listId]
  );
  await link(db, tripId, listId);
  return id;
}

const placeOf = (db: Db, listId: string) =>
  db.get(
    `SELECT t.id AS tripId, t.name AS tripName, t.start_date AS startDate, t.end_date AS endDate, t.status, t.family_id AS familyId,
            d.id AS destinationId, d.name AS destinationName, d.position, d.color
     FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
     WHERE d.packing_list_id = ? AND d.deleted_at IS NULL AND t.deleted_at IS NULL`,
    [listId]
  );
const destinationsOf = (db: Db, tripId: string) =>
  db.all(`SELECT name, position, color, packing_list_id AS listId FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL ORDER BY position`, [tripId]);
const nameOf = async (db: Db, listId: string) => (await db.get(`SELECT name FROM packing_lists WHERE id = ?`, [listId]))?.name;
const membersOf = async (db: Db, listId: string) =>
  (await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ? ORDER BY member_id`, [listId])).map((r: any) => r.member_id);
const linked = async (db: Db, tripId: string, listId: string) =>
  !!(await db.get(`SELECT 1 AS yes FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [tripId, listId]));

describe('20261109_01_trip_shells_for_lists', () => {
  afterEach(async () => {
    await closeDb();
  });

  it('turns a linked list into a destination named after its trip', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const tripId = await makeTrip(db, f.familyId, 'Spring Break');
    const listId = await makeList(db, f.familyId, 'Spring list', [f.dad, f.mom]);
    await link(db, tripId, listId);

    await migration.up({ db });

    const place = await placeOf(db, listId);
    expect(place).toMatchObject({ tripId, destinationName: 'Spring Break', position: 0, color: 'blue' });
    expect(await membersOf(db, listId)).toEqual([f.dad, f.mom].sort());
    expect(await nameOf(db, listId)).toBe('Spring Break');
  });

  it('adds a second linked list to a trip that already has a destination, under the list name', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const tripId = await makeTrip(db, f.familyId, 'Spring Break');
    const paris = await makeList(db, f.familyId, 'Spring Break – Paris', [f.dad]);
    await makeDestination(db, tripId, 'Paris', paris);
    const kids = await makeList(db, f.familyId, 'Kids', [f.ava]);
    await link(db, tripId, kids);

    await migration.up({ db });

    expect((await destinationsOf(db, tripId)).map((d: any) => [d.name, d.position, d.color])).toEqual([
      ['Paris', 0, 'blue'],
      ['Kids', 1, 'green'],
    ]);
    expect(await nameOf(db, kids)).toBe('Spring Break · Kids');
    expect(await nameOf(db, paris)).toBe('Spring Break · Paris');
  });

  it('gives a linked list its own trip when one of its members is already at another destination', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const tripId = await makeTrip(db, f.familyId, 'Spring Break');
    const paris = await makeList(db, f.familyId, 'Paris list', [f.dad]);
    await makeDestination(db, tripId, 'Paris', paris);
    const again = await makeList(db, f.familyId, 'Dad again', [f.dad, f.ava]);
    await link(db, tripId, again);

    await migration.up({ db });

    const place = await placeOf(db, again);
    expect(place.tripId).not.toBe(tripId);
    expect(place).toMatchObject({ tripName: 'Dad again', destinationName: 'Dad again', startDate: null, endDate: null, status: 'planning' });
    expect(await destinationsOf(db, tripId)).toHaveLength(1);
  });

  it('wraps an unlinked list in a dateless shell trip', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const listId = await makeList(db, f.familyId, 'Beach', [f.dad]);

    await migration.up({ db });

    const place = await placeOf(db, listId);
    expect(place).toMatchObject({
      tripName: 'Beach', destinationName: 'Beach', startDate: null, endDate: null, status: 'planning',
      familyId: f.familyId, position: 0, color: 'blue',
    });
    expect(await linked(db, place.tripId, listId)).toBe(true);
    expect(await membersOf(db, listId)).toEqual([f.dad]);
    expect(await nameOf(db, listId)).toBe('Beach');
  });

  it('allows lists with no members', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const listId = await makeList(db, f.familyId, 'Empty', []);

    await migration.up({ db });

    expect((await placeOf(db, listId)).tripName).toBe('Empty');
    expect(await membersOf(db, listId)).toEqual([]);
  });

  it('gives a trip without destinations a new list with every live family member', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const tripId = await makeTrip(db, f.familyId, 'Ski');

    await migration.up({ db });

    const destinations = await destinationsOf(db, tripId);
    expect(destinations.map((d: any) => d.name)).toEqual(['Ski']);
    expect(await nameOf(db, destinations[0].listId)).toBe('Ski');
    expect(await membersOf(db, destinations[0].listId)).toEqual([f.dad, f.mom, f.ava].sort());
  });

  it('leaves deleted lists and deleted trips alone', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const deletedList = await makeList(db, f.familyId, 'Old', [f.dad], true);
    const deletedTrip = await makeTrip(db, f.familyId, 'Gone trip', true);

    await migration.up({ db });

    expect(await placeOf(db, deletedList)).toBeUndefined();
    expect(await destinationsOf(db, deletedTrip)).toEqual([]);
  });

  it('renames existing destination lists to their labels', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const tripId = await makeTrip(db, f.familyId, 'Cabo');
    const mexico = await makeList(db, f.familyId, 'Mexico', [f.dad]);
    const lucas = await makeList(db, f.familyId, 'Cabo – San Lucas', [f.ava]);
    await makeDestination(db, tripId, 'Cabo', mexico, 0, 'blue');
    await makeDestination(db, tripId, 'San Lucas', lucas, 1, 'green');

    await migration.up({ db });

    expect(await nameOf(db, mexico)).toBe('Cabo');
    expect(await nameOf(db, lucas)).toBe('Cabo · San Lucas');
  });

  it('does nothing more when run twice', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    await makeList(db, f.familyId, 'Beach', [f.dad]);

    await migration.up({ db });
    const trips = (await db.get(`SELECT COUNT(*) AS n FROM trips`)).n;
    await migration.up({ db });

    expect((await db.get(`SELECT COUNT(*) AS n FROM trips`)).n).toBe(trips);
  });

  it('rolls back everything when a step fails', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const listId = await makeList(db, f.familyId, 'Beach', [f.dad]);
    await makeTrip(db, f.familyId, 'Ski');
    const realRun = db.run.bind(db);
    let calls = 0;
    (db as any).run = (sql: string, ...args: unknown[]) => {
      if (typeof sql === 'string' && sql.startsWith('INSERT INTO packing_lists') && ++calls === 1) {
        return Promise.reject(new Error('boom'));
      }
      return (realRun as any)(sql, ...args);
    };
    try {
      await expect(migration.up({ db })).rejects.toThrow('boom');
    } finally {
      (db as any).run = realRun;
    }

    expect(await placeOf(db, listId)).toBeUndefined();
    expect((await db.get(`SELECT COUNT(*) AS n FROM trips`)).n).toBe(1);
  });

  it('down removes what up created and keeps the original lists and links', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const tripId = await makeTrip(db, f.familyId, 'Spring Break');
    const linkedList = await makeList(db, f.familyId, 'Spring list', [f.dad]);
    await link(db, tripId, linkedList);
    const loose = await makeList(db, f.familyId, 'Beach', [f.mom]);
    const emptyTrip = await makeTrip(db, f.familyId, 'Ski');

    await migration.up({ db });
    const created = await db.all(`SELECT kind, id FROM migration_trip_shells`);
    expect(created.map((r: any) => r.kind).sort()).toEqual(['destination', 'destination', 'destination', 'link', 'link', 'list', 'trip']);
    const skiList = (await destinationsOf(db, emptyTrip))[0].listId;

    await migration.down({ db });

    expect(await destinationsOf(db, tripId)).toEqual([]);
    expect(await linked(db, tripId, linkedList)).toBe(true);
    expect(await placeOf(db, loose)).toBeUndefined();
    expect((await db.get(`SELECT COUNT(*) AS n FROM trips WHERE name = 'Beach'`)).n).toBe(0);
    expect((await db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [loose])).deleted_at).toBeNull();
    expect(await db.get(`SELECT id FROM packing_lists WHERE id = ?`, [skiList])).toBeUndefined();
    expect(await db.get(`SELECT id FROM trips WHERE id = ?`, [emptyTrip])).toBeTruthy();
    expect(await db.get(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_trip_shells'`)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run server/__tests__/trip-shells-migration.test.ts`
Expected: FAIL, "Failed to resolve import "../migrations/migrations/20261109_01_trip_shells_for_lists.cjs"".

- [ ] **Step 3: Write the migration**

Create `server/migrations/migrations/20261109_01_trip_shells_for_lists.cjs`:

```js
/*
  Migration: every live packing list belongs to exactly one trip through exactly one destination.
  See docs/superpowers/specs/2026-11-09-every-list-is-a-trip-design.md.
  The runner does not wrap migrations in a transaction, so this one manages its own.
*/
const { randomUUID } = require('crypto');

const COLORS = ['blue', 'green', 'orange', 'grape', 'teal', 'red'];

// Same rule as server/utils/destinationLabel.ts (a .cjs migration cannot import TypeScript).
function label(tripName, destinationName) {
  const trip = String(tripName || '').trim();
  const destination = String(destinationName || '').trim();
  if (!trip) return destination;
  if (!destination || trip.toLowerCase() === destination.toLowerCase()) return trip;
  return `${trip} · ${destination}`;
}

const LIST_HAS_NO_DESTINATION = `NOT EXISTS (
  SELECT 1 FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
  WHERE d.packing_list_id = pl.id AND d.deleted_at IS NULL AND t.deleted_at IS NULL)`;

async function record(db, kind, id) {
  await db.run(`INSERT OR IGNORE INTO migration_trip_shells (kind, id) VALUES (?, ?)`, [kind, id]);
}

async function memberIdsOf(db, listId) {
  return (await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [listId])).map(r => r.member_id);
}

async function liveDestinations(db, tripId) {
  return db.all(
    `SELECT id, color, position, packing_list_id AS listId FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`,
    [tripId]
  );
}

async function addDestination(db, { tripId, name, listId, now }) {
  const existing = await liveDestinations(db, tripId);
  const used = new Set(existing.map(d => d.color));
  const color = COLORS.find(c => !used.has(c)) || COLORS[existing.length % COLORS.length];
  const position = existing.reduce((max, d) => Math.max(max, d.position), -1) + 1;
  const id = randomUUID();
  await db.run(
    `INSERT INTO trip_destinations (id, trip_id, name, color, position, packing_list_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, tripId, name, color, position, listId, now, now]
  );
  await record(db, 'destination', id);
  const inserted = await db.run(
    `INSERT OR IGNORE INTO trip_packing_lists (trip_id, packing_list_id, created_at) VALUES (?, ?, ?)`,
    [tripId, listId, now]
  );
  if (inserted && inserted.changes) await record(db, 'link', `${tripId}|${listId}`);
  return id;
}

async function up({ db }) {
  await db.exec('BEGIN TRANSACTION');
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS migration_trip_shells (kind TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (kind, id))`);
    const now = new Date().toISOString();

    // 1. Lists linked to a trip that are not yet a destination of any trip.
    const linkedRows = await db.all(
      `SELECT tpl.trip_id AS tripId, t.name AS tripName, pl.id AS listId, pl.name AS listName
       FROM trip_packing_lists tpl
       JOIN trips t ON t.id = tpl.trip_id
       JOIN packing_lists pl ON pl.id = tpl.packing_list_id
       WHERE t.deleted_at IS NULL AND pl.deleted_at IS NULL AND t.family_id = pl.family_id AND ${LIST_HAS_NO_DESTINATION}
       ORDER BY tpl.created_at, pl.created_at`
    );
    const handled = new Set();
    for (const row of linkedRows) {
      if (handled.has(row.listId)) continue;
      handled.add(row.listId);
      const members = await memberIdsOf(db, row.listId);
      const destinations = await liveDestinations(db, row.tripId);
      let conflict = false;
      for (const destination of destinations) {
        const others = await memberIdsOf(db, destination.listId);
        if (others.some(m => members.includes(m))) {
          conflict = true;
          break;
        }
      }
      if (conflict) continue; // step 2 gives it a shell trip of its own
      const name = destinations.length === 0 ? row.tripName : row.listName;
      await addDestination(db, { tripId: row.tripId, name, listId: row.listId, now });
    }

    // 2. Every other live list without a destination gets a dateless shell trip.
    const loose = await db.all(
      `SELECT pl.id, pl.name, pl.family_id AS familyId FROM packing_lists pl
       WHERE pl.deleted_at IS NULL AND ${LIST_HAS_NO_DESTINATION}
       ORDER BY pl.created_at`
    );
    for (const list of loose) {
      const tripId = randomUUID();
      await db.run(
        `INSERT INTO trips (id, family_id, name, start_date, end_date, status, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, 'planning', ?, ?)`,
        [tripId, list.familyId, list.name, now, now]
      );
      await record(db, 'trip', tripId);
      await addDestination(db, { tripId, name: list.name, listId: list.id, now });
    }

    // 3. Live trips that still have no destination get one, with a new list for the whole family.
    const emptyTrips = await db.all(
      `SELECT t.id, t.name, t.family_id AS familyId FROM trips t
       WHERE t.deleted_at IS NULL AND NOT EXISTS (
         SELECT 1 FROM trip_destinations d WHERE d.trip_id = t.id AND d.deleted_at IS NULL)`
    );
    for (const trip of emptyTrips) {
      const listId = randomUUID();
      await db.run(
        `INSERT INTO packing_lists (id, family_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [listId, trip.familyId, trip.name, now, now]
      );
      await record(db, 'list', listId);
      const users = await db.all(`SELECT id FROM users WHERE familyId = ? AND deleted_at IS NULL`, [trip.familyId]);
      for (const user of users) {
        await db.run(`INSERT OR IGNORE INTO packing_list_members (packing_list_id, member_id) VALUES (?, ?)`, [listId, user.id]);
      }
      await addDestination(db, { tripId: trip.id, name: trip.name, listId, now });
    }

    // 4. Every destination list is named after its label.
    const named = await db.all(
      `SELECT d.packing_list_id AS listId, d.name, t.name AS tripName, pl.name AS listName
       FROM trip_destinations d JOIN trips t ON t.id = d.trip_id JOIN packing_lists pl ON pl.id = d.packing_list_id
       WHERE d.deleted_at IS NULL AND t.deleted_at IS NULL AND pl.deleted_at IS NULL`
    );
    for (const row of named) {
      const next = label(row.tripName, row.name);
      if (next !== row.listName) {
        await db.run(`UPDATE packing_lists SET name = ?, updated_at = ? WHERE id = ?`, [next, now, row.listId]);
      }
    }

    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

async function deleteListRows(db, listId) {
  const items = `SELECT id FROM packing_list_items WHERE packing_list_id = ?`;
  for (const table of ['packing_list_item_checks', 'packing_list_item_not_needed', 'packing_list_item_templates']) {
    await db.run(`DELETE FROM ${table} WHERE packing_list_item_id IN (${items})`, [listId]);
  }
  await db.run(`DELETE FROM packing_list_audit_log WHERE packing_list_id = ?`, [listId]);
  await db.run(`DELETE FROM packing_list_items WHERE packing_list_id = ?`, [listId]);
  await db.run(`DELETE FROM packing_list_members WHERE packing_list_id = ?`, [listId]);
  await db.run(`DELETE FROM packing_list_templates WHERE packing_list_id = ?`, [listId]);
  await db.run(`DELETE FROM trip_packing_lists WHERE packing_list_id = ?`, [listId]);
  await db.run(`DELETE FROM packing_lists WHERE id = ?`, [listId]);
}

async function down({ db }) {
  const tracked = await db.get(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_trip_shells'`);
  if (!tracked) return;
  await db.exec('BEGIN TRANSACTION');
  try {
    const ids = async kind =>
      (await db.all(`SELECT id FROM migration_trip_shells WHERE kind = ?`, [kind])).map(r => r.id);
    for (const id of await ids('destination')) {
      await db.run(`DELETE FROM trip_destinations WHERE id = ?`, [id]);
    }
    for (const key of await ids('link')) {
      const [tripId, listId] = key.split('|');
      await db.run(`DELETE FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [tripId, listId]);
    }
    for (const listId of await ids('list')) {
      await deleteListRows(db, listId);
    }
    for (const tripId of await ids('trip')) {
      await db.run(`DELETE FROM trip_participants WHERE trip_id = ?`, [tripId]);
      await db.run(`DELETE FROM trip_packing_lists WHERE trip_id = ?`, [tripId]);
      await db.run(`DELETE FROM trip_destinations WHERE trip_id = ?`, [tripId]);
      await db.run(`DELETE FROM trips WHERE id = ?`, [tripId]);
    }
    await db.exec(`DROP TABLE migration_trip_shells`);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

module.exports.up = up;
module.exports.down = down;
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run server/__tests__/trip-shells-migration.test.ts`
Expected: PASS (11 tests).

If the "down" test reports a different set of `kind` values, re-check the scenario by hand:
- The linked list becomes a destination of an existing trip: 1 destination, no new link, because the link already existed.
- `Beach` gets a shell trip: 1 trip, 1 destination and 1 link.
- `Ski` gets a list: 1 list, 1 destination and 1 link.

That gives `destination ×3, link ×2, list ×1, trip ×1`. Fix the migration, not the expectation.

- [ ] **Step 5: Check that the server still starts its migrator cleanly (optional sanity check)**

Run: `node -e "require('./server/migrations/migrations/20261109_01_trip_shells_for_lists.cjs')"`
Expected: no output, exit 0. This proves the file loads as CommonJS under the ESM package.

- [ ] **Step 6: Commit**

```bash
git add server/migrations/migrations/20261109_01_trip_shells_for_lists.cjs server/__tests__/trip-shells-migration.test.ts
git commit -m "feat: migrate every list into a trip shell

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Repository naming and adoption, `moveMembersTx`, and the split refactor

**Files:**
- Modify (full replacement): `server/repositories/tripDestinationRepository.ts`
- Modify (full replacement): `server/services/tripSplitService.ts`
- Modify: `server/repositories/tripDestinationRepository.test.ts`
- Modify: `server/services/tripSplitService.test.ts`
- Modify: `server/routes/tripRoutes.ts` (only remove the now-invalid `listName:` argument; Task 5 rewrites these routes)

What changes:
- `insertDestinationTx` no longer takes `listName`. New lists are named after the label, and adopted lists are renamed to it. It also accepts `allowNoMembers` and can adopt a list from a one-destination trip.
- `syncListNamesTx` is added.
- `update()` is split into `updateTx()` plus a thin wrapper.
- `ensureParticipantsTx` becomes public.
- `ListTripSummary` gains `color`, `tripStartDate` and `tripEndDate`.
- `moveMembersTx` and `pullMembersIntoDestinationTx` are added.
- The split runs on `moveMembersTx`.

- [ ] **Step 1: Update the existing repository tests and add new failing ones**

In `server/repositories/tripDestinationRepository.test.ts`:

1. Delete every `listName: ...` property. There are 7: in `createParis`, the `Grandma's` create, the `B` and `C` creates, the conflict test, the other-family test, and the adopt test. Where a property is the last item on a single line, delete the preceding `, ` as well, for example `memberIds: [seed.ava], listName: 'B' })` → `memberIds: [seed.ava] })`.
2. In `'creates a destination with a new list, members, trip link and participants'`, change `expect(list.name).toBe('Spring Break – Paris');` to `expect(list.name).toBe('Spring Break · Paris');`.
3. Replace the whole `it('adopts an existing list and keeps its name', ...)` test with:

```ts
  it('adopts an existing list and renames it to the label', async () => {
    const listId = await createList(seed.familyId, 'Our big list', [seed.dad]);
    const dest = await repo.create({
      tripId: seed.tripId,
      familyId: seed.familyId,
      name: 'Paris',
      memberIds: [seed.dad, seed.mom],
      packingListId: listId,
    });
    expect(dest.packingListId).toBe(listId);
    const list = await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [listId]);
    expect(list.name).toBe('Spring Break · Paris');
  });

  it('names the list after the trip alone when the destination has the trip name', async () => {
    const dest = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: ' spring break ', memberIds: [seed.dad] });
    const list = await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [dest.packingListId]);
    expect(list.name).toBe('Spring Break');
  });

  it('allows a destination with no members only when asked', async () => {
    await expect(repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'X', memberIds: [] }))
      .rejects.toThrow('members_required');
    const db = await getDb();
    const id = await repo.insertDestinationTx(db, { tripId: seed.tripId, familyId: seed.familyId, name: 'X', memberIds: [], allowNoMembers: true });
    expect((await repo.getById(id))!.memberIds).toEqual([]);
  });

  it('adopts a list from a one-destination trip and retires that trip', async () => {
    const trips = new TripRepository();
    const shell = await trips.createTrip(seed.familyId, { name: 'Beach' });
    const db = await getDb();
    const shellDestination = await repo.insertDestinationTx(db, { tripId: shell.id, familyId: seed.familyId, name: 'Beach', memberIds: [seed.dad] });
    const listId = (await repo.getById(shellDestination))!.packingListId;

    const adopted = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Beach', memberIds: [seed.dad], packingListId: listId });

    expect(adopted.packingListId).toBe(listId);
    expect(await repo.getById(shellDestination)).toBeNull();
    expect(await trips.getTripById(shell.id)).toBeUndefined();
    const oldLink = await seed.db.get(`SELECT 1 AS x FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [shell.id, listId]);
    expect(oldLink).toBeUndefined();
    expect((await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [listId])).name).toBe('Spring Break · Beach');
  });

  it('refuses to adopt a list from a trip with several destinations', async () => {
    const trips = new TripRepository();
    const other = await trips.createTrip(seed.familyId, { name: 'Summer' });
    const a = await repo.create({ tripId: other.id, familyId: seed.familyId, name: 'A', memberIds: [seed.dad] });
    await repo.create({ tripId: other.id, familyId: seed.familyId, name: 'B', memberIds: [seed.mom] });
    await expect(
      repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'A', memberIds: [seed.dad], packingListId: a.packingListId })
    ).rejects.toThrow('list_already_destination');
  });

  it('syncListNamesTx rewrites only the names that changed', async () => {
    const paris = await createParis();
    const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.ava] });
    await seed.db.run(`UPDATE trips SET name = 'Easter' WHERE id = ?`, [seed.tripId]);
    await seed.db.run(`UPDATE packing_lists SET name = 'Easter · Rome' WHERE id = ?`, [rome.packingListId]);
    const db = await getDb();
    const changed = await repo.syncListNamesTx(db, seed.tripId);
    expect(changed).toEqual([paris.packingListId]);
    expect((await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [paris.packingListId])).name).toBe('Easter · Paris');
  });
```

4. In the existing summary test (the one ending with `destinationCount: 1, });` around line 158), add these three properties to the expected object, directly after `destinationCount: 1,`:

```ts
      color: 'blue',
      tripStartDate: '2027-03-01',
      tripEndDate: '2027-03-08',
```

`createTrip(familyId, { name: 'Beach' })` without dates compiles only after Step 3 changes `TripRepository.createTrip`. That is expected: these tests fail until then.

- [ ] **Step 2: Add failing `moveMembersTx` tests**

In `server/services/tripSplitService.test.ts`:

- Change the import line `import { splitListIntoTrip, moveSharedItem, moveAllSharedItems, MoveValidationError } from './tripSplitService';` to:

```ts
import { splitListIntoTrip, moveSharedItem, moveAllSharedItems, MoveValidationError, moveMembersTx, pullMembersIntoDestinationTx } from './tripSplitService';
```

- Append this block at the end of the file:

```ts
describe('moveMembersTx', () => {
  let seed: Awaited<ReturnType<typeof seedFamilyTrip>>;
  let from: string;
  let to: string;

  beforeEach(async () => {
    seed = await seedFamilyTrip();
    from = await createList(seed.familyId, 'From', [seed.dad, seed.mom, seed.ava]);
    to = await createList(seed.familyId, 'To', [seed.leo]);
  });

  afterEach(async () => {
    await closeDb();
  });

  const membersOf = async (listId: string) =>
    (await seed.db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ? ORDER BY member_id`, [listId])).map((r: any) => r.member_id);

  it('moves a row whose owners all move, with its checks and history', async () => {
    const teddy = await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] });
    const row = await addToList(from, teddy);
    await setCheck(row, seed.ava, true);
    await seed.db.run(
      `INSERT INTO packing_list_audit_log (packing_list_id, packing_list_item_id, action, applies_to_scope) VALUES (?, ?, 'check', 'member')`,
      [from, row]
    );

    const db = await getDb();
    await moveMembersTx(db, { fromListId: from, toListId: to, memberIds: [seed.ava] });

    expect((await listRows(to)).map(r => r.id)).toEqual([row]);
    expect(await listRows(from)).toEqual([]);
    expect(await checksFor(row)).toEqual([{ member_id: seed.ava, checked: 1 }]);
    const audit = await seed.db.get(`SELECT packing_list_id FROM packing_list_audit_log WHERE packing_list_item_id = ?`, [row]);
    expect(audit.packing_list_id).toBe(to);
    expect(await membersOf(from)).toEqual([seed.dad, seed.mom].sort());
    expect(await membersOf(to)).toEqual([seed.ava, seed.leo].sort());
  });

  it('copies a row for the movers when some owners stay, taking only their checks', async () => {
    const toothbrush = await createMasterItem(seed.familyId, 'Toothbrush', { memberIds: [seed.dad, seed.ava] });
    const row = await addToList(from, toothbrush);
    await setCheck(row, seed.dad, true);
    await setCheck(row, seed.ava, true);

    const db = await getDb();
    await moveMembersTx(db, { fromListId: from, toListId: to, memberIds: [seed.ava] });

    expect((await listRows(from)).map(r => r.id)).toEqual([row]);
    const [copy] = await listRows(to);
    expect(copy.item_id).toBe(toothbrush);
    expect(await checksFor(row)).toEqual([{ member_id: seed.dad, checked: 1 }]);
    expect(await checksFor(copy.id)).toEqual([{ member_id: seed.ava, checked: 1 }]);
  });

  it('leaves whole-family rows and rows of people who stay', async () => {
    const sunscreen = await createMasterItem(seed.familyId, 'Sunscreen', { wholeFamily: true });
    const passport = await createMasterItem(seed.familyId, 'Passport', { memberIds: [seed.dad] });
    const shared = await addToList(from, sunscreen);
    const own = await addToList(from, passport);

    const db = await getDb();
    await moveMembersTx(db, { fromListId: from, toListId: to, memberIds: [seed.ava] });

    expect((await listRows(from)).map(r => r.id).sort()).toEqual([shared, own].sort());
    expect(await listRows(to)).toEqual([]);
  });

  it('merges into a row the target already has for the same item', async () => {
    const toothbrush = await createMasterItem(seed.familyId, 'Toothbrush', { memberIds: [seed.ava, seed.leo] });
    const source = await addToList(from, toothbrush);
    const target = await addToList(to, toothbrush);
    await setCheck(source, seed.ava, true);

    const db = await getDb();
    await moveMembersTx(db, { fromListId: from, toListId: to, memberIds: [seed.ava] });

    expect(await listRows(from)).toEqual([]);
    expect((await listRows(to)).map(r => r.id)).toEqual([target]);
    expect(await checksFor(target)).toEqual([{ member_id: seed.ava, checked: 1 }]);
  });
});

describe('pullMembersIntoDestinationTx', () => {
  let seed: Awaited<ReturnType<typeof seedFamilyTrip>>;
  const repo = new TripDestinationRepository();

  beforeEach(async () => {
    seed = await seedFamilyTrip();
  });

  afterEach(async () => {
    await closeDb();
  });

  it('pulls people and their items from other destinations', async () => {
    const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad, seed.ava] });
    const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
    const teddy = await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] });
    const row = await addToList(paris.packingListId, teddy);

    const db = await getDb();
    const touched = await pullMembersIntoDestinationTx(db, { tripId: seed.tripId, destinationId: rome.id, memberIds: [seed.mom, seed.ava] });

    expect(touched).toEqual([paris.packingListId]);
    expect((await listRows(rome.packingListId)).map(r => r.id)).toEqual([row]);
    expect((await repo.getById(paris.id))!.memberIds).toEqual([seed.dad]);
  });

  it('refuses to leave another destination empty', async () => {
    const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
    const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
    const db = await getDb();
    await expect(pullMembersIntoDestinationTx(db, { tripId: seed.tripId, destinationId: rome.id, memberIds: [seed.dad] }))
      .rejects.toThrow('would_empty_destination');
    expect((await repo.getById(paris.id))!.memberIds).toEqual([seed.dad]);
  });
});
```

The audit insert relies on the `packing_list_audit_log` columns `packing_list_id`, `packing_list_item_id`, `action` and `applies_to_scope`. The other columns are nullable or have defaults.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run server/repositories/tripDestinationRepository.test.ts server/services/tripSplitService.test.ts`
Expected: FAIL. The new repository tests fail on the list names and on `syncListNamesTx is not a function`, and the new service tests fail with `moveMembersTx is not a function`.

- [ ] **Step 4: Let `TripRepository.createTrip` accept missing dates**

In `server/repositories/tripRepository.ts`:

1. In `interface Trip`, change:

```ts
  startDate: string;
  endDate: string;
```

to:

```ts
  startDate: string | null;
  endDate: string | null;
```

2. In the `createTrip` parameter type, change `startDate: string;` / `endDate: string;` to `startDate?: string | null;` / `endDate?: string | null;`.
3. In the `createTrip` insert values, change `trip.startDate, trip.endDate,` to `trip.startDate || null, trip.endDate || null,`.

- [ ] **Step 5: Replace `server/repositories/tripDestinationRepository.ts`**

```ts
import { v4 as uuidv4 } from 'uuid';
import type { Database } from 'sqlite';
import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';
import { destinationListLabel } from '../utils/destinationLabel';

export const DESTINATION_COLORS = ['blue', 'green', 'orange', 'grape', 'teal', 'red'];

export interface TripDestination {
  id: string;
  tripId: string;
  name: string;
  color: string;
  position: number;
  packingListId: string;
  memberIds: string[];
}

export interface ListTripContext {
  tripId: string;
  tripName: string;
  destinations: TripDestination[];
}

export interface ListTripSummary {
  tripId: string;
  tripName: string;
  destinationId: string;
  destinationName: string;
  position: number;
  destinationCount: number;
  color: string | null;
  tripStartDate: string | null;
  tripEndDate: string | null;
}

export interface InsertDestinationInput {
  tripId: string;
  familyId: string;
  name: string;
  memberIds: string[];
  packingListId?: string;
  /** Lets a destination start with no travelers (split targets, shell trips, copies). */
  allowNoMembers?: boolean;
}

export class DestinationConflictError extends Error {
  constructor(public memberId: string, public destinationId: string) {
    super('member_in_other_destination');
  }
}

export class DestinationValidationError extends Error {}

const SELECT_DESTINATION = `SELECT id, trip_id AS tripId, name, color, position, packing_list_id AS packingListId FROM trip_destinations`;

export class TripDestinationRepository {
  async listForTrip(tripId: string): Promise<TripDestination[]> {
    const db = await getDb();
    const rows = await db.all(
      `${SELECT_DESTINATION} WHERE trip_id = ? AND deleted_at IS NULL ORDER BY position, created_at`,
      [tripId]
    );
    return Promise.all(rows.map((row: any) => this.withMembers(db, row)));
  }

  async getById(id: string): Promise<TripDestination | null> {
    const db = await getDb();
    const row = await db.get(`${SELECT_DESTINATION} WHERE id = ? AND deleted_at IS NULL`, [id]);
    return row ? this.withMembers(db, row) : null;
  }

  async findByPackingListId(listId: string): Promise<TripDestination | null> {
    const db = await getDb();
    const row = await db.get(
      `SELECT d.id, d.trip_id AS tripId, d.name, d.color, d.position, d.packing_list_id AS packingListId
       FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
       WHERE d.packing_list_id = ? AND d.deleted_at IS NULL AND t.deleted_at IS NULL`,
      [listId]
    );
    return row ? this.withMembers(db, row) : null;
  }

  async getTripContextForList(listId: string): Promise<ListTripContext | null> {
    const destination = await this.findByPackingListId(listId);
    if (!destination) return null;
    const db = await getDb();
    const trip = await db.get(`SELECT name FROM trips WHERE id = ?`, [destination.tripId]);
    return {
      tripId: destination.tripId,
      tripName: trip?.name ?? '',
      destinations: await this.listForTrip(destination.tripId),
    };
  }

  async getListSummariesForFamily(familyId: string): Promise<Map<string, ListTripSummary>> {
    const db = await getDb();
    const rows = await db.all(
      `SELECT d.packing_list_id AS listId, d.trip_id AS tripId, t.name AS tripName, d.id AS destinationId,
              d.name AS destinationName, d.position, d.color, t.start_date AS tripStartDate, t.end_date AS tripEndDate,
              (SELECT COUNT(*) FROM trip_destinations d2 JOIN packing_lists pl2 ON pl2.id = d2.packing_list_id
                WHERE d2.trip_id = d.trip_id AND d2.deleted_at IS NULL AND pl2.deleted_at IS NULL) AS destinationCount
       FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
       WHERE t.family_id = ? AND d.deleted_at IS NULL AND t.deleted_at IS NULL`,
      [familyId]
    );
    const result = new Map<string, ListTripSummary>();
    for (const { listId, ...summary } of rows as any[]) result.set(listId, summary);
    return result;
  }

  async findConflict(
    db: Database,
    tripId: string,
    memberIds: string[],
    exceptDestinationId: string | null = null
  ): Promise<DestinationConflictError | null> {
    if (memberIds.length === 0) return null;
    const placeholders = memberIds.map(() => '?').join(',');
    const row = await db.get(
      `SELECT d.id AS destinationId, plm.member_id AS memberId
       FROM trip_destinations d JOIN packing_list_members plm ON plm.packing_list_id = d.packing_list_id
       WHERE d.trip_id = ? AND d.deleted_at IS NULL AND d.id != ? AND plm.member_id IN (${placeholders})
       LIMIT 1`,
      [tripId, exceptDestinationId ?? '', ...memberIds]
    );
    return row ? new DestinationConflictError(row.memberId, row.destinationId) : null;
  }

  async create(input: InsertDestinationInput): Promise<TripDestination> {
    const db = await getDb();
    const id = await withTransaction(db, async () => {
      const conflict = await this.findConflict(db, input.tripId, input.memberIds);
      if (conflict) throw conflict;
      return this.insertDestinationTx(db, input);
    });
    return (await this.getById(id))!;
  }

  // Caller owns the transaction.
  async insertDestinationTx(db: Database, input: InsertDestinationInput): Promise<string> {
    if (!(input.allowNoMembers && input.memberIds.length === 0)) {
      await this.assertFamilyMembers(db, input.familyId, input.memberIds);
    }
    const now = new Date().toISOString();
    let listId = input.packingListId;
    if (listId) {
      const list = await db.get(
        `SELECT id FROM packing_lists WHERE id = ? AND family_id = ? AND deleted_at IS NULL`,
        [listId, input.familyId]
      );
      if (!list) throw new DestinationValidationError('list_not_found');
      await this.releaseFromLoneTripTx(db, listId, input.tripId, now);
    } else {
      listId = uuidv4();
      const trip = await db.get(`SELECT name FROM trips WHERE id = ?`, [input.tripId]);
      await db.run(
        `INSERT INTO packing_lists (id, family_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [listId, input.familyId, destinationListLabel(trip?.name, input.name), now, now]
      );
    }
    await this.writeMembersTx(db, listId, input.memberIds);
    await db.run(`INSERT OR IGNORE INTO trip_packing_lists (trip_id, packing_list_id) VALUES (?, ?)`, [input.tripId, listId]);
    const stats = await db.get(
      `SELECT COUNT(*) AS count, COALESCE(MAX(position), -1) AS maxPosition
       FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`,
      [input.tripId]
    );
    const usedColors = new Set(
      (await db.all(`SELECT color FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`, [input.tripId])).map(
        (r: any) => r.color
      )
    );
    const color =
      DESTINATION_COLORS.find(c => !usedColors.has(c)) ?? DESTINATION_COLORS[stats.count % DESTINATION_COLORS.length];
    const id = uuidv4();
    await db.run(
      `INSERT INTO trip_destinations (id, trip_id, name, color, position, packing_list_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.tripId, input.name, color, stats.maxPosition + 1, listId, now, now]
    );
    await this.ensureParticipantsTx(db, input.tripId, input.memberIds);
    await this.syncListNamesTx(db, input.tripId);
    return id;
  }

  /** Rewrites each destination list's name to its label. Returns the ids of lists whose name changed. */
  async syncListNamesTx(db: Database, tripId: string): Promise<string[]> {
    const trip = await db.get(`SELECT name FROM trips WHERE id = ?`, [tripId]);
    const rows = await db.all(
      `SELECT d.name, pl.id AS listId, pl.name AS listName
       FROM trip_destinations d JOIN packing_lists pl ON pl.id = d.packing_list_id
       WHERE d.trip_id = ? AND d.deleted_at IS NULL AND pl.deleted_at IS NULL`,
      [tripId]
    );
    const changed: string[] = [];
    const now = new Date().toISOString();
    for (const row of rows as { name: string; listId: string; listName: string }[]) {
      const label = destinationListLabel(trip?.name, row.name);
      if (label === row.listName) continue;
      await db.run(`UPDATE packing_lists SET name = ?, updated_at = ? WHERE id = ?`, [label, now, row.listId]);
      changed.push(row.listId);
    }
    return changed;
  }

  async update(
    id: string,
    familyId: string,
    updates: { name?: string; color?: string; position?: number; memberIds?: string[] }
  ): Promise<TripDestination> {
    const db = await getDb();
    const existing = await this.getById(id);
    if (!existing) throw new DestinationValidationError('not_found');
    await withTransaction(db, async () => {
      if (typeof updates.name === 'string') {
        await db.run(`UPDATE trip_destinations SET name = ?, updated_at = ? WHERE id = ?`, [updates.name, new Date().toISOString(), id]);
        await this.syncListNamesTx(db, existing.tripId);
      }
      await this.updateTx(db, existing, familyId, updates);
    });
    return (await this.getById(id))!;
  }

  // Caller owns the transaction. Name changes go through tripListService.renameDestinationTx.
  async updateTx(
    db: Database,
    existing: TripDestination,
    familyId: string,
    updates: { color?: string; position?: number; memberIds?: string[] }
  ): Promise<void> {
    if (updates.memberIds) {
      const conflict = await this.findConflict(db, existing.tripId, updates.memberIds, existing.id);
      if (conflict) throw conflict;
      await this.assertFamilyMembers(db, familyId, updates.memberIds);
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    if (typeof updates.color === 'string') { fields.push('color = ?'); values.push(updates.color); }
    if (typeof updates.position === 'number') { fields.push('position = ?'); values.push(updates.position); }
    if (fields.length > 0) {
      await db.run(
        `UPDATE trip_destinations SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`,
        [...values, new Date().toISOString(), existing.id]
      );
    }
    if (updates.memberIds) {
      await this.writeMembersTx(db, existing.packingListId, updates.memberIds);
      await this.ensureParticipantsTx(db, existing.tripId, updates.memberIds);
    }
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.run(`UPDATE trip_destinations SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
  }

  async ensureParticipantsTx(db: Database, tripId: string, memberIds: string[]): Promise<void> {
    for (const userId of memberIds) {
      const existing = await db.get(`SELECT id FROM trip_participants WHERE trip_id = ? AND user_id = ?`, [tripId, userId]);
      if (existing) continue;
      const user = await db.get(`SELECT name, username FROM users WHERE id = ?`, [userId]);
      await db.run(
        `INSERT INTO trip_participants (id, trip_id, user_id, display_name, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
        [uuidv4(), tripId, userId, user?.name || user?.username || 'Traveler']
      );
    }
  }

  // A list may join another trip only if it is the sole destination of its current trip; that trip is retired.
  private async releaseFromLoneTripTx(db: Database, listId: string, tripId: string, now: string): Promise<void> {
    const taken = await db.get(
      `SELECT d.id, d.trip_id AS tripId FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
       WHERE d.packing_list_id = ? AND d.deleted_at IS NULL AND t.deleted_at IS NULL`,
      [listId]
    );
    if (!taken) return;
    const { n } = await db.get(
      `SELECT COUNT(*) AS n FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`,
      [taken.tripId]
    );
    if (taken.tripId === tripId || n !== 1) throw new DestinationValidationError('list_already_destination');
    await db.run(`UPDATE trip_destinations SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, taken.id]);
    await db.run(`UPDATE trips SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, taken.tripId]);
    await db.run(`DELETE FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [taken.tripId, listId]);
  }

  private async withMembers(db: Database, row: any): Promise<TripDestination> {
    const members = await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [row.packingListId]);
    return { ...row, memberIds: members.map((m: any) => m.member_id) };
  }

  private async assertFamilyMembers(db: Database, familyId: string, memberIds: string[]): Promise<void> {
    if (!Array.isArray(memberIds) || memberIds.length === 0) throw new DestinationValidationError('members_required');
    const unique = Array.from(new Set(memberIds));
    const placeholders = unique.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT id FROM users WHERE familyId = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
      [familyId, ...unique]
    );
    if (rows.length !== unique.length) throw new DestinationValidationError('invalid_members');
  }

  private async writeMembersTx(db: Database, listId: string, memberIds: string[]): Promise<void> {
    await db.run(`DELETE FROM packing_list_members WHERE packing_list_id = ?`, [listId]);
    for (const memberId of memberIds) {
      await db.run(`INSERT OR IGNORE INTO packing_list_members (packing_list_id, member_id) VALUES (?, ?)`, [listId, memberId]);
    }
  }
}
```

- [ ] **Step 6: Replace `server/services/tripSplitService.ts`**

```ts
import { v4 as uuidv4 } from 'uuid';
import type { Database } from 'sqlite';
import { getDb } from '../db';
import { broadcastEvent } from '../sse';
import { withTransaction } from '../utils/transaction';
import {
  TripDestination,
  TripDestinationRepository,
  DestinationValidationError,
} from '../repositories/tripDestinationRepository';

export interface SplitInput {
  tripId: string;
  tripName: string;
  familyId: string;
  sourceListId: string;
  destinations: { name: string; memberIds: string[] }[];
  sharedItemsDestinationIndex: number;
}

export interface SplitResult {
  destinations: TripDestination[];
  skippedCount: number;
}

export class MoveValidationError extends Error {}

const destinationRepo = new TripDestinationRepository();

export function notify(listIds: string[], change: 'split' | 'move' | 'destination') {
  for (const listId of new Set(listIds)) {
    try {
      broadcastEvent({ type: 'packing_list_changed', listId, data: { change } });
    } catch {
      // best effort
    }
  }
}

function validateSplitInput(input: SplitInput) {
  if (!Array.isArray(input.destinations) || input.destinations.length < 2) {
    throw new DestinationValidationError('need_two_destinations');
  }
  const seen = new Set<string>();
  for (const dest of input.destinations) {
    if (!dest || typeof dest.name !== 'string' || !dest.name.trim()) {
      throw new DestinationValidationError('destination_name_required');
    }
    if (!Array.isArray(dest.memberIds) || dest.memberIds.length === 0) {
      throw new DestinationValidationError('members_required');
    }
    for (const memberId of dest.memberIds) {
      if (seen.has(memberId)) throw new DestinationValidationError('member_in_two_destinations');
      seen.add(memberId);
    }
  }
  const index = input.sharedItemsDestinationIndex;
  if (!Number.isInteger(index) || index < 0 || index >= input.destinations.length) {
    throw new DestinationValidationError('invalid_shared_destination');
  }
}

async function moveRowTx(db: Database, pliId: string, listId: string) {
  await db.run(`UPDATE packing_list_items SET packing_list_id = ? WHERE id = ?`, [listId, pliId]);
}

async function copyRowForMembersTx(db: Database, pliId: string, listId: string, memberIds: string[]) {
  const newId = uuidv4();
  await db.run(
    `INSERT INTO packing_list_items (id, packing_list_id, item_id, display_name, checked, added_during_packing, not_needed, created_at)
     SELECT ?, ?, item_id, display_name, 0, added_during_packing, 0, created_at FROM packing_list_items WHERE id = ?`,
    [newId, listId, pliId]
  );
  await db.run(
    `INSERT INTO packing_list_item_templates (packing_list_item_id, template_id, created_at)
     SELECT ?, template_id, created_at FROM packing_list_item_templates WHERE packing_list_item_id = ?`,
    [newId, pliId]
  );
  const placeholders = memberIds.map(() => '?').join(',');
  await db.run(
    `UPDATE packing_list_item_checks SET packing_list_item_id = ? WHERE packing_list_item_id = ? AND member_id IN (${placeholders})`,
    [newId, pliId, ...memberIds]
  );
  await db.run(
    `UPDATE packing_list_item_not_needed SET packing_list_item_id = ? WHERE packing_list_item_id = ? AND member_id IN (${placeholders})`,
    [newId, pliId, ...memberIds]
  );
}

// Hands the movers' per-person checks and not-needed marks to an existing row; the target's own rows win.
async function mergeMemberStateTx(db: Database, fromPliId: string, toPliId: string, memberIds: string[]) {
  const placeholders = memberIds.map(() => '?').join(',');
  for (const table of ['packing_list_item_checks', 'packing_list_item_not_needed']) {
    await db.run(
      `DELETE FROM ${table} WHERE packing_list_item_id = ? AND member_id IN (${placeholders})
       AND member_id IN (SELECT member_id FROM ${table} WHERE packing_list_item_id = ? AND member_id IS NOT NULL)`,
      [fromPliId, ...memberIds, toPliId]
    );
    await db.run(
      `UPDATE ${table} SET packing_list_item_id = ? WHERE packing_list_item_id = ? AND member_id IN (${placeholders})`,
      [toPliId, fromPliId, ...memberIds]
    );
  }
}

async function dropMergedRowTx(db: Database, fromPliId: string, toPliId: string, toListId: string) {
  await db.run(
    `UPDATE packing_list_audit_log SET packing_list_id = ?, packing_list_item_id = ? WHERE packing_list_item_id = ?`,
    [toListId, toPliId, fromPliId]
  );
  for (const table of ['packing_list_item_checks', 'packing_list_item_not_needed', 'packing_list_item_templates']) {
    await db.run(`DELETE FROM ${table} WHERE packing_list_item_id = ?`, [fromPliId]);
  }
  await db.run(`DELETE FROM packing_list_items WHERE id = ?`, [fromPliId]);
}

/**
 * Moves people from one list to another, taking their personal rows with them.
 * Caller owns the transaction.
 */
export async function moveMembersTx(
  db: Database,
  input: { fromListId: string; toListId: string; memberIds: string[] }
): Promise<void> {
  const movers = Array.from(new Set(input.memberIds));
  if (movers.length === 0 || input.fromListId === input.toListId) return;
  const sourceMembers = new Set(
    ((await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [input.fromListId])) as { member_id: string }[])
      .map(r => r.member_id)
  );
  const moving = new Set(movers.filter(m => sourceMembers.has(m)));
  if (moving.size > 0) {
    const rows = (await db.all(
      `SELECT pli.id, pli.item_id AS itemId FROM packing_list_items pli
       LEFT JOIN item_whole_family iwf ON iwf.item_id = pli.item_id
       WHERE pli.packing_list_id = ? AND pli.item_id IS NOT NULL AND iwf.item_id IS NULL
       ORDER BY pli.created_at`,
      [input.fromListId]
    )) as { id: string; itemId: string }[];
    for (const row of rows) {
      const owners = ((await db.all(`SELECT member_id FROM item_members WHERE item_id = ?`, [row.itemId])) as { member_id: string }[])
        .map(o => o.member_id)
        .filter(m => sourceMembers.has(m));
      const ownersMoving = owners.filter(m => moving.has(m));
      if (ownersMoving.length === 0) continue;
      const fullMove = ownersMoving.length === owners.length;
      const existing = await db.get(
        `SELECT id FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`,
        [input.toListId, row.itemId]
      );
      if (existing) {
        await mergeMemberStateTx(db, row.id, existing.id, ownersMoving);
        if (fullMove) await dropMergedRowTx(db, row.id, existing.id, input.toListId);
      } else if (fullMove) {
        await moveRowTx(db, row.id, input.toListId);
        await db.run(`UPDATE packing_list_audit_log SET packing_list_id = ? WHERE packing_list_item_id = ?`, [input.toListId, row.id]);
      } else {
        await copyRowForMembersTx(db, row.id, input.toListId, ownersMoving);
      }
    }
  }
  const placeholders = movers.map(() => '?').join(',');
  await db.run(
    `DELETE FROM packing_list_members WHERE packing_list_id = ? AND member_id IN (${placeholders})`,
    [input.fromListId, ...movers]
  );
  for (const memberId of movers) {
    await db.run(`INSERT OR IGNORE INTO packing_list_members (packing_list_id, member_id) VALUES (?, ?)`, [input.toListId, memberId]);
  }
}

/**
 * Moves `memberIds` out of every other destination of the trip into `destinationId`, items included.
 * Returns the lists it changed. Caller owns the transaction.
 */
export async function pullMembersIntoDestinationTx(
  db: Database,
  input: { tripId: string; destinationId: string; memberIds: string[] }
): Promise<string[]> {
  const target = await db.get(`SELECT packing_list_id AS listId FROM trip_destinations WHERE id = ?`, [input.destinationId]);
  if (!target) throw new DestinationValidationError('not_found');
  const others = (await db.all(
    `SELECT id, packing_list_id AS listId FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL AND id != ?`,
    [input.tripId, input.destinationId]
  )) as { id: string; listId: string }[];
  const touched: string[] = [];
  for (const other of others) {
    const members = ((await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [other.listId])) as { member_id: string }[])
      .map(r => r.member_id);
    const movers = members.filter(m => input.memberIds.includes(m));
    if (movers.length === 0) continue;
    if (movers.length === members.length) throw new DestinationValidationError('would_empty_destination');
    await moveMembersTx(db, { fromListId: other.listId, toListId: target.listId, memberIds: movers });
    touched.push(other.listId);
  }
  return touched;
}

async function countUnownedRowsTx(db: Database, listId: string, assigned: Set<string>): Promise<number> {
  const rows = (await db.all(
    `SELECT pli.item_id AS itemId FROM packing_list_items pli
     LEFT JOIN item_whole_family iwf ON iwf.item_id = pli.item_id
     WHERE pli.packing_list_id = ? AND iwf.item_id IS NULL`,
    [listId]
  )) as { itemId: string | null }[];
  let count = 0;
  for (const row of rows) {
    const owners = row.itemId
      ? ((await db.all(`SELECT member_id FROM item_members WHERE item_id = ?`, [row.itemId])) as { member_id: string }[])
      : [];
    if (!owners.some(o => assigned.has(o.member_id))) count++;
  }
  return count;
}

export async function splitListIntoTrip(input: SplitInput): Promise<SplitResult> {
  validateSplitInput(input);
  const db = await getDb();
  const conflict = await destinationRepo.findConflict(db, input.tripId, input.destinations.flatMap(d => d.memberIds));
  if (conflict) throw conflict;

  const listIds: string[] = [];
  const skippedCount = await withTransaction(db, async () => {
    const sourceMembers = (await db.all(
      `SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`,
      [input.sourceListId]
    )) as { member_id: string }[];
    const assigned = new Set(input.destinations.flatMap(d => d.memberIds));
    if (sourceMembers.some(m => !assigned.has(m.member_id))) {
      throw new DestinationValidationError('unassigned_member');
    }
    const skipped = await countUnownedRowsTx(db, input.sourceListId, assigned);
    // The source list becomes the first destination with everyone on it; the others start empty and pull their people over.
    for (const [index, dest] of input.destinations.entries()) {
      const destinationId = await destinationRepo.insertDestinationTx(db, {
        tripId: input.tripId,
        familyId: input.familyId,
        name: dest.name.trim(),
        memberIds: index === 0 ? Array.from(assigned) : [],
        allowNoMembers: index !== 0,
        packingListId: index === 0 ? input.sourceListId : undefined,
      });
      const row = await db.get(`SELECT packing_list_id AS listId FROM trip_destinations WHERE id = ?`, [destinationId]);
      listIds.push(row.listId);
    }
    for (const [index, dest] of input.destinations.entries()) {
      if (index === 0) continue;
      await moveMembersTx(db, { fromListId: listIds[0], toListId: listIds[index], memberIds: dest.memberIds });
    }
    if (input.sharedItemsDestinationIndex !== 0) {
      await moveAllSharedItemsTx(db, listIds[0], listIds[input.sharedItemsDestinationIndex]);
    }
    return skipped;
  });

  notify(listIds, 'split');
  return { destinations: await destinationRepo.listForTrip(input.tripId), skippedCount };
}

export async function validateSameTripDifferentDestinations(fromListId: string, toListId: string) {
  const from = await destinationRepo.findByPackingListId(fromListId);
  const to = await destinationRepo.findByPackingListId(toListId);
  if (!from || !to || from.tripId !== to.tripId || from.id === to.id) {
    throw new MoveValidationError('not_same_trip');
  }
}

async function moveSharedRowTx(db: Database, row: { id: string; itemId: string | null }, toListId: string): Promise<string> {
  const existing = row.itemId
    ? await db.get(`SELECT id FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`, [toListId, row.itemId])
    : null;
  if (!existing) {
    await moveRowTx(db, row.id, toListId);
    await db.run(`UPDATE packing_list_audit_log SET packing_list_id = ? WHERE packing_list_item_id = ?`, [toListId, row.id]);
    return row.id;
  }
  const sourceChecked = await db.get(
    `SELECT 1 AS yes FROM packing_list_item_checks WHERE packing_list_item_id = ? AND checked = 1 LIMIT 1`,
    [row.id]
  );
  const targetChecked = await db.get(
    `SELECT 1 AS yes FROM packing_list_item_checks WHERE packing_list_item_id = ? AND checked = 1 LIMIT 1`,
    [existing.id]
  );
  if (sourceChecked && !targetChecked) {
    await db.run(`DELETE FROM packing_list_item_checks WHERE packing_list_item_id = ?`, [existing.id]);
    await db.run(
      `INSERT INTO packing_list_item_checks (id, packing_list_item_id, member_id, checked, checked_at) VALUES (?, ?, NULL, 1, ?)`,
      [uuidv4(), existing.id, new Date().toISOString()]
    );
  }
  const wholeNotNeeded = `member_id IS NULL AND not_needed = 1`;
  const sourceNotNeeded = await db.get(
    `SELECT id FROM packing_list_item_not_needed WHERE packing_list_item_id = ? AND ${wholeNotNeeded} LIMIT 1`,
    [row.id]
  );
  const targetNotNeeded = await db.get(
    `SELECT 1 AS yes FROM packing_list_item_not_needed WHERE packing_list_item_id = ? AND ${wholeNotNeeded} LIMIT 1`,
    [existing.id]
  );
  if (sourceNotNeeded && !targetNotNeeded) {
    await db.run(`UPDATE packing_list_item_not_needed SET packing_list_item_id = ? WHERE id = ?`, [existing.id, sourceNotNeeded.id]);
  }
  await db.run(
    `UPDATE packing_list_audit_log SET packing_list_id = ?, packing_list_item_id = ? WHERE packing_list_item_id = ?`,
    [toListId, existing.id, row.id]
  );
  for (const table of ['packing_list_item_checks', 'packing_list_item_not_needed', 'packing_list_item_templates']) {
    await db.run(`DELETE FROM ${table} WHERE packing_list_item_id = ?`, [row.id]);
  }
  await db.run(`DELETE FROM packing_list_items WHERE id = ?`, [row.id]);
  return existing.id;
}

export async function moveSharedItem(input: { fromListId: string; pliId: string; toListId: string }): Promise<{ id: string; listId: string }> {
  await validateSameTripDifferentDestinations(input.fromListId, input.toListId);
  const db = await getDb();
  const id = await withTransaction(db, async () => {
    const row = await db.get(
      `SELECT pli.id, pli.item_id AS itemId, CASE WHEN iwf.item_id IS NULL THEN 0 ELSE 1 END AS whole
       FROM packing_list_items pli LEFT JOIN item_whole_family iwf ON iwf.item_id = pli.item_id
       WHERE pli.id = ? AND pli.packing_list_id = ?`,
      [input.pliId, input.fromListId]
    );
    if (!row) throw new MoveValidationError('item_not_found');
    if (!row.whole) throw new MoveValidationError('personal_item');
    return moveSharedRowTx(db, row, input.toListId);
  });
  notify([input.fromListId, input.toListId], 'move');
  return { id, listId: input.toListId };
}

export async function moveAllSharedItemsTx(db: Database, fromListId: string, toListId: string): Promise<number> {
  const rows = (await db.all(
    `SELECT pli.id, pli.item_id AS itemId FROM packing_list_items pli JOIN item_whole_family iwf ON iwf.item_id = pli.item_id WHERE pli.packing_list_id = ?`,
    [fromListId]
  )) as { id: string; itemId: string | null }[];
  for (const row of rows) await moveSharedRowTx(db, row, toListId);
  return rows.length;
}

export async function moveAllSharedItems(fromListId: string, toListId: string): Promise<number> {
  await validateSameTripDifferentDestinations(fromListId, toListId);
  const db = await getDb();
  const count = await withTransaction(db, () => moveAllSharedItemsTx(db, fromListId, toListId));
  if (count > 0) notify([fromListId, toListId], 'move');
  return count;
}
```

- [ ] **Step 7: Remove the `listName` argument from the destination POST route**

In `server/routes/tripRoutes.ts`, inside `tripRouter.post('/:tripId/destinations', ...)`, delete this line:

```ts
      listName: `${req.trip!.name} – ${name.trim()}`,
```

- [ ] **Step 8: Update the existing "trip deleted" repository test for Task 4's behaviour, still keeping it green now**

Leave `'drops destinations but keeps their lists when the trip is deleted'` unchanged in this task. Task 4 changes `TripRepository.deleteTrip` and updates that test.

- [ ] **Step 9: Run the tests and watch them pass**

Run: `npx vitest run server/repositories/tripDestinationRepository.test.ts server/services/tripSplitService.test.ts server/__tests__/trip-destinations.routes.test.ts server/repositories/tripRepository.test.ts`
Expected: PASS. The split tests still pass, including:
- `'moves personal items to the owner destination and copies shared-owner items with their checks'`, where the Toothbrush copy carries only Ava's check and not-needed row;
- `'rolls back items already moved when distribution fails midway'`, where `copyRowForMembersTx` still issues `UPDATE packing_list_item_not_needed`.

- [ ] **Step 10: Type check the server**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no output. If `server/routes.ts` or another file still passes `listName`, remove that property in the same way as Step 7.

- [ ] **Step 11: Commit**

```bash
git add server/repositories/tripDestinationRepository.ts server/repositories/tripDestinationRepository.test.ts server/repositories/tripRepository.ts server/services/tripSplitService.ts server/services/tripSplitService.test.ts server/routes/tripRoutes.ts
git commit -m "feat: name destination lists by label and move people with their items

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: `tripListService`: trip-level rules in one place

This task adds a service that holds the trip-level rules: creating a trip with its first destination, wrapping a list in a shell trip, keeping names in step on rename, deleting a destination (including re-homing its list), and copying a trip. The routes in Tasks 5–7 call it.

**Files:**
- Create: `server/services/tripListService.ts`
- Create: `server/services/tripListService.test.ts`
- Modify: `server/repositories/tripRepository.ts` (`deleteTrip` also soft-deletes lists)
- Modify: `server/repositories/tripDestinationRepository.test.ts` (the "trip deleted" test)

- [ ] **Step 1: Write the failing service tests**

Create `server/services/tripListService.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { closeDb, getDb } from '../db';
import { withTransaction } from '../utils/transaction';
import { TripDestinationRepository } from '../repositories/tripDestinationRepository';
import { TripRepository } from '../repositories/tripRepository';
import {
  createTripWithFirstDestination,
  createShellTripForListTx,
  renameDestinationTx,
  applyTripRenameTx,
  createDestination,
  updateDestination,
  deleteDestinationTx,
  copyTrip,
  LastDestinationError,
} from './tripListService';
import { seedFamilyTrip, createList, createMasterItem, addToList, setCheck, listRows } from '../test-utils/destinationFixtures';

describe('tripListService', () => {
  let seed: Awaited<ReturnType<typeof seedFamilyTrip>>;
  const repo = new TripDestinationRepository();
  const trips = new TripRepository();

  beforeEach(async () => {
    seed = await seedFamilyTrip();
  });

  afterEach(async () => {
    await closeDb();
  });

  const listName = async (listId: string) => (await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [listId])).name;
  const tx = <T>(fn: (db: Awaited<ReturnType<typeof getDb>>) => Promise<T>) => getDb().then(db => withTransaction(db, () => fn(db)));

  describe('createTripWithFirstDestination', () => {
    it('creates a dateless trip with one destination named after it', async () => {
      const { tripId, destinationId } = await createTripWithFirstDestination({ familyId: seed.familyId, name: 'Beach', memberIds: [seed.dad, seed.mom] });
      const trip = await trips.getTripById(tripId);
      expect(trip).toMatchObject({ name: 'Beach', startDate: null, endDate: null });
      const [destination] = await repo.listForTrip(tripId);
      expect(destination).toMatchObject({ id: destinationId, name: 'Beach', position: 0, color: 'blue' });
      expect(destination.memberIds.sort()).toEqual([seed.dad, seed.mom].sort());
      expect(await listName(destination.packingListId)).toBe('Beach');
    });

    it('keeps dates when given', async () => {
      const { tripId } = await createTripWithFirstDestination({ familyId: seed.familyId, name: 'Ski', startDate: '2027-01-02', endDate: '2027-01-09', memberIds: [seed.dad] });
      expect(await trips.getTripById(tripId)).toMatchObject({ startDate: '2027-01-02', endDate: '2027-01-09' });
    });
  });

  it('createShellTripForListTx wraps a list in a planning trip with its members', async () => {
    const listId = await createList(seed.familyId, 'Camping', [seed.ava]);
    const tripId = await tx(db => createShellTripForListTx(db, { familyId: seed.familyId, listId, name: 'Camping' }));
    const trip = await trips.getTripById(tripId);
    expect(trip).toMatchObject({ name: 'Camping', status: 'planning', startDate: null });
    const [destination] = await repo.listForTrip(tripId);
    expect(destination).toMatchObject({ name: 'Camping', packingListId: listId, memberIds: [seed.ava] });
  });

  describe('renames', () => {
    it('renaming the only destination renames the trip when their names matched', async () => {
      const { tripId, destinationId } = await createTripWithFirstDestination({ familyId: seed.familyId, name: 'Beach', memberIds: [seed.dad] });
      const changed = await tx(db => renameDestinationTx(db, destinationId, 'Coast'));
      expect((await trips.getTripById(tripId))!.name).toBe('Coast');
      const [destination] = await repo.listForTrip(tripId);
      expect(await listName(destination.packingListId)).toBe('Coast');
      expect(changed).toEqual([destination.packingListId]);
    });

    it('renaming one of several destinations leaves the trip name', async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Spring Break', memberIds: [seed.dad] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      await tx(db => renameDestinationTx(db, paris.id, 'Paris'));
      expect((await trips.getTripById(seed.tripId))!.name).toBe('Spring Break');
      expect(await listName(paris.packingListId)).toBe('Spring Break · Paris');
      expect(await listName(rome.packingListId)).toBe('Spring Break · Rome');
    });

    it('renaming a trip renames destinations that matched the old name and relabels every list', async () => {
      const home = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Spring Break', memberIds: [seed.dad] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      await seed.db.run(`UPDATE trips SET name = 'Easter' WHERE id = ?`, [seed.tripId]);
      const changed = await tx(db => applyTripRenameTx(db, seed.tripId, 'Spring Break', 'Easter'));
      expect((await repo.getById(home.id))!.name).toBe('Easter');
      expect(await listName(home.packingListId)).toBe('Easter');
      expect(await listName(rome.packingListId)).toBe('Easter · Rome');
      expect(changed.sort()).toEqual([home.packingListId, rome.packingListId].sort());
    });
  });

  describe('createDestination', () => {
    it('moves a person and their items when moveFrom is set', async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad, seed.ava] });
      const teddy = await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] });
      const row = await addToList(paris.packingListId, teddy);
      await setCheck(row, seed.ava, true);

      const { destinationId, touchedListIds } = await createDestination({
        tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.ava], moveFrom: true,
      });

      const rome = (await repo.getById(destinationId))!;
      expect((await listRows(rome.packingListId)).map(r => r.id)).toEqual([row]);
      expect((await repo.getById(paris.id))!.memberIds).toEqual([seed.dad]);
      expect(touchedListIds.sort()).toEqual([paris.packingListId, rome.packingListId].sort());
    });

    it('rejects a person from another destination without moveFrom', async () => {
      await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      await expect(createDestination({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.dad] }))
        .rejects.toThrow('member_in_other_destination');
    });

    it("moves whole-family items to the new list when sharedItemsTo is 'new' and the trip had one destination", async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      const sunscreen = await createMasterItem(seed.familyId, 'Sunscreen', { wholeFamily: true });
      const row = await addToList(paris.packingListId, sunscreen);
      const { destinationId } = await createDestination({
        tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom], sharedItemsTo: 'new',
      });
      const rome = (await repo.getById(destinationId))!;
      expect((await listRows(rome.packingListId)).map(r => r.id)).toEqual([row]);
      expect(await listRows(paris.packingListId)).toEqual([]);
    });

    it("keeps whole-family items by default", async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      const row = await addToList(paris.packingListId, await createMasterItem(seed.familyId, 'Sunscreen', { wholeFamily: true }));
      await createDestination({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      expect((await listRows(paris.packingListId)).map(r => r.id)).toEqual([row]);
    });
  });

  describe('updateDestination', () => {
    it('pulls a person with their items when moveFrom is set', async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad, seed.ava] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      const row = await addToList(paris.packingListId, await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] }));

      const touched = await updateDestination({ destinationId: rome.id, familyId: seed.familyId, memberIds: [seed.mom, seed.ava], moveFrom: true });

      expect((await listRows(rome.packingListId)).map(r => r.id)).toEqual([row]);
      expect((await repo.getById(rome.id))!.memberIds.sort()).toEqual([seed.mom, seed.ava].sort());
      expect(touched.sort()).toEqual([paris.packingListId, rome.packingListId].sort());
    });

    it('fails with would_empty_destination and changes nothing', async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      await expect(updateDestination({ destinationId: rome.id, familyId: seed.familyId, memberIds: [seed.mom, seed.dad], moveFrom: true }))
        .rejects.toThrow('would_empty_destination');
      expect((await repo.getById(paris.id))!.memberIds).toEqual([seed.dad]);
      expect((await repo.getById(rome.id))!.memberIds).toEqual([seed.mom]);
    });

    it('renames through the label rules', async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      const touched = await updateDestination({ destinationId: paris.id, familyId: seed.familyId, name: 'Lyon' });
      expect(await listName(paris.packingListId)).toBe('Spring Break · Lyon');
      expect(touched).toEqual([paris.packingListId]);
    });
  });

  describe('deleteDestinationTx', () => {
    it('refuses to delete the last destination', async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      await expect(tx(db => deleteDestinationTx(db, { destination: paris, familyId: seed.familyId, deleteList: true })))
        .rejects.toBeInstanceOf(LastDestinationError);
    });

    it('re-homes a kept list with items into its own trip', async () => {
      await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      await addToList(rome.packingListId, await createMasterItem(seed.familyId, 'Hat', { memberIds: [seed.mom] }));

      await tx(db => deleteDestinationTx(db, { destination: rome, familyId: seed.familyId, deleteList: false }));

      const place = await repo.findByPackingListId(rome.packingListId);
      expect(place!.tripId).not.toBe(seed.tripId);
      expect((await trips.getTripById(place!.tripId))!.name).toBe('Rome');
      expect(await listName(rome.packingListId)).toBe('Rome');
      expect((await repo.listForTrip(seed.tripId)).map(d => d.name)).toEqual(['Paris']);
    });

    it('deletes an empty list instead of re-homing it', async () => {
      await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      await tx(db => deleteDestinationTx(db, { destination: rome, familyId: seed.familyId, deleteList: false }));
      const row = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [rome.packingListId]);
      expect(row.deleted_at).toBeTruthy();
    });
  });

  describe('copyTrip', () => {
    it('copies destinations, members, item groups and unchecked items into a dateless trip', async () => {
      const home = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Spring Break', memberIds: [seed.dad, seed.mom] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.ava] });
      const templateId = uuidv4();
      await seed.db.run(`INSERT INTO templates (id, family_id, name) VALUES (?, ?, 'Beach')`, [templateId, seed.familyId]);
      await seed.db.run(`INSERT INTO packing_list_templates (packing_list_id, template_id, created_at) VALUES (?, ?, datetime('now'))`, [home.packingListId, templateId]);
      const passport = await createMasterItem(seed.familyId, 'Passport', { memberIds: [seed.dad] });
      const row = await addToList(home.packingListId, passport);
      await setCheck(row, seed.dad, true);
      await seed.db.run(`INSERT INTO packing_list_item_templates (packing_list_item_id, template_id, created_at) VALUES (?, ?, datetime('now'))`, [row, templateId]);
      const oneOff = uuidv4();
      await seed.db.run(`INSERT INTO items (id, familyId, name, isOneOff) VALUES (?, ?, 'Gift', 1)`, [oneOff, seed.familyId]);
      await seed.db.run(`INSERT INTO item_members (item_id, member_id) VALUES (?, ?)`, [oneOff, seed.ava]);
      await addToList(rome.packingListId, oneOff);

      const newTripId = await copyTrip({ sourceTripId: seed.tripId, familyId: seed.familyId, name: 'Spring Break 2028', includeOneOffs: false });

      const trip = await trips.getTripById(newTripId);
      expect(trip).toMatchObject({ name: 'Spring Break 2028', startDate: null, endDate: null, status: 'planning' });
      const copied = await repo.listForTrip(newTripId);
      expect(copied.map(d => [d.name, d.color])).toEqual([['Spring Break 2028', 'blue'], ['Rome', 'green']]);
      expect(copied[0].memberIds.sort()).toEqual([seed.dad, seed.mom].sort());
      expect(await listName(copied[0].packingListId)).toBe('Spring Break 2028');
      expect(await listName(copied[1].packingListId)).toBe('Spring Break 2028 · Rome');
      const [copiedRow] = await listRows(copied[0].packingListId);
      expect(copiedRow.item_id).toBe(passport);
      expect(await seed.db.all(`SELECT * FROM packing_list_item_checks WHERE packing_list_item_id = ?`, [copiedRow.id])).toEqual([]);
      expect(await seed.db.all(`SELECT template_id FROM packing_list_item_templates WHERE packing_list_item_id = ?`, [copiedRow.id])).toEqual([{ template_id: templateId }]);
      expect(await seed.db.all(`SELECT template_id FROM packing_list_templates WHERE packing_list_id = ?`, [copied[0].packingListId])).toEqual([{ template_id: templateId }]);
      expect(await listRows(copied[1].packingListId)).toEqual([]);
    });

    it('copies one-off items as new one-off items when asked', async () => {
      const home = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Spring Break', memberIds: [seed.ava] });
      const oneOff = uuidv4();
      await seed.db.run(`INSERT INTO items (id, familyId, name, isOneOff) VALUES (?, ?, 'Gift', 1)`, [oneOff, seed.familyId]);
      await seed.db.run(`INSERT INTO item_members (item_id, member_id) VALUES (?, ?)`, [oneOff, seed.ava]);
      await addToList(home.packingListId, oneOff);

      const newTripId = await copyTrip({ sourceTripId: seed.tripId, familyId: seed.familyId, name: 'Again', includeOneOffs: true });

      const [destination] = await repo.listForTrip(newTripId);
      const [copiedRow] = await listRows(destination.packingListId);
      expect(copiedRow.item_id).not.toBe(oneOff);
      const item = await seed.db.get(`SELECT name, isOneOff FROM items WHERE id = ?`, [copiedRow.item_id]);
      expect(item).toEqual({ name: 'Gift', isOneOff: 1 });
      expect(await seed.db.all(`SELECT member_id FROM item_members WHERE item_id = ?`, [copiedRow.item_id])).toEqual([{ member_id: seed.ava }]);
    });
  });

  it('deleting a trip soft-deletes its destinations and lists', async () => {
    const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
    await trips.deleteTrip(seed.tripId);
    const list = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [paris.packingListId]);
    expect(list.deleted_at).toBeTruthy();
    expect(await repo.getById(paris.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run server/services/tripListService.test.ts`
Expected: FAIL, "Failed to resolve import "./tripListService"".

- [ ] **Step 3: Make `deleteTrip` soft-delete the trip's lists**

In `server/repositories/tripRepository.ts`, replace the body of `deleteTrip` with:

```ts
  async deleteTrip(tripId: string): Promise<void> {
    const db = await this.db;
    await withTransaction(db, async () => {
      await db.run(
        `UPDATE trips SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        [tripId]
      );
      // Every list belongs to its trip, so the lists go with it.
      await db.run(
        `UPDATE packing_lists SET deleted_at = datetime('now'), updated_at = datetime('now')
         WHERE deleted_at IS NULL AND id IN (SELECT packing_list_id FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL)`,
        [tripId]
      );
      await db.run(
        `UPDATE trip_destinations SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE trip_id = ? AND deleted_at IS NULL`,
        [tripId]
      );
    });
  }
```

In `server/repositories/tripDestinationRepository.test.ts`, replace the test `'drops destinations but keeps their lists when the trip is deleted'` with:

```ts
  it('drops destinations and their lists when the trip is deleted', async () => {
    const paris = await createParis();
    await new TripRepository().deleteTrip(seed.tripId);
    expect(await repo.listForTrip(seed.tripId)).toEqual([]);
    const row = await seed.db.get(`SELECT deleted_at FROM trip_destinations WHERE id = ?`, [paris.id]);
    expect(row.deleted_at).not.toBeNull();
    const list = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [paris.packingListId]);
    expect(list.deleted_at).not.toBeNull();
  });
```

- [ ] **Step 4: Create `server/services/tripListService.ts`**

```ts
import { v4 as uuidv4 } from 'uuid';
import type { Database } from 'sqlite';
import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';
import { namesMatch } from '../utils/destinationLabel';
import {
  TripDestination,
  TripDestinationRepository,
  DestinationValidationError,
} from '../repositories/tripDestinationRepository';
import { moveAllSharedItemsTx, pullMembersIntoDestinationTx } from './tripSplitService';

const destinationRepo = new TripDestinationRepository();

export class LastDestinationError extends Error {
  constructor() {
    super('last_destination');
  }
}

export interface NewTripInput {
  familyId: string;
  name: string;
  description?: string | null;
  tripType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
}

export interface CreateDestinationInput {
  tripId: string;
  familyId: string;
  name: string;
  memberIds: string[];
  packingListId?: string;
  moveFrom?: boolean;
  sharedItemsTo?: 'existing' | 'new';
}

export interface UpdateDestinationInput {
  destinationId: string;
  familyId: string;
  name?: string;
  color?: string;
  position?: number;
  memberIds?: string[];
  moveFrom?: boolean;
}

const listIdOf = async (db: Database, destinationId: string): Promise<string> =>
  (await db.get(`SELECT packing_list_id AS listId FROM trip_destinations WHERE id = ?`, [destinationId])).listId;

const liveDestinationCount = async (db: Database, tripId: string): Promise<number> =>
  (await db.get(`SELECT COUNT(*) AS n FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`, [tripId])).n;

// Caller owns the transaction.
export async function insertTripTx(db: Database, input: NewTripInput): Promise<string> {
  const id = uuidv4();
  await db.run(
    `INSERT INTO trips (id, family_id, name, description, trip_type, start_date, end_date, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, input.familyId, input.name, input.description || null, input.tripType || null, input.startDate || null, input.endDate || null, input.status || null]
  );
  return id;
}

export async function createTripWithFirstDestination(
  input: NewTripInput & { memberIds: string[] }
): Promise<{ tripId: string; destinationId: string }> {
  const db = await getDb();
  return withTransaction(db, async () => {
    const tripId = await insertTripTx(db, input);
    const destinationId = await destinationRepo.insertDestinationTx(db, {
      tripId,
      familyId: input.familyId,
      name: input.name,
      memberIds: input.memberIds,
      allowNoMembers: true,
    });
    return { tripId, destinationId };
  });
}

/** Puts an existing list into a new dateless trip of its own. Caller owns the transaction. */
export async function createShellTripForListTx(
  db: Database,
  input: { familyId: string; listId: string; name: string }
): Promise<string> {
  const tripId = await insertTripTx(db, { familyId: input.familyId, name: input.name, status: 'planning' });
  const members = ((await db.all(
    `SELECT plm.member_id FROM packing_list_members plm JOIN users u ON u.id = plm.member_id
     WHERE plm.packing_list_id = ? AND u.familyId = ? AND u.deleted_at IS NULL`,
    [input.listId, input.familyId]
  )) as { member_id: string }[]).map(r => r.member_id);
  await destinationRepo.insertDestinationTx(db, {
    tripId,
    familyId: input.familyId,
    name: input.name,
    memberIds: members,
    packingListId: input.listId,
    allowNoMembers: true,
  });
  return tripId;
}

/** Renames a destination; the only destination of a trip takes the trip with it when their names matched. */
export async function renameDestinationTx(db: Database, destinationId: string, name: string): Promise<string[]> {
  const destination = await db.get(
    `SELECT d.id, d.trip_id AS tripId, d.name, t.name AS tripName
     FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
     WHERE d.id = ? AND d.deleted_at IS NULL`,
    [destinationId]
  );
  if (!destination) throw new DestinationValidationError('not_found');
  const renameTrip = (await liveDestinationCount(db, destination.tripId)) === 1 && namesMatch(destination.name, destination.tripName);
  await db.run(`UPDATE trip_destinations SET name = ?, updated_at = ? WHERE id = ?`, [name, new Date().toISOString(), destinationId]);
  if (renameTrip) {
    await db.run(`UPDATE trips SET name = ?, updated_at = datetime('now') WHERE id = ?`, [name, destination.tripId]);
  }
  return destinationRepo.syncListNamesTx(db, destination.tripId);
}

/** After a trip is renamed: destinations that carried the old trip name take the new one, then lists are relabeled. */
export async function applyTripRenameTx(db: Database, tripId: string, oldName: string, newName: string): Promise<string[]> {
  const destinations = (await db.all(
    `SELECT id, name FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`,
    [tripId]
  )) as { id: string; name: string }[];
  const now = new Date().toISOString();
  for (const destination of destinations) {
    if (namesMatch(destination.name, oldName)) {
      await db.run(`UPDATE trip_destinations SET name = ?, updated_at = ? WHERE id = ?`, [newName, now, destination.id]);
    }
  }
  return destinationRepo.syncListNamesTx(db, tripId);
}

export async function createDestination(input: CreateDestinationInput): Promise<{ destinationId: string; touchedListIds: string[] }> {
  const db = await getDb();
  return withTransaction(db, async () => {
    const before = (await db.all(
      `SELECT packing_list_id AS listId FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`,
      [input.tripId]
    )) as { listId: string }[];
    if (!input.moveFrom) {
      const conflict = await destinationRepo.findConflict(db, input.tripId, input.memberIds);
      if (conflict) throw conflict;
    }
    const destinationId = await destinationRepo.insertDestinationTx(db, {
      tripId: input.tripId,
      familyId: input.familyId,
      name: input.name,
      memberIds: input.memberIds,
      packingListId: input.packingListId,
    });
    const listId = await listIdOf(db, destinationId);
    const touched = [listId];
    if (input.moveFrom) {
      touched.push(...(await pullMembersIntoDestinationTx(db, { tripId: input.tripId, destinationId, memberIds: input.memberIds })));
    }
    if (input.sharedItemsTo === 'new' && before.length === 1) {
      const moved = await moveAllSharedItemsTx(db, before[0].listId, listId);
      if (moved > 0) touched.push(before[0].listId);
    }
    return { destinationId, touchedListIds: Array.from(new Set(touched)) };
  });
}

/** Returns the ids of every list the update changed. */
export async function updateDestination(input: UpdateDestinationInput): Promise<string[]> {
  const db = await getDb();
  return withTransaction(db, async () => {
    const existing = await destinationRepo.getById(input.destinationId);
    if (!existing) throw new DestinationValidationError('not_found');
    const touched = [existing.packingListId];
    if (input.memberIds && input.moveFrom) {
      touched.push(...(await pullMembersIntoDestinationTx(db, {
        tripId: existing.tripId,
        destinationId: existing.id,
        memberIds: input.memberIds,
      })));
    }
    await destinationRepo.updateTx(db, existing, input.familyId, {
      color: input.color,
      position: input.position,
      memberIds: input.memberIds,
    });
    if (typeof input.name === 'string' && input.name !== existing.name) {
      touched.push(...(await renameDestinationTx(db, existing.id, input.name)));
    }
    return Array.from(new Set(touched));
  });
}

/**
 * Deletes a destination that is not its trip's last one. Shared items may move first.
 * The list is deleted when asked or when it is empty; otherwise it moves into a trip of its own.
 * Caller owns the transaction. Returns how many shared rows moved.
 */
export async function deleteDestinationTx(
  db: Database,
  input: { destination: TripDestination; familyId: string; moveSharedItemsToListId?: string | null; deleteList: boolean }
): Promise<number> {
  const { destination } = input;
  if ((await liveDestinationCount(db, destination.tripId)) <= 1) throw new LastDestinationError();
  const moved = input.moveSharedItemsToListId
    ? await moveAllSharedItemsTx(db, destination.packingListId, input.moveSharedItemsToListId)
    : 0;
  const now = new Date().toISOString();
  await db.run(`UPDATE trip_destinations SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, destination.id]);
  await db.run(`DELETE FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [destination.tripId, destination.packingListId]);
  const { count } = await db.get(`SELECT COUNT(*) AS count FROM packing_list_items WHERE packing_list_id = ?`, [destination.packingListId]);
  if (input.deleteList || count === 0) {
    await db.run(`UPDATE packing_lists SET deleted_at = ? WHERE id = ?`, [now, destination.packingListId]);
  } else {
    await createShellTripForListTx(db, { familyId: input.familyId, listId: destination.packingListId, name: destination.name });
  }
  return moved;
}

async function copyListContentsTx(
  db: Database,
  input: { fromListId: string; toListId: string; familyId: string; includeOneOffs: boolean }
): Promise<void> {
  const now = new Date().toISOString();
  await db.run(
    `INSERT OR IGNORE INTO packing_list_templates (packing_list_id, template_id, created_at)
     SELECT ?, template_id, ? FROM packing_list_templates WHERE packing_list_id = ?`,
    [input.toListId, now, input.fromListId]
  );
  const rows = (await db.all(
    `SELECT pli.id, pli.item_id AS itemId, pli.display_name AS displayName, i.isOneOff AS isOneOff, i.name AS itemName, i.categoryId AS categoryId
     FROM packing_list_items pli LEFT JOIN items i ON i.id = pli.item_id
     WHERE pli.packing_list_id = ? ORDER BY pli.created_at`,
    [input.fromListId]
  )) as { id: string; itemId: string | null; displayName: string | null; isOneOff: number | null; itemName: string | null; categoryId: string | null }[];
  for (const row of rows) {
    let itemId = row.itemId;
    const oneOff = !row.itemId || row.isOneOff === 1;
    if (oneOff) {
      if (!input.includeOneOffs) continue;
      if (row.itemId) {
        itemId = uuidv4();
        await db.run(
          `INSERT INTO items (id, familyId, categoryId, name, isOneOff, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [itemId, input.familyId, row.categoryId, row.itemName, now, now]
        );
        await db.run(`INSERT INTO item_members (item_id, member_id) SELECT ?, member_id FROM item_members WHERE item_id = ?`, [itemId, row.itemId]);
        await db.run(`INSERT INTO item_whole_family (item_id, family_id) SELECT ?, family_id FROM item_whole_family WHERE item_id = ?`, [itemId, row.itemId]);
      }
    }
    const newId = uuidv4();
    await db.run(
      `INSERT INTO packing_list_items (id, packing_list_id, item_id, display_name, checked, added_during_packing, not_needed, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?)`,
      [newId, input.toListId, itemId, row.displayName, now]
    );
    await db.run(
      `INSERT INTO packing_list_item_templates (packing_list_item_id, template_id, created_at)
       SELECT ?, template_id, ? FROM packing_list_item_templates WHERE packing_list_item_id = ?`,
      [newId, now, row.id]
    );
  }
}

/** Copies a trip's destinations and lists (no dates, bookings or checks) into a new trip. Returns the new trip id. */
export async function copyTrip(input: { sourceTripId: string; familyId: string; name: string; includeOneOffs: boolean }): Promise<string> {
  const db = await getDb();
  return withTransaction(db, async () => {
    const source = await db.get(
      `SELECT name, description, trip_type AS tripType FROM trips WHERE id = ? AND family_id = ? AND deleted_at IS NULL`,
      [input.sourceTripId, input.familyId]
    );
    if (!source) throw new DestinationValidationError('not_found');
    const tripId = await insertTripTx(db, {
      familyId: input.familyId,
      name: input.name,
      description: source.description,
      tripType: source.tripType,
      status: 'planning',
    });
    const destinations = (await db.all(
      `SELECT d.name, d.color, d.packing_list_id AS listId
       FROM trip_destinations d JOIN packing_lists pl ON pl.id = d.packing_list_id
       WHERE d.trip_id = ? AND d.deleted_at IS NULL AND pl.deleted_at IS NULL
       ORDER BY d.position, d.created_at`,
      [input.sourceTripId]
    )) as { name: string; color: string | null; listId: string }[];
    for (const destination of destinations) {
      const members = ((await db.all(
        `SELECT plm.member_id FROM packing_list_members plm JOIN users u ON u.id = plm.member_id
         WHERE plm.packing_list_id = ? AND u.familyId = ? AND u.deleted_at IS NULL`,
        [destination.listId, input.familyId]
      )) as { member_id: string }[]).map(r => r.member_id);
      const destinationId = await destinationRepo.insertDestinationTx(db, {
        tripId,
        familyId: input.familyId,
        name: namesMatch(destination.name, source.name) ? input.name : destination.name,
        memberIds: members,
        allowNoMembers: true,
      });
      if (destination.color) {
        await db.run(`UPDATE trip_destinations SET color = ? WHERE id = ?`, [destination.color, destinationId]);
      }
      await copyListContentsTx(db, {
        fromListId: destination.listId,
        toListId: await listIdOf(db, destinationId),
        familyId: input.familyId,
        includeOneOffs: input.includeOneOffs,
      });
    }
    return tripId;
  });
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run server/services/tripListService.test.ts server/repositories/tripDestinationRepository.test.ts server/repositories/tripRepository.test.ts`
Expected: PASS.

- [ ] **Step 6: Type check**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add server/services/tripListService.ts server/services/tripListService.test.ts server/repositories/tripRepository.ts server/repositories/tripDestinationRepository.test.ts
git commit -m "feat: add trip list service for trip-level destination rules

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Destination routes: `moveFrom`, `sharedItemsTo`, `last_destination`, label-based renames

The destination routes stop doing the work themselves and call `tripListService`.

**Files:**
- Modify: `server/routes/tripRoutes.ts` (imports, `sendDestinationError`, and the POST/PUT/DELETE `/:tripId/destinations` handlers)
- Modify: `server/__tests__/trip-destinations.routes.test.ts` (new tests)

- [ ] **Step 1: Write the failing route tests**

In `server/__tests__/trip-destinations.routes.test.ts`, add these tests just before the `describe('SSE notifications', ...)` block:

```ts
  it('moves a person and their items when creating a destination with moveFrom', async () => {
    const paris = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Paris', memberIds: [seed.dad, seed.ava] });
    const teddy = await addToList(paris.body.packingListId, await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] }));

    const rome = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Rome', memberIds: [seed.ava], moveFrom: true });

    expect(rome.status).toBe(201);
    expect(rome.body.memberIds).toEqual([seed.ava]);
    expect((await listRows(rome.body.packingListId)).map(r => r.id)).toEqual([teddy]);
    const parisNow = await request(app).get(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth);
    expect(parisNow.body.find((d: any) => d.id === paris.body.id).memberIds).toEqual([seed.dad]);
  });

  it('moves a person and their items when updating a destination with moveFrom', async () => {
    const { res } = await splitSource();
    const [paris, grandma] = res.body.destinations;
    const passport = await addToList(paris.packingListId, await createMasterItem(seed.familyId, 'Passport', { memberIds: [seed.mom] }));

    const put = await request(app).put(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth)
      .send({ memberIds: [seed.ava, seed.leo, seed.mom], moveFrom: true });

    expect(put.status).toBe(200);
    expect(put.body.memberIds.sort()).toEqual([seed.ava, seed.leo, seed.mom].sort());
    expect((await listRows(grandma.packingListId)).map(r => r.id)).toEqual([passport]);
  });

  it('returns 400 would_empty_destination when moveFrom would leave a destination with nobody', async () => {
    const { res } = await splitSource();
    const grandma = res.body.destinations[1];
    const put = await request(app).put(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth)
      .send({ memberIds: [seed.ava, seed.leo, seed.dad, seed.mom], moveFrom: true });
    expect(put.status).toBe(400);
    expect(put.body.error).toBe('would_empty_destination');
  });

  it("moves whole-family items to the new destination when sharedItemsTo is 'new'", async () => {
    const paris = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Paris', memberIds: [seed.dad] });
    const carSeat = await addToList(paris.body.packingListId, await createMasterItem(seed.familyId, 'Car seat', { wholeFamily: true }));
    const rome = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Rome', memberIds: [seed.mom], sharedItemsTo: 'new' });
    expect(rome.status).toBe(201);
    expect((await listRows(rome.body.packingListId)).map(r => r.id)).toEqual([carSeat]);
  });

  it('rejects an unknown sharedItemsTo value', async () => {
    const res = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Rome', memberIds: [seed.mom], sharedItemsTo: 'elsewhere' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_shared_items_to');
  });

  it('names destination lists with the label', async () => {
    const home = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Spring Break', memberIds: [seed.dad] });
    const rome = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Rome', memberIds: [seed.mom] });
    const name = async (id: string) => (await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [id])).name;
    expect(await name(home.body.packingListId)).toBe('Spring Break');
    expect(await name(rome.body.packingListId)).toBe('Spring Break · Rome');
  });

  it('renames the trip with its only destination when their names matched', async () => {
    const home = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Spring Break', memberIds: [seed.dad] });
    const put = await request(app).put(`/api/trips/${seed.tripId}/destinations/${home.body.id}`).set('Authorization', auth)
      .send({ name: 'Easter' });
    expect(put.status).toBe(200);
    expect((await new TripRepository().getTripById(seed.tripId))!.name).toBe('Easter');
  });

  it('refuses to delete the last destination of a trip', async () => {
    const paris = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Paris', memberIds: [seed.dad] });
    const res = await request(app).delete(`/api/trips/${seed.tripId}/destinations/${paris.body.id}`).set('Authorization', auth)
      .send({ deleteList: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('last_destination');
  });

  it('puts a kept list with items into a trip of its own', async () => {
    const { res } = await splitSource();
    const grandma = res.body.destinations[1];
    await addToList(grandma.packingListId, await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] }));
    const deleted = await request(app).delete(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth)
      .send({ moveSharedItemsTo: res.body.destinations[0].id });
    expect(deleted.status).toBe(204);
    const lists = await request(app).get(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth);
    const kept = lists.body.lists.find((l: any) => l.id === grandma.packingListId);
    expect(kept.trip_destination).toMatchObject({ tripName: "Grandma's", destinationName: "Grandma's", destinationCount: 1 });
    expect(kept.name).toBe("Grandma's");
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run server/__tests__/trip-destinations.routes.test.ts`
Expected: FAIL. The new tests fail: `moveFrom` is ignored (409 `member_in_other_destination`), `sharedItemsTo` is ignored, the last destination deletes with 204, and the kept list stays out of any trip.

- [ ] **Step 3: Update the imports and error mapping in `server/routes/tripRoutes.ts`**

Replace the import line

```ts
import { splitListIntoTrip, moveAllSharedItemsTx, notify } from '../services/tripSplitService';
```

with

```ts
import { splitListIntoTrip, notify } from '../services/tripSplitService';
import {
  createDestination,
  updateDestination,
  deleteDestinationTx,
  LastDestinationError,
} from '../services/tripListService';
```

Replace `sendDestinationError` with:

```ts
function sendDestinationError(res: Response, error: unknown, fallback: string) {
  if (error instanceof DestinationConflictError) {
    return res.status(409).json({ error: 'member_in_other_destination', memberId: error.memberId, destinationId: error.destinationId });
  }
  if (error instanceof LastDestinationError) {
    return res.status(409).json({ error: 'last_destination' });
  }
  if (error instanceof DestinationValidationError) {
    return res.status(error.message === 'not_found' ? 404 : 400).json({ error: error.message });
  }
  return res.status(500).json({ error: fallback });
}
```

- [ ] **Step 4: Replace the POST, PUT and DELETE destination handlers**

Replace the three handlers `tripRouter.post('/:tripId/destinations', ...)`, `tripRouter.put('/:tripId/destinations/:destinationId', ...)` and `tripRouter.delete('/:tripId/destinations/:destinationId', ...)` with:

```ts
tripRouter.post('/:tripId/destinations', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  const { name, memberIds, itemGroupIds, packingListId, moveFrom, sharedItemsTo } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!Array.isArray(memberIds) || memberIds.length === 0) return res.status(400).json({ error: 'memberIds is required' });
  if (sharedItemsTo !== undefined && sharedItemsTo !== 'existing' && sharedItemsTo !== 'new') {
    return res.status(400).json({ error: 'invalid_shared_items_to' });
  }
  const groupIds: string[] = Array.isArray(itemGroupIds) ? itemGroupIds : [];
  try {
    if (groupIds.length > 0) {
      const db = await getDb();
      const placeholders = groupIds.map(() => '?').join(',');
      const found = await db.all(
        `SELECT id FROM templates WHERE family_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
        [req.trip!.family_id, ...groupIds]
      );
      if (found.length !== new Set(groupIds).size) return res.status(400).json({ error: 'invalid_item_groups' });
    }
    const { destinationId, touchedListIds } = await createDestination({
      tripId: req.trip!.id,
      familyId: req.trip!.family_id,
      name: name.trim(),
      memberIds,
      packingListId: typeof packingListId === 'string' && packingListId ? packingListId : undefined,
      moveFrom: moveFrom === true,
      sharedItemsTo,
    });
    const destination = (await tripDestinationRepository.getById(destinationId))!;
    if (groupIds.length > 0) {
      const current = await packingListRepository.getTemplatesForPackingList(destination.packingListId);
      await packingListRepository.setTemplatesForPackingList(destination.packingListId, Array.from(new Set([...current, ...groupIds])));
      for (const groupId of groupIds) {
        await packingListRepository.reconcilePackingListAgainstTemplate(destination.packingListId, groupId);
      }
    }
    const tripLists = (await tripDestinationRepository.listForTrip(req.trip!.id)).map(d => d.packingListId);
    notify([...touchedListIds, ...tripLists], moveFrom === true ? 'move' : 'destination');
    return res.status(201).json(destination);
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to create destination');
  }
});

tripRouter.put('/:tripId/destinations/:destinationId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const existing = await tripDestinationRepository.getById(req.params.destinationId);
    if (!existing || existing.tripId !== req.trip!.id) return res.status(404).json({ error: 'Destination not found' });
    const { name, color, position, memberIds, moveFrom } = req.body || {};
    if (memberIds !== undefined && (!Array.isArray(memberIds) || memberIds.length === 0)) {
      return res.status(400).json({ error: 'memberIds must be a non-empty array' });
    }
    const touched = await updateDestination({
      destinationId: existing.id,
      familyId: req.trip!.family_id,
      name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
      color: typeof color === 'string' ? color : undefined,
      position: typeof position === 'number' ? position : undefined,
      memberIds,
      moveFrom: moveFrom === true,
    });
    notify(touched, moveFrom === true ? 'move' : 'destination');
    return res.json(await tripDestinationRepository.getById(existing.id));
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to update destination');
  }
});

tripRouter.delete('/:tripId/destinations/:destinationId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const existing = await tripDestinationRepository.getById(req.params.destinationId);
    if (!existing || existing.tripId !== req.trip!.id) return res.status(404).json({ error: 'Destination not found' });
    const { moveSharedItemsTo, deleteList } = req.body || {};
    const siblings = await tripDestinationRepository.listForTrip(existing.tripId);
    if (siblings.length <= 1) return res.status(409).json({ error: 'last_destination' });
    const db = await getDb();
    const { count } = await db.get(`SELECT COUNT(*) AS count FROM packing_list_items WHERE packing_list_id = ?`, [existing.packingListId]);
    if (count > 0 && !moveSharedItemsTo && !deleteList) {
      return res.status(409).json({ error: 'destination_has_items', itemCount: count });
    }
    let target: Awaited<ReturnType<typeof tripDestinationRepository.getById>> | null = null;
    if (moveSharedItemsTo) {
      target = await tripDestinationRepository.getById(moveSharedItemsTo);
      if (!target || target.tripId !== existing.tripId || target.id === existing.id) {
        return res.status(400).json({ error: 'invalid_target_destination' });
      }
    }
    const moved = await withTransaction(db, () =>
      deleteDestinationTx(db, {
        destination: existing,
        familyId: req.trip!.family_id,
        moveSharedItemsToListId: target ? target.packingListId : null,
        deleteList: deleteList === true,
      })
    );
    const remainingLists = (await tripDestinationRepository.listForTrip(existing.tripId)).map(d => d.packingListId);
    notify([existing.packingListId, ...remainingLists], moved > 0 ? 'move' : 'destination');
    return res.status(204).send();
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to delete destination');
  }
});
```

`notify` already removes duplicate ids (see `tripSplitService.notify`), so passing the touched lists and the trip's lists together sends each list one event.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run server/__tests__/trip-destinations.routes.test.ts server/services/tripListService.test.ts`
Expected: PASS, including the existing SSE tests (`'notifies the destination list on update'` still sees only Paris's list).

- [ ] **Step 6: Type check**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add server/routes/tripRoutes.ts server/__tests__/trip-destinations.routes.test.ts
git commit -m "feat: destination routes move items with people and keep a trip's last destination

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Trip routes: optional dates, first destination, rename sync, delete cascade, copy

**Files:**
- Modify: `server/routes/tripRoutes.ts` (POST `/`, PUT `/:tripId`, DELETE `/:tripId`, new POST `/:tripId/copy`)
- Create: `server/__tests__/trips.routes.test.ts`

- [ ] **Step 1: Write the failing route tests**

Create `server/__tests__/trips.routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import routes from '../routes';
import { closeDb } from '../db';
import { generateToken } from '../auth';
import { seedFamilyTrip, createMasterItem, addToList, listRows } from '../test-utils/destinationFixtures';

describe('trip routes', () => {
  let app: express.Application;
  let seed: Awaited<ReturnType<typeof seedFamilyTrip>>;
  let auth: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);
    seed = await seedFamilyTrip();
    const dadRow = await seed.db.get(`SELECT * FROM users WHERE id = ?`, [seed.dad]);
    auth = `Bearer ${generateToken(dadRow)}`;
  });

  afterEach(async () => {
    await closeDb();
  });

  const destinationsOf = async (tripId: string) =>
    (await request(app).get(`/api/trips/${tripId}/destinations`).set('Authorization', auth)).body;
  const listName = async (listId: string) => (await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [listId])).name;

  it('creates a trip without dates and gives it a first destination with the whole family', async () => {
    const res = await request(app).post('/api/trips').set('Authorization', auth).send({ name: 'Beach weekend' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Beach weekend', startDate: null, endDate: null });
    const [destination] = await destinationsOf(res.body.id);
    expect(destination.name).toBe('Beach weekend');
    expect(destination.memberIds.sort()).toEqual([seed.dad, seed.mom, seed.ava, seed.leo].sort());
    expect(await listName(destination.packingListId)).toBe('Beach weekend');
  });

  it('uses the given members for the first destination', async () => {
    const res = await request(app).post('/api/trips').set('Authorization', auth)
      .send({ name: 'Ski', startDate: '2027-01-02', endDate: '2027-01-09', memberIds: [seed.dad, seed.ava] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ startDate: '2027-01-02', endDate: '2027-01-09' });
    const [destination] = await destinationsOf(res.body.id);
    expect(destination.memberIds.sort()).toEqual([seed.dad, seed.ava].sort());
  });

  it('requires a name', async () => {
    const res = await request(app).post('/api/trips').set('Authorization', auth).send({ startDate: '2027-01-02' });
    expect(res.status).toBe(400);
  });

  it('lists dateless trips', async () => {
    await request(app).post('/api/trips').set('Authorization', auth).send({ name: 'Someday' });
    const res = await request(app).get('/api/trips').set('Authorization', auth);
    expect(res.body.map((t: any) => t.name)).toEqual(expect.arrayContaining(['Spring Break', 'Someday']));
  });

  it('renaming a trip renames matching destinations and relabels lists', async () => {
    const created = await request(app).post('/api/trips').set('Authorization', auth).send({ name: 'Beach', memberIds: [seed.dad] });
    const tripId = created.body.id;
    const rome = await request(app).post(`/api/trips/${tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Rome', memberIds: [seed.mom] });

    const res = await request(app).put(`/api/trips/${tripId}`).set('Authorization', auth).send({ name: 'Coast' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Coast');
    const destinations = await destinationsOf(tripId);
    expect(destinations.map((d: any) => d.name)).toEqual(['Coast', 'Rome']);
    expect(await listName(destinations[0].packingListId)).toBe('Coast');
    expect(await listName(rome.body.packingListId)).toBe('Coast · Rome');
  });

  it('rejects a blank name on update', async () => {
    const res = await request(app).put(`/api/trips/${seed.tripId}`).set('Authorization', auth).send({ name: '  ' });
    expect(res.status).toBe(400);
  });

  it('deleting a trip deletes its lists', async () => {
    const created = await request(app).post('/api/trips').set('Authorization', auth).send({ name: 'Beach', memberIds: [seed.dad] });
    const [destination] = await destinationsOf(created.body.id);
    const res = await request(app).delete(`/api/trips/${created.body.id}`).set('Authorization', auth);
    expect(res.status).toBe(204);
    const list = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [destination.packingListId]);
    expect(list.deleted_at).toBeTruthy();
  });

  it('copies a trip with its destinations and items', async () => {
    const created = await request(app).post('/api/trips').set('Authorization', auth).send({ name: 'Beach', memberIds: [seed.dad] });
    const [destination] = await destinationsOf(created.body.id);
    const towel = await createMasterItem(seed.familyId, 'Towel', { memberIds: [seed.dad] });
    await addToList(destination.packingListId, towel);

    const res = await request(app).post(`/api/trips/${created.body.id}/copy`).set('Authorization', auth)
      .send({ name: 'Beach again', includeOneOffs: false });

    expect(res.status).toBe(201);
    expect(res.body.trip).toMatchObject({ name: 'Beach again', startDate: null, endDate: null });
    expect(res.body.destinations.map((d: any) => d.name)).toEqual(['Beach again']);
    expect((await listRows(res.body.destinations[0].packingListId)).map(r => r.item_id)).toEqual([towel]);
  });

  it('requires a name to copy', async () => {
    const res = await request(app).post(`/api/trips/${seed.tripId}/copy`).set('Authorization', auth).send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run server/__tests__/trips.routes.test.ts`
Expected: FAIL. Creating without dates returns 400, no first destination is made, the rename does not touch destinations, and `/copy` returns 404.

- [ ] **Step 3: Import the service functions**

In `server/routes/tripRoutes.ts`, extend the `tripListService` import added in Task 5 to:

```ts
import {
  createDestination,
  updateDestination,
  deleteDestinationTx,
  LastDestinationError,
  createTripWithFirstDestination,
  applyTripRenameTx,
  copyTrip,
} from '../services/tripListService';
```

- [ ] **Step 4: Replace the create, update and delete trip handlers**

Replace `tripRouter.post('/', ...)`, `tripRouter.put('/:tripId', ...)` and `tripRouter.delete('/:tripId', ...)` with:

```ts
// Create trip (dates optional); it starts with one destination named after it
tripRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description, tripType, startDate, endDate, status, memberIds } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }
    const familyId = (req as any).user.familyId;
    let members: string[] = Array.isArray(memberIds) ? memberIds : [];
    if (members.length === 0) {
      const db = await getDb();
      members = ((await db.all(`SELECT id FROM users WHERE familyId = ? AND deleted_at IS NULL`, [familyId])) as { id: string }[])
        .map(u => u.id);
    }
    const { tripId } = await createTripWithFirstDestination({
      familyId,
      name: name.trim(),
      description,
      tripType,
      startDate,
      endDate,
      status,
      memberIds: members,
    });
    res.status(201).json(await tripRepository.getTripById(tripId));
  } catch (error) {
    if (error instanceof DestinationValidationError) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Failed to create trip' });
  }
});
```

(leave the `GET /:tripId` handler between them unchanged)

```ts
// Update trip; a new name flows to destinations that carried the old one and to every list label
tripRouter.put('/:tripId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  const body = req.body || {};
  if ('name' in body && (typeof body.name !== 'string' || !body.name.trim())) {
    return res.status(400).json({ error: 'name must be a non-empty string' });
  }
  try {
    const db = await getDb();
    const oldName = req.trip!.name;
    const updates = 'name' in body ? { ...body, name: body.name.trim() } : body;
    const changed = await withTransaction(db, async () => {
      await tripRepository.updateTrip(req.trip!.id, updates);
      return 'name' in updates && updates.name !== oldName
        ? applyTripRenameTx(db, req.trip!.id, oldName, updates.name)
        : [];
    });
    notify(changed, 'destination');
    res.json(await tripRepository.getTripById(req.trip!.id));
  } catch (error) {
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

// Delete trip with its destinations and lists
tripRouter.delete('/:tripId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const lists = (await tripDestinationRepository.listForTrip(req.trip!.id)).map(d => d.packingListId);
    await tripRepository.deleteTrip(req.trip!.id);
    notify(lists, 'destination');
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

// Copy a trip's destinations and lists into a new dateless trip
tripRouter.post('/:tripId/copy', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  const { name, includeOneOffs } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const tripId = await copyTrip({
      sourceTripId: req.trip!.id,
      familyId: req.trip!.family_id,
      name: name.trim(),
      includeOneOffs: includeOneOffs === true,
    });
    return res.status(201).json({
      trip: await tripRepository.getTripById(tripId),
      destinations: await tripDestinationRepository.listForTrip(tripId),
    });
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to copy trip');
  }
});
```

`tripAccessMiddleware` loads the trip row into `req.trip` (`id`, `family_id`, `name`, …) before the handler runs, so `req.trip!.name` is the name before the update.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run server/__tests__/trips.routes.test.ts server/__tests__/trip-destinations.routes.test.ts server/repositories/tripRepository.test.ts server/__tests__/middleware/tripAccessMiddleware.test.ts`
Expected: PASS.

- [ ] **Step 6: Type check**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add server/routes/tripRoutes.ts server/__tests__/trips.routes.test.ts
git commit -m "feat: trips can be dateless, start with a destination, cascade renames and copy

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Packing-list routes: new lists get a trip, delete and rename follow trip rules

**Files:**
- Modify: `server/routes.ts` (imports; POST `/families/:familyId/packing-lists`; PUT `/packing-lists/:id`; DELETE `/packing-lists/:id`)
- Modify: `server/__tests__/trip-destinations.routes.test.ts` (new tests)

- [ ] **Step 1: Write the failing tests**

In `server/__tests__/trip-destinations.routes.test.ts`, add before `it('still deletes an ordinary list', ...)`:

```ts
  it('gives a new list its own dateless trip', async () => {
    const created = await request(app).post(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth)
      .send({ name: 'Camping', memberIds: [seed.dad, seed.ava] });
    expect(created.status).toBe(200);
    const lists = await request(app).get(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth);
    const camping = lists.body.lists.find((l: any) => l.id === created.body.list.id);
    expect(camping.trip_destination).toMatchObject({ tripName: 'Camping', destinationName: 'Camping', position: 0, destinationCount: 1 });
    const trip = await new TripRepository().getTripById(camping.trip_destination.tripId);
    expect(trip).toMatchObject({ startDate: null, endDate: null, status: 'planning' });
    const destinations = await request(app).get(`/api/trips/${trip!.id}/destinations`).set('Authorization', auth);
    expect(destinations.body[0].memberIds.sort()).toEqual([seed.dad, seed.ava].sort());
  });

  it("deletes the whole trip when its only destination's list is deleted", async () => {
    const created = await request(app).post(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth)
      .send({ name: 'Camping' });
    const lists = await request(app).get(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth);
    const tripId = lists.body.lists.find((l: any) => l.id === created.body.list.id).trip_destination.tripId;

    const del = await request(app).delete(`/api/packing-lists/${created.body.list.id}`).set('Authorization', auth);

    expect(del.status).toBe(200);
    expect(await new TripRepository().getTripById(tripId)).toBeUndefined();
    const list = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [created.body.list.id]);
    expect(list.deleted_at).toBeTruthy();
  });

  it('renaming a destination list through the list route renames the destination', async () => {
    const { res } = await splitSource();
    const paris = res.body.destinations[0];
    const put = await request(app).put(`/api/packing-lists/${paris.packingListId}`).set('Authorization', auth)
      .send({ name: 'Lyon' });
    expect(put.status).toBe(200);
    expect(put.body.list.name).toBe('Spring Break · Lyon');
    const destinations = await request(app).get(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth);
    expect(destinations.body[0].name).toBe('Lyon');
  });

  it('rejects a blank name for a destination list', async () => {
    const { res } = await splitSource();
    const put = await request(app).put(`/api/packing-lists/${res.body.destinations[0].packingListId}`).set('Authorization', auth)
      .send({ name: '  ' });
    expect(put.status).toBe(400);
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run server/__tests__/trip-destinations.routes.test.ts`
Expected: FAIL. The new list has `trip_destination: null`, deleting it leaves no trip to check (`tripId` read from `null` throws), and the rename sets the raw list name to `Lyon`.

- [ ] **Step 3: Update the imports in `server/routes.ts`**

Replace line 20

```ts
import { moveSharedItem, MoveValidationError } from './services/tripSplitService';
```

with

```ts
import { moveSharedItem, MoveValidationError, notify } from './services/tripSplitService';
import { createShellTripForListTx, renameDestinationTx, deleteDestinationTx } from './services/tripListService';
import { TripRepository } from './repositories/tripRepository';
```

and after `const tripDestinationRepo = new TripDestinationRepository();` add:

```ts
const tripRepo = new TripRepository();
```

- [ ] **Step 4: Give new lists a shell trip**

In `router.post('/families/:familyId/packing-lists', ...)`, directly after the `if (templateId) { ... }` block and before `return res.json({ list: newList });`, add:

```ts
    // Every list belongs to a trip; a new list starts as the only destination of its own trip.
    const db = await getDb();
    await withTransaction(db, () => createShellTripForListTx(db, { familyId, listId: newList.id, name: newList.name }));
```

- [ ] **Step 5: Route list renames on destination lists through the destination**

In `router.put('/packing-lists/:id', ...)`, directly before the `// Persist memberIds if provided` comment, add:

```ts
    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      const destination = await tripDestinationRepo.findByPackingListId(id);
      if (destination) {
        if (typeof updates.name !== 'string' || !updates.name.trim()) {
          return res.status(400).json({ error: 'Name is required' });
        }
        const db = await getDb();
        const changed = await withTransaction(db, () => renameDestinationTx(db, destination.id, updates.name.trim()));
        notify([id, ...changed], 'destination');
        // The stored list name is the label, already written above.
        delete updates.name;
      }
    }
```

- [ ] **Step 6: Replace the delete handler**

Replace the whole `router.delete('/packing-lists/:id', ...)` handler with:

```ts
// Delete (soft-delete) packing list. A list is a destination: deleting the last one deletes its trip.
router.delete('/packing-lists/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const existing = await packingListRepo.findById(id);
    if (!existing) return res.status(404).json({ error: 'Packing list not found' });
    if (req.user?.role !== 'SystemAdmin' && req.user?.familyId !== existing.family_id) return res.status(403).json({ error: 'Forbidden' });
    const destination = await tripDestinationRepo.findByPackingListId(id);
    if (destination) {
      const siblings = await tripDestinationRepo.listForTrip(destination.tripId);
      if (siblings.length <= 1) {
        await tripRepo.deleteTrip(destination.tripId);
        notify([id], 'destination');
      } else {
        const db = await getDb();
        await withTransaction(db, () =>
          deleteDestinationTx(db, { destination, familyId: existing.family_id, deleteList: true })
        );
        notify([id, ...siblings.map(d => d.packingListId)], 'destination');
      }
    } else {
      await packingListRepo.softDelete(id);
    }
    return res.json({ message: 'Packing list deleted' });
  } catch (error) {
    console.error('Error deleting packing list:', error);
    return res.status(500).json({ error: 'Failed to delete packing list' });
  }
});
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npx vitest run server/__tests__/trip-destinations.routes.test.ts server/__tests__/packing-list.integration.test.ts server/__tests__/routes.test.ts server/__tests__/active-packing-list.events.test.ts server/__tests__/template-propagation.test.ts`
Expected: PASS. (`'soft-deletes the destination when its list is deleted via the list route'` still passes: Paris is one of two destinations, so only it goes.)

- [ ] **Step 8: Type check**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add server/routes.ts server/__tests__/trip-destinations.routes.test.ts
git commit -m "feat: new packing lists get their own trip; list delete and rename follow trip rules

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Client API and types for dateless trips, copy, `moveFrom`, `sharedItemsTo`

**Files:**
- Modify: `client/src/types/trip.ts` (`Trip`, `ListTripSummary`, `DestinationWritePayload`, new `CopyTripPayload`, `CopyTripResult`)
- Modify: `client/src/api/tripApi.ts` (`deleteTrip` error text, new `copyTrip`)
- Modify: `client/src/utils/destinationErrors.ts` (new codes)
- Modify: `client/src/__tests__/tripApi.test.ts`

- [ ] **Step 1: Write the failing tests**

In `client/src/__tests__/tripApi.test.ts`, add inside `describe('tripApi destinations', ...)` after the last test:

```ts
  it('posts a trip copy', async () => {
    stubFetch(201, { trip: { id: 't2' }, destinations: [] });
    await expect(tripApi.copyTrip('t1', { name: 'Again', includeOneOffs: true }))
      .resolves.toEqual({ trip: { id: 't2' }, destinations: [] });
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('/api/trips/t1/copy');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'Again', includeOneOffs: true });
  });

  it('sends moveFrom and sharedItemsTo when creating a destination', async () => {
    stubFetch(201, { id: 'd2' });
    await tripApi.createDestination('t1', { name: 'Rome', memberIds: ['u1'], moveFrom: true, sharedItemsTo: 'new' });
    expect(JSON.parse((fetch as any).mock.calls[0][1].body)).toEqual({ name: 'Rome', memberIds: ['u1'], moveFrom: true, sharedItemsTo: 'new' });
  });

  it('surfaces the server error when deleting a trip fails', async () => {
    stubFetch(404, { error: 'Trip not found' });
    await expect(tripApi.deleteTrip('t1')).rejects.toThrow('Trip not found');
  });

  it('deletes a trip without parsing an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.reject(new Error('no body')) }));
    await expect(tripApi.deleteTrip('t1')).resolves.toBeUndefined();
  });
```

Add a new file `client/src/__tests__/destinationErrors.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../api/tripApi', () => ({ tripApi: {} }));

import { destinationErrorText } from '../utils/destinationErrors';

describe('destinationErrorText', () => {
  it('explains the new trip rules', () => {
    expect(destinationErrorText(new Error('would_empty_destination'), 'x')).toBe('That would leave another destination with no travelers.');
    expect(destinationErrorText({ body: { error: 'last_destination' } }, 'x')).toBe('A trip needs at least one destination.');
    expect(destinationErrorText(new Error('invalid_shared_items_to'), 'x')).toBe('Choose where the shared items go.');
  });

  it('falls back for unknown codes', () => {
    expect(destinationErrorText(new Error('boom'), 'Something went wrong')).toBe('Something went wrong');
  });
});
```

In `vitest.config.ts`, add this line directly after the `'client/src/__tests__/tripApi.test.ts', // API error surfacing` line:

```ts
      'client/src/__tests__/destinationErrors.test.ts', // destination error text
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run client/src/__tests__/tripApi.test.ts client/src/__tests__/destinationErrors.test.ts`
Expected: FAIL. `tripApi.copyTrip is not a function`, `deleteTrip` throws "Failed to delete trip: 404", and the three codes fall back to `'x'`.

- [ ] **Step 3: Update the types**

In `client/src/types/trip.ts`, change these lines of `Trip`:

```ts
  startDate: string;
  endDate: string;
```

to

```ts
  startDate?: string | null;
  endDate?: string | null;
```

Replace `ListTripSummary` and `DestinationWritePayload` with:

```ts
/** `trip_destination` on each list from GET /families/:familyId/packing-lists */
export interface ListTripSummary {
  tripId: string;
  tripName: string;
  destinationId: string;
  destinationName: string;
  position: number;
  destinationCount: number;
  color?: string | null;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
}

export interface DestinationWritePayload {
  name?: string;
  memberIds?: string[];
  itemGroupIds?: string[];
  packingListId?: string;
  color?: string;
  position?: number;
  /** Take the chosen people (and their items) out of the trip's other destinations. */
  moveFrom?: boolean;
  /** Only used when the trip had one destination: where its whole-family items go. */
  sharedItemsTo?: 'existing' | 'new';
}

export interface CopyTripPayload {
  name: string;
  includeOneOffs: boolean;
}

export interface CopyTripResult {
  trip: Trip;
  destinations: TripDestination[];
}
```

- [ ] **Step 4: Update `tripApi`**

In `client/src/api/tripApi.ts`, change the import line

```ts
  TripDestination, DestinationWritePayload, SplitListPayload, SplitResult,
```

to

```ts
  TripDestination, DestinationWritePayload, SplitListPayload, SplitResult, CopyTripPayload, CopyTripResult,
```

Replace `deleteTrip` with:

```ts
  deleteTrip: async (tripId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}`, { method: 'DELETE', headers: authHeaders() });
    if (!response.ok) await handleResponse(response);
  },

  copyTrip: async (tripId: string, payload: CopyTripPayload): Promise<CopyTripResult> => {
    const response = await fetch(`${API_BASE}/${tripId}/copy`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },
```

- [ ] **Step 5: Add the error texts**

In `client/src/utils/destinationErrors.ts`, add these entries to `DESTINATION_ERROR_TEXT` after the `'Destination not found'` entry:

```ts
  would_empty_destination: 'That would leave another destination with no travelers.',
  last_destination: 'A trip needs at least one destination.',
  invalid_shared_items_to: 'Choose where the shared items go.',
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run client/src/__tests__/tripApi.test.ts client/src/__tests__/destinationErrors.test.ts`
Expected: PASS.

- [ ] **Step 7: Type check the client**

Run: `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"`
Expected: `93` or fewer.

- [ ] **Step 8: Commit**

```bash
git add client/src/types/trip.ts client/src/api/tripApi.ts client/src/utils/destinationErrors.ts client/src/__tests__/tripApi.test.ts client/src/__tests__/destinationErrors.test.ts vitest.config.ts
git commit -m "feat(client): trip copy API, dateless trip types and new destination error text

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Selector shows one entry per trip, in trip order

`listOptions.ts` gains trip grouping helpers that the selector and the Packing Lists page (Task 13) share.

**Files:**
- Modify: `client/src/utils/listOptions.ts` (rewrite)
- Modify: `client/src/__tests__/listOptions.test.ts` (rewrite)

`ActivePackingListSelector.tsx` needs no change. It already calls `buildListOptions(availableLists)` and `selectedOptionValue`, which keep their signatures (`buildListOptions` gains an optional `today` argument).

- [ ] **Step 1: Write the failing tests**

Replace the contents of `client/src/__tests__/listOptions.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { buildListOptions, selectedOptionValue, groupListsByTrip, sortTripGroups, tripGroupLabel } from '../utils/listOptions';

const summary = (
  tripId: string,
  tripName: string,
  destinationName: string,
  position: number,
  destinationCount: number,
  tripStartDate: string | null = null,
  tripEndDate: string | null = tripStartDate,
) => ({
  tripId, tripName, destinationId: `${tripId}-${position}`, destinationName, position, destinationCount,
  color: position === 0 ? 'blue' : 'green', tripStartDate, tripEndDate,
});

const TODAY = '2027-03-10';

const lists = [
  { id: 'camping', name: 'Camping', trip_destination: summary('t-camp', 'Camping', 'Camping', 0, 1) },
  { id: 'grandma', name: "Spring Break · Grandma's", trip_destination: summary('t-spring', 'Spring Break', "Grandma's", 1, 2, '2027-03-20', '2027-03-27') },
  { id: 'paris', name: 'Spring Break · Paris', trip_destination: summary('t-spring', 'Spring Break', 'Paris', 0, 2, '2027-03-20', '2027-03-27') },
  { id: 'ski', name: 'Ski', trip_destination: summary('t-ski', 'Ski', 'Ski', 0, 1, '2027-01-02', '2027-01-09') },
  { id: 'summer', name: 'Summer', trip_destination: summary('t-summer', 'Summer', 'Summer', 0, 1, '2027-07-01', '2027-07-08') },
  { id: 'now', name: 'Now', trip_destination: summary('t-now', 'Now', 'Now', 0, 1, '2027-03-08', '2027-03-12') },
  { id: 'beach', name: 'Beach' },
];

describe('groupListsByTrip', () => {
  it('puts every destination list of a trip in one group, in position order', () => {
    const spring = groupListsByTrip(lists).find(g => g.tripId === 't-spring')!;
    expect(spring.entries.map(e => e.list.id)).toEqual(['paris', 'grandma']);
    expect(spring.entries.map(e => e.destinationName)).toEqual(['Paris', "Grandma's"]);
    expect(spring).toMatchObject({ tripName: 'Spring Break', startDate: '2027-03-20', endDate: '2027-03-27' });
  });

  it('treats a list without a trip as its own dateless group', () => {
    const beach = groupListsByTrip(lists).find(g => g.key === 'list:beach')!;
    expect(beach).toMatchObject({ tripId: null, tripName: 'Beach', startDate: null });
    expect(beach.entries.map(e => e.list.id)).toEqual(['beach']);
  });
});

describe('sortTripGroups', () => {
  it('orders upcoming trips by start date, then past trips, then dateless trips by name', () => {
    const order = sortTripGroups(groupListsByTrip(lists), TODAY).map(g => g.tripName);
    expect(order).toEqual(['Now', 'Spring Break', 'Summer', 'Ski', 'Beach', 'Camping']);
  });
});

describe('tripGroupLabel', () => {
  it('names a one-destination trip by the trip and counts destinations otherwise', () => {
    const groups = groupListsByTrip(lists);
    expect(tripGroupLabel(groups.find(g => g.tripId === 't-spring')!)).toBe('Spring Break · 2 destinations');
    expect(tripGroupLabel(groups.find(g => g.tripId === 't-camp')!)).toBe('Camping');
  });
});

describe('buildListOptions', () => {
  it('gives one option per trip that opens its first destination', () => {
    expect(buildListOptions(lists, TODAY)).toEqual([
      { value: 'now', label: 'Now', listIds: ['now'] },
      { value: 'paris', label: 'Spring Break · 2 destinations', listIds: ['paris', 'grandma'] },
      { value: 'summer', label: 'Summer', listIds: ['summer'] },
      { value: 'ski', label: 'Ski', listIds: ['ski'] },
      { value: 'beach', label: 'Beach', listIds: ['beach'] },
      { value: 'camping', label: 'Camping', listIds: ['camping'] },
    ]);
  });

  it('selects the trip option for any of its destination lists', () => {
    const options = buildListOptions(lists, TODAY);
    expect(selectedOptionValue(options, 'grandma')).toBe('paris');
    expect(selectedOptionValue(options, 'beach')).toBe('beach');
    expect(selectedOptionValue(options, null)).toBe('');
    expect(selectedOptionValue(options, 'unknown')).toBe('');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run client/src/__tests__/listOptions.test.ts`
Expected: FAIL, "groupListsByTrip is not a function" (and the old option order and labels).

- [ ] **Step 3: Rewrite `client/src/utils/listOptions.ts`**

```ts
import type { ListTripSummary } from '../types/trip';

export interface ListOption {
  value: string;
  label: string;
  listIds: string[];
}

export interface ListLike {
  id: string;
  name: string;
  trip_destination?: ListTripSummary | null;
}

export interface TripGroupEntry<L extends ListLike = ListLike> {
  list: L;
  destinationId: string | null;
  destinationName: string;
  position: number;
  color: string | null;
}

export interface TripGroup<L extends ListLike = ListLike> {
  /** `trip:<id>`, or `list:<id>` for a list the server has not put in a trip. */
  key: string;
  tripId: string | null;
  tripName: string;
  startDate: string | null;
  endDate: string | null;
  entries: TripGroupEntry<L>[];
}

export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function groupListsByTrip<L extends ListLike>(lists: L[]): TripGroup<L>[] {
  const groups = new Map<string, TripGroup<L>>();
  for (const list of lists) {
    const trip = list.trip_destination ?? null;
    const key = trip ? `trip:${trip.tripId}` : `list:${list.id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        tripId: trip?.tripId ?? null,
        tripName: trip?.tripName ?? list.name,
        startDate: trip?.tripStartDate ?? null,
        endDate: trip?.tripEndDate ?? null,
        entries: [],
      };
      groups.set(key, group);
    }
    group.entries.push({
      list,
      destinationId: trip?.destinationId ?? null,
      destinationName: trip?.destinationName ?? list.name,
      position: trip?.position ?? 0,
      color: trip?.color ?? null,
    });
  }
  const result = Array.from(groups.values());
  for (const group of result) group.entries.sort((a, b) => a.position - b.position);
  return result;
}

// Upcoming (including ongoing) trips by start date, then past trips most recent first, then dateless trips by name.
export function sortTripGroups<L extends ListLike>(groups: TripGroup<L>[], today: string = todayIso()): TripGroup<L>[] {
  const rank = (g: TripGroup<L>) => (!g.startDate ? 2 : (g.endDate || g.startDate) >= today ? 0 : 1);
  return [...groups].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.startDate!.localeCompare(b.startDate!);
    if (ra === 1) return b.startDate!.localeCompare(a.startDate!);
    return a.tripName.localeCompare(b.tripName, undefined, { sensitivity: 'base' });
  });
}

export function tripGroupLabel(group: TripGroup<any>): string {
  const count = group.entries.length;
  return count >= 2 ? `${group.tripName} · ${count} destinations` : group.tripName;
}

// One option per trip; choosing it activates the trip's lowest-position destination list.
export function buildListOptions(lists: ListLike[], today: string = todayIso()): ListOption[] {
  return sortTripGroups(groupListsByTrip(lists), today).map(group => ({
    value: group.entries[0].list.id,
    label: tripGroupLabel(group),
    listIds: group.entries.map(e => e.list.id),
  }));
}

export function selectedOptionValue(options: ListOption[], activeListId: string | null): string {
  if (!activeListId) return '';
  return options.find(o => o.listIds.includes(activeListId))?.value ?? '';
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run client/src/__tests__/listOptions.test.ts`
Expected: PASS.

- [ ] **Step 5: Type check the client**

Run: `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"`
Expected: `93` or fewer.

- [ ] **Step 6: Commit**

```bash
git add client/src/utils/listOptions.ts client/src/__tests__/listOptions.test.ts
git commit -m "feat(client): active selector lists one entry per trip in trip order

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: `ManageDestinationsDrawer`

A bottom drawer that loads a trip and shows `TripPackingSection` for it. The dashboard (Task 11), the Edit list dialog (Task 12) and the Packing Lists page (Task 13) open it.

The drawer sits above the Edit list drawer (`zIndex` 3000), so it uses 3100. Mantine portals each `Menu` and `Modal` separately, so `TripPackingSection` and `AddDestinationDialog` get a `zIndex` prop that puts their own menus and modals above the drawer.

**Files:**
- Create: `client/src/components/ManageDestinationsDrawer.tsx`
- Create: `client/src/__tests__/ManageDestinationsDrawer.test.tsx`
- Modify: `client/src/components/TripPackingSection.tsx` (props `onOpenList`, `zIndex`)
- Modify: `client/src/components/AddDestinationDialog.tsx` (prop `zIndex`)
- Modify: `client/src/__tests__/TripPackingSection.test.tsx` (one new test)
- Modify: `vitest.config.ts` (include the new test)

- [ ] **Step 1: Write the failing drawer tests**

Create `client/src/__tests__/ManageDestinationsDrawer.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/tripApi', () => ({ tripApi: { getTrip: vi.fn() } }));
vi.mock('../components/TripPackingSection', () => ({
  default: ({ trip, onOpenList, zIndex }: any) => (
    <div>
      <span>{`packing for ${trip.name} at ${zIndex}`}</span>
      <button onClick={() => onOpenList?.()}>open a list</button>
    </div>
  ),
}));

import { tripApi } from '../api/tripApi';
import ManageDestinationsDrawer from '../components/ManageDestinationsDrawer';

const trip = { id: 't1', familyId: 'f1', name: 'Spring Break', startDate: null, endDate: null, createdAt: '', updatedAt: '' };

describe('ManageDestinationsDrawer', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads the trip and shows its destinations', async () => {
    (tripApi.getTrip as any).mockResolvedValue(trip);
    renderWithMantine(<ManageDestinationsDrawer opened tripId="t1" onClose={vi.fn()} />);
    expect(await screen.findByText('packing for Spring Break at 3100')).toBeTruthy();
    expect(screen.getByText('Spring Break destinations')).toBeTruthy();
    expect(tripApi.getTrip).toHaveBeenCalledWith('t1');
  });

  it('closes when a list is opened', async () => {
    (tripApi.getTrip as any).mockResolvedValue(trip);
    const onClose = vi.fn();
    renderWithMantine(<ManageDestinationsDrawer opened tripId="t1" onClose={onClose} />);
    await userEvent.click(await screen.findByRole('button', { name: 'open a list' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says so when the trip cannot be loaded', async () => {
    (tripApi.getTrip as any).mockRejectedValue(new Error('Trip not found'));
    renderWithMantine(<ManageDestinationsDrawer opened tripId="t1" onClose={vi.fn()} />);
    expect(await screen.findByText("Couldn't load this trip.")).toBeTruthy();
  });

  it('loads nothing while closed', () => {
    renderWithMantine(<ManageDestinationsDrawer opened={false} tripId="t1" onClose={vi.fn()} />);
    expect(tripApi.getTrip).not.toHaveBeenCalled();
  });
});
```

In `vitest.config.ts`, add directly after the `'client/src/__tests__/TripPackingSection.test.tsx', // Trip page packing cards` line:

```ts
      'client/src/__tests__/ManageDestinationsDrawer.test.tsx', // Destinations drawer
```

In `client/src/__tests__/TripPackingSection.test.tsx`, add this test after `'opens the dashboard on the destination list when a card is tapped'`:

```tsx
  it('tells the opener when a list is opened', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([paris]);
    const onOpenList = vi.fn();
    renderWithMantine(
      <MemoryRouter initialEntries={['/trips/t1']}>
        <Routes>
          <Route path="/trips/t1" element={<TripPackingSection trip={trip} onOpenList={onOpenList} />} />
          <Route path="/" element={<div>dashboard page</div>} />
        </Routes>
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open Paris packing list' }));
    expect(onOpenList).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run client/src/__tests__/ManageDestinationsDrawer.test.tsx client/src/__tests__/TripPackingSection.test.tsx`
Expected: FAIL. The drawer module does not exist, and `onOpenList` is never called.

- [ ] **Step 3: Add `onOpenList` and `zIndex` to `TripPackingSection`**

In `client/src/components/TripPackingSection.tsx`, replace the component signature line

```tsx
export default function TripPackingSection({ trip, onChanged }: { trip: Trip; onChanged?: () => void }) {
```

with

```tsx
export interface TripPackingSectionProps {
  trip: Trip;
  onChanged?: () => void;
  /** Called after a destination list is opened on the dashboard (the drawer closes itself). */
  onOpenList?: () => void;
  /** Set when shown inside a drawer, so menus and dialogs open above it. */
  zIndex?: number;
}

export default function TripPackingSection({ trip, onChanged, onOpenList, zIndex }: TripPackingSectionProps) {
  const layerZ = zIndex ? zIndex + 10 : undefined;
```

Replace `openOnDashboard` with:

```tsx
  const openOnDashboard = (destination: TripDestination) => {
    setActiveListId(destination.packingListId);
    navigate('/');
    onOpenList?.();
  };
```

Change `<Menu position="bottom-end" withinPortal>` to:

```tsx
              <Menu position="bottom-end" withinPortal zIndex={layerZ}>
```

Add `zIndex={layerZ}` to `<AddDestinationDialog ...>` (after `editing={dialog?.editing ?? null}`):

```tsx
        zIndex={layerZ}
```

and change the opening `<Modal` of the pending-delete dialog to:

```tsx
      <Modal
        opened={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        zIndex={layerZ}
```

(keep its `title` line and children as they are).

- [ ] **Step 4: Add `zIndex` to `AddDestinationDialog`**

In `client/src/components/AddDestinationDialog.tsx`, add to `AddDestinationDialogProps` after `onChanged?: () => void;`:

```ts
  zIndex?: number;
```

Change the destructuring line to:

```tsx
export default function AddDestinationDialog({ opened, onClose, trip, destinations, familyMembers, editing, onSaved, onChanged, zIndex }: AddDestinationDialogProps) {
```

Change the `<Modal ...>` opening tag to:

```tsx
    <Modal opened={opened} onClose={onClose} title={editing ? `Edit ${editing.name}` : 'Add destination'} fullScreen={!!isMobile} zIndex={zIndex}>
```

- [ ] **Step 5: Create `client/src/components/ManageDestinationsDrawer.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Drawer, Loader, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { tripApi } from '../api/tripApi';
import type { Trip } from '../types/trip';
import TripPackingSection from './TripPackingSection';

// Above GlobalListEditDrawer (3000), which can open this drawer.
export const DESTINATIONS_DRAWER_Z = 3100;

export interface ManageDestinationsDrawerProps {
  opened: boolean;
  tripId: string | null;
  /** The opener refreshes here. */
  onClose: () => void;
}

export default function ManageDestinationsDrawer({ opened, tripId, onClose }: ManageDestinationsDrawerProps) {
  const isMobile = useMediaQuery('(max-width: 48em)', undefined, { getInitialValueInEffect: false });
  const [trip, setTrip] = useState<Trip | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!opened || !tripId) return;
    let cancelled = false;
    setTrip(null);
    setFailed(false);
    tripApi
      .getTrip(tripId)
      .then(t => {
        if (!cancelled) setTrip(t);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [opened, tripId]);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size={isMobile ? '100%' : '80%'}
      padding="md"
      zIndex={DESTINATIONS_DRAWER_Z}
      title={trip ? `${trip.name} destinations` : 'Destinations'}
    >
      {failed && <Text size="sm" c="red">Couldn't load this trip.</Text>}
      {!failed && !trip && <Loader size="sm" aria-label="Loading trip" />}
      {trip && <TripPackingSection trip={trip} onOpenList={onClose} zIndex={DESTINATIONS_DRAWER_Z} />}
    </Drawer>
  );
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run client/src/__tests__/ManageDestinationsDrawer.test.tsx client/src/__tests__/TripPackingSection.test.tsx client/src/__tests__/AddDestinationDialog.test.tsx`
Expected: PASS.

- [ ] **Step 7: Type check the client**

Run: `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"`
Expected: `93` or fewer.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/ManageDestinationsDrawer.tsx client/src/__tests__/ManageDestinationsDrawer.test.tsx client/src/components/TripPackingSection.tsx client/src/components/AddDestinationDialog.tsx client/src/__tests__/TripPackingSection.test.tsx vitest.config.ts
git commit -m "feat(client): add ManageDestinationsDrawer

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: Dashboard: Destinations button replaces Split, sections use the label

**Files:**
- Modify: `client/src/utils/dashboardGroups.ts` (`BuildGroupInput.tripName`, group `name`)
- Modify: `client/src/components/Dashboard.tsx`
- Modify: `client/src/__tests__/dashboardGroups.test.ts` (one new test)
- Modify: `client/src/__tests__/Dashboard.test.tsx`

Every list now has a trip, so a lone list is a one-destination trip. The dashboard treats a trip as multi-destination only when it has two or more groups (`isTrip = groups.length > 1`). That keeps the one-list layout and hides the "<trip> · 1 destination" line for one-destination trips. The Destinations button shows whenever the list has a trip.

- [ ] **Step 1: Write the failing group-label test**

In `client/src/__tests__/dashboardGroups.test.ts`, add inside `describe('buildDestinationGroup', ...)`:

```ts
  it('labels a destination with its trip name', () => {
    const destination = { id: 'd1', tripId: 't1', name: 'Paris', color: 'blue', position: 0, packingListId: 'list-paris', memberIds: [] };
    const labelled = buildDestinationGroup({ listId: 'list-paris', listData: parisData, masterItems: master, familyMembers: family, currentUserId: null, destination, tripName: 'Spring Break' });
    expect(labelled.name).toBe('Spring Break · Paris');
    const same = buildDestinationGroup({ listId: 'list-paris', listData: parisData, masterItems: master, familyMembers: family, currentUserId: null, destination: { ...destination, name: 'spring break ' }, tripName: 'Spring Break' });
    expect(same.name).toBe('Spring Break');
  });
```

- [ ] **Step 2: Update the Dashboard tests**

In `client/src/__tests__/Dashboard.test.tsx`:

1. In the `vi.hoisted(() => ({ ... }))` object add `drawerProps: { last: null as any },`, and add `drawerProps` to the destructured names on the left of that statement.

2. Replace

```ts
  vi.mock('../components/SplitListDialog', () => ({ default: () => null }));
```

with

```ts
  vi.mock('../components/ManageDestinationsDrawer', () => ({
    default: (props: any) => {
      const React = require('react');
      drawerProps.last = props;
      return props.opened ? React.createElement('div', null, `destinations drawer for ${props.tripId}`) : null;
    },
  }));
```

3. In `beforeEach`, add `drawerProps.last = null;` after `addDrawerProps.last = null;`.

4. In `'loads every destination of the trip as a group'`, change the expected names line to:

```ts
      await waitFor(() => expect(columnsProps.last?.groups.map((g: any) => g.name)).toEqual(['Spring Break · Paris', "Spring Break · Grandma's"]));
```

5. Replace the test `'offers splitting an ordinary list'` with:

```ts
    it('opens the destinations drawer for the active trip and refreshes when it closes', async () => {
      (apiModule.getPackingList as any).mockImplementation(() => Promise.resolve({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: '' }, trip_destination: tripContext },
      }));
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Destinations' }));
      expect(screen.getByText('destinations drawer for t1')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Split by destination' })).toBeNull();

      const before = (apiModule.getPackingList as any).mock.calls.length;
      rtl.act(() => drawerProps.last.onClose());
      await waitFor(() => expect((apiModule.getPackingList as any).mock.calls.length).toBeGreaterThan(before));
      expect(screen.queryByText('destinations drawer for t1')).toBeNull();
    });

    it('shows a one-destination trip like a single list', async () => {
      const single = { tripId: 't2', tripName: 'Beach', destinations: [tripContext.destinations[0]] };
      (apiModule.getPackingList as any).mockImplementation(() => Promise.resolve({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: '' }, trip_destination: single },
      }));
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await waitFor(() => expect(columnsProps.last?.groups).toHaveLength(1));
      expect(columnsProps.last.isTrip).toBe(false);
      expect(screen.queryByText('Beach · 1 destination')).toBeNull();
      expect(await screen.findByRole('button', { name: 'Destinations' })).toBeTruthy();
    });

    it('has no Destinations button for a list without a trip', async () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await waitFor(() => expect(columnsProps.last?.groups).toHaveLength(1));
      expect(screen.queryByRole('button', { name: 'Destinations' })).toBeNull();
    });
```

6. In `'loads the whole trip in destination order when a later destination list is active'`, delete the line

```ts
      expect(screen.queryByRole('button', { name: 'Split by destination' })).toBeNull();
```

7. Replace the test `'disables splitting while offline'` with:

```ts
    it('disables Destinations while offline', async () => {
      (apiModule.getPackingList as any).mockImplementation(() => Promise.resolve({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: '' }, trip_destination: tripContext },
      }));
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      try {
        render(
          <MemoryRouter>
            <Dashboard />
          </MemoryRouter>
        );
        const button = await screen.findByRole('button', { name: 'Needs a connection' });
        expect((button as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByRole('button', { name: 'Destinations' })).toBeNull();
      } finally {
        delete (navigator as any).onLine;
      }
    });
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run client/src/__tests__/Dashboard.test.tsx client/src/__tests__/dashboardGroups.test.ts`
Expected: FAIL. Group names are still `Paris`/`Grandma's`, there is no Destinations button, and the one-destination trip has `isTrip` true.

- [ ] **Step 4: Label groups in `dashboardGroups.ts`**

In `client/src/utils/dashboardGroups.ts`, add the import at the top with the other imports:

```ts
import { destinationListLabel } from './destinationLabel';
```

Add to `BuildGroupInput` after `destination: TripDestination | null;`:

```ts
  /** When set, a destination group is named with the label ("Trip · Destination"). */
  tripName?: string | null;
```

Change the signature line to:

```ts
export function buildDestinationGroup({ listId, listData, masterItems, familyMembers, currentUserId, destination, tripName }: BuildGroupInput): DestinationGroup {
```

and the returned `name` line to:

```ts
    name: destination ? destinationListLabel(tripName, destination.name) : (listData?.list?.name || ''),
```

- [ ] **Step 5: Update `Dashboard.tsx`**

In `client/src/components/Dashboard.tsx`:

Replace `import SplitListDialog from './SplitListDialog';` with:

```ts
import ManageDestinationsDrawer from './ManageDestinationsDrawer';
```

Replace `const [splitOpen, setSplitOpen] = useState(false);` with:

```ts
  const [destinationsOpen, setDestinationsOpen] = useState(false);
```

In the `build` helper, add `tripName` after `destination,`:

```ts
        const build = (listId: string, destination: TripDestination | null) => buildDestinationGroup({
          listId,
          listData: listDataById.get(listId),
          masterItems,
          familyMembers,
          currentUserId: profileUserId,
          destination,
          tripName: trip?.tripName ?? null,
        });
```

Replace `const isTrip = !!tripInfo;` with:

```ts
  // A one-destination trip looks like a single list.
  const isTrip = groups.length > 1;
```

Replace the Split button block

```tsx
              {activeListId && !isTrip && groups.length > 0 && (
                <Button size="xs" variant="light" disabled={!online} onClick={() => setSplitOpen(true)}>
                  {online ? 'Split by destination' : 'Needs a connection'}
                </Button>
              )}
```

with

```tsx
              {activeListId && tripInfo && (
                <Button size="xs" variant="light" disabled={!online} onClick={() => setDestinationsOpen(true)}>
                  {online ? 'Destinations' : 'Needs a connection'}
                </Button>
              )}
```

Replace `{tripInfo && (` (the line before the "N destinations" `Text`) with:

```tsx
          {tripInfo && isTrip && (
```

Replace the whole `<SplitListDialog ... />` element with:

```tsx
          <ManageDestinationsDrawer
            opened={destinationsOpen}
            tripId={tripInfo?.id ?? null}
            onClose={() => {
              setDestinationsOpen(false);
              void refreshLists?.();
              refresh();
            }}
          />
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run client/src/__tests__/Dashboard.test.tsx client/src/__tests__/dashboardGroups.test.ts client/src/__tests__/DashboardViewToggle.test.tsx client/src/__tests__/TripPackingSection.test.tsx`
Expected: PASS.

- [ ] **Step 7: Type check the client**

Run: `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"`
Expected: `93` or fewer.

- [ ] **Step 8: Commit**

```bash
git add client/src/utils/dashboardGroups.ts client/src/components/Dashboard.tsx client/src/__tests__/dashboardGroups.test.ts client/src/__tests__/Dashboard.test.tsx
git commit -m "feat(client): dashboard Destinations button and labelled destination sections

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: Edit list dialog: label title, pencil renames the destination, Destinations link, Move carries items

**Files:**
- Modify: `client/src/components/GlobalListEditDrawer.tsx`
- Modify: `client/src/__tests__/GlobalListEditDrawer.test.tsx`
- Modify: `client/src/__tests__/GlobalListEditDrawer.destination.test.tsx`

The Edit list dialog for a destination list works like this:

- **Title:** the drawer title is the stored list name, which is the label. The inline name text next to the pencil is removed because it repeated the title.
- **Pencil:** it edits the destination name and saves through `tripApi.updateDestination`. The new label is then read back from the server.
- **Destinations button:** it opens `ManageDestinationsDrawer`. When that drawer closes, the dialog reloads.
- **Move:** in the member-conflict alert, Move uses `updateDestination(..., { memberIds, moveFrom: true })` on this list's own destination. The server then moves the person's items too. If the list's own destination is not in the loaded trip context, the old two-call path stays as a fallback.

- [ ] **Step 1: Update `GlobalListEditDrawer.test.tsx`**

In `client/src/__tests__/GlobalListEditDrawer.test.tsx`:

1. After `vi.mock('../components/AddItemsDrawer', ...)`, add:

```ts
  vi.mock('../api/tripApi', () => ({
    tripApi: { listDestinations: vi.fn(), updateDestination: vi.fn() },
  }));

  vi.mock('../components/ManageDestinationsDrawer', () => ({
    default: ({ opened, tripId }: any) => (opened ? require('react').createElement('div', null, `destinations drawer for ${tripId}`) : null),
  }));
```

2. In the `@mantine/core` mock's returned object, replace `Drawer: passthrough('div'),` with:

```ts
      Drawer: ({ children, title }: any) => React.createElement('div', null, React.createElement('h2', null, title), children),
```

3. Replace the `beforeAll` block with:

```ts
  let GlobalListEditDrawer: any;
  let tripApi: any;
  beforeAll(async () => {
    const mod = await import('../components/GlobalListEditDrawer');
    GlobalListEditDrawer = mod.default;
    tripApi = (await import('../api/tripApi')).tripApi;
  });
```

4. After the closing `});` of `describe('GlobalListEditDrawer', ...)` (before the final `}` of the `else` block), add:

```ts
  describe('GlobalListEditDrawer on a destination list', () => {
    let serverName = 'Spring Break · Paris';
    const destination = { id: 'dest-1', tripId: 'trip-1', name: 'Paris', color: 'blue', position: 0, packingListId: 'list-1', memberIds: [] };

    beforeEach(() => {
      vi.clearAllMocks();
      serverName = 'Spring Break · Paris';
      (api.getPackingList as any).mockImplementation(() => Promise.resolve({
        response: { ok: true },
        data: {
          items: [],
          template_ids: [],
          list: { name: serverName, member_ids: [] },
          trip_destination: { tripId: 'trip-1', tripName: 'Spring Break', destinations: [destination] },
        },
      }));
      (api.getCurrentUserProfile as any).mockResolvedValue({ response: { ok: true }, data: { family: { id: 'family-1', members: [] } } });
      (api.getItemGroups as any).mockResolvedValue({ response: { ok: true }, data: { itemGroups: [] } });
      tripApi.updateDestination.mockImplementation(async (_t: string, _d: string, payload: any) => {
        serverName = `Spring Break · ${payload.name}`;
        return { ...destination, name: payload.name };
      });
      refreshLists.mockResolvedValue(undefined);
    });

    it('titles the drawer with the label', async () => {
      await act(async () => {
        render(React.createElement(GlobalListEditDrawer));
      });
      expect(await screen.findByRole('heading', { name: 'Spring Break · Paris' })).toBeTruthy();
    });

    it('renames the destination with the pencil', async () => {
      await act(async () => {
        render(React.createElement(GlobalListEditDrawer));
      });
      await screen.findByRole('heading', { name: 'Spring Break · Paris' });
      await screen.findByText('No family members');

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Rename list' }));
      });
      const input = screen.getByDisplayValue('Paris');
      await act(async () => {
        fireEvent.change(input, { target: { value: 'Lyon' } });
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save list name' }));
      });

      await waitFor(() => expect(tripApi.updateDestination).toHaveBeenCalledWith('trip-1', 'dest-1', { name: 'Lyon' }));
      expect(await screen.findByRole('heading', { name: 'Spring Break · Lyon' })).toBeTruthy();
      expect(api.updatePackingList).not.toHaveBeenCalledWith('list-1', expect.objectContaining({ name: expect.anything() }));
      expect(refreshLists).toHaveBeenCalled();
    });

    it('opens the destinations drawer', async () => {
      await act(async () => {
        render(React.createElement(GlobalListEditDrawer));
      });
      await screen.findByText('No family members');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Destinations' }));
      });
      expect(screen.getByText('destinations drawer for trip-1')).toBeTruthy();
    });
  });
```

- [ ] **Step 2: Update `GlobalListEditDrawer.destination.test.tsx`**

In `client/src/__tests__/GlobalListEditDrawer.destination.test.tsx`:

1. After `vi.mock('../components/AddItemsDrawer', () => ({ default: () => null }));` add:

```ts
vi.mock('../components/ManageDestinationsDrawer', () => ({ default: () => null }));
```

2. Replace the first lines of `setup` so it accepts the trip's destinations:

```ts
async function setup(memberIds: string[] = ['m1'], destinations: any[] = []) {
  let utils: any;
  (api.getPackingList as any).mockResolvedValue({
    response: { ok: true },
    data: { name: 'Paris', items: [], template_ids: [], list: { member_ids: memberIds }, trip_destination: { tripId: 'trip-1', tripName: 'T', destinations } },
  });
```

(the rest of `setup` is unchanged).

3. In `'disables member checkboxes offline on a destination list'`, replace

```ts
    expect(screen.getByText('Needs a connection')).toBeTruthy();
```

with

```ts
    expect(screen.getAllByText('Needs a connection').length).toBeGreaterThan(0);
```

4. After the test `'Move updates the other destination then re-saves'`, add:

```ts
  it('Move on a known destination moves the person and their items in one call', async () => {
    (api.updatePackingList as any).mockResolvedValueOnce(conflict409).mockResolvedValue(ok);
    (tripApi.listDestinations as any).mockResolvedValue([{ id: 'dest-2', name: 'Rome', memberIds: ['m2', 'm3'] }]);
    (tripApi.updateDestination as any).mockResolvedValue({});
    await setup(['m1'], [{ id: 'dest-1', tripId: 'trip-1', name: 'Paris', color: 'blue', position: 0, packingListId: 'list-1', memberIds: ['m1'] }]);
    await tick('Bob');
    await act(async () => { fireEvent.click(await screen.findByText('Move')); });
    await waitFor(() => expect(tripApi.updateDestination).toHaveBeenCalledWith('trip-1', 'dest-1', { memberIds: ['m1', 'm2'], moveFrom: true }));
    expect(tripApi.updateDestination).not.toHaveBeenCalledWith('trip-1', 'dest-2', expect.anything());
    await waitFor(() => expect(box('Bob').checked).toBe(true));
  });
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run client/src/__tests__/GlobalListEditDrawer.test.tsx client/src/__tests__/GlobalListEditDrawer.destination.test.tsx`
Expected: FAIL. The heading is `Edit Packing List`, the pencil drafts the list name and calls `updatePackingList`, there is no Destinations button, and Move uses the two-call path.

- [ ] **Step 4: Update `GlobalListEditDrawer.tsx`**

In `client/src/components/GlobalListEditDrawer.tsx`:

1. Change the `destinationErrors` import line and add the drawer import below `MemberConflictAlert`:

```ts
import { describeMemberConflict, destinationErrorText } from '../utils/destinationErrors';
import MemberConflictAlert from './MemberConflictAlert';
import ManageDestinationsDrawer from './ManageDestinationsDrawer';
```

2. After `const [tripId, setTripId] = useState<string | null>(null);` add:

```ts
  const [ownDestination, setOwnDestination] = useState<{ id: string; name: string } | null>(null);
  const [destinationsOpen, setDestinationsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
```

3. In the load effect, after `setTripId(null);` add:

```ts
    setOwnDestination(null);
```

4. In the load effect, replace

```ts
        setCurrentName(res.data.name || listName || null);
        if (!isEditingNameRef.current) {
          setNameDraft(res.data.name || listName || '');
          setIsEditingName(false);
        }
```

with

```ts
        const storedName = res.data.list?.name || res.data.name || listName || null;
        setCurrentName(storedName);
        if (!isEditingNameRef.current) {
          setNameDraft(storedName || '');
          setIsEditingName(false);
        }
```

5. Replace

```ts
        setTripId(res.data.trip_destination?.tripId ?? null);
```

with

```ts
        setTripId(res.data.trip_destination?.tripId ?? null);
        const own = (res.data.trip_destination?.destinations || []).find((d: any) => d.packingListId === listId);
        setOwnDestination(own ? { id: own.id, name: own.name } : null);
```

6. Change the effect's dependency array from `[isOpen, listId, impersonatingFamilyId]` to:

```ts
  }, [isOpen, listId, impersonatingFamilyId, reloadKey]);
```

7. In `moveConflictMember`, replace the `sequence` definition with:

```ts
      const own = ownDestination;
      const sequence = (async () => {
        if (own) {
          // The server takes the person, and their items, out of the other destination.
          await tripApi.updateDestination(tripId, own.id, { memberIds: conflict.pending, moveFrom: true });
        } else {
          const other = (await tripApi.listDestinations(tripId)).find(d => d.id === conflict.destinationId);
          if (other) {
            await tripApi.updateDestination(tripId, other.id, { memberIds: other.memberIds.filter(id => id !== conflict.memberId) });
          }
        }
        return putMembers(conflict.pending, session);
      })();
```

8. Replace `startRenaming` with:

```ts
  const startRenaming = () => {
    isEditingNameRef.current = true;
    setNameDraft(ownDestination ? ownDestination.name : (currentName || listName || ''));
    setIsEditingName(true);
  };
```

9. Replace `saveListName` with:

```ts
  const saveListName = async () => {
    if (!listId) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      showNotification({ title: 'Error', message: 'List name is required', color: 'red' });
      return;
    }

    setSavingName(true);
    try {
      if (ownDestination && tripId) {
        await tripApi.updateDestination(tripId, ownDestination.id, { name: trimmed });
        const reloaded = await getPackingList(listId);
        const label = (reloaded.response.ok && (reloaded.data.list?.name || reloaded.data.name)) || trimmed;
        isEditingNameRef.current = false;
        setOwnDestination({ ...ownDestination, name: trimmed });
        setCurrentName(label);
        setNameDraft(trimmed);
        setIsEditingName(false);
        if (refreshLists) await refreshLists();
        showNotification({ title: 'Renamed', message: 'Destination renamed', color: 'green' });
        return;
      }
      const res = await updatePackingList(listId, { name: trimmed });
      if (res.response.ok) {
        isEditingNameRef.current = false;
        setCurrentName(trimmed);
        setNameDraft(trimmed);
        setIsEditingName(false);
        if (refreshLists) await refreshLists();
        showNotification({ title: 'Renamed', message: 'List renamed', color: 'green' });
      } else {
        showNotification({ title: 'Error', message: 'Failed to rename list', color: 'red' });
      }
    } catch (err) {
      console.error('Failed to rename list', err);
      showNotification({ title: 'Error', message: destinationErrorText(err, 'Failed to rename list'), color: 'red' });
    } finally {
      setSavingName(false);
    }
  };
```

10. Change the Drawer opening tag to:

```tsx
      <Drawer opened={isOpen} onClose={close} title={currentName || 'Edit Packing List'} position="right" size={720} padding="md">
```

11. Replace the non-editing branch

```tsx
                <>
                  <Text fw={700} style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentName || ''}</Text>
                  <ActionIcon aria-label="Rename list" onClick={startRenaming} size="md">
                    <IconEdit size={16} />
                  </ActionIcon>
                </>
```

with

```tsx
                <ActionIcon aria-label="Rename list" onClick={startRenaming} size="md">
                  <IconEdit size={16} />
                </ActionIcon>
```

12. Replace

```tsx
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <Button size="xs" onClick={() => openAddItemsPane()}>Add Items</Button>
            </div>
```

with

```tsx
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {tripId && (
                <Button size="xs" variant="light" disabled={!online} onClick={() => setDestinationsOpen(true)}>
                  {online ? 'Destinations' : 'Needs a connection'}
                </Button>
              )}
              <Button size="xs" onClick={() => openAddItemsPane()}>Add Items</Button>
            </div>
```

13. Directly after the closing `</Drawer>` of the main drawer (before `<AddItemsDrawer`), add:

```tsx
      <ManageDestinationsDrawer
        opened={destinationsOpen}
        tripId={tripId}
        onClose={() => {
          setDestinationsOpen(false);
          void refreshLists?.();
          setReloadKey(k => k + 1);
        }}
      />
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run client/src/__tests__/GlobalListEditDrawer.test.tsx client/src/__tests__/GlobalListEditDrawer.destination.test.tsx`
Expected: PASS.

- [ ] **Step 6: Type check the client**

Run: `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"`
Expected: `93` or fewer.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/GlobalListEditDrawer.tsx client/src/__tests__/GlobalListEditDrawer.test.tsx client/src/__tests__/GlobalListEditDrawer.destination.test.tsx
git commit -m "feat(client): edit dialog shows the label, renames the destination and opens Destinations

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 13: Manage Packing Lists shows one card per trip

**Files:**
- Modify: `client/src/components/ManagePackingLists.tsx`
- Modify: `client/src/__tests__/ManagePackingLists.test.tsx`

The page shows one card per trip, in the same order as the selector (`sortTripGroups`).

- **Card title:** `tripGroupLabel(group)`. An "Active" badge appears when the family's active list belongs to the trip.
- **Buttons:**
  - Set as active, which activates the trip's first destination list.
  - Edit, shown only for one-destination trips.
  - Destinations, which opens `ManageDestinationsDrawer`.
  - Copy, which calls `tripApi.copyTrip`.
  - Delete, which calls `tripApi.deleteTrip`.
- **Sub-rows:** a trip with two or more destinations lists one row per destination: a color dot, the destination name, the people, and Edit.
- **Split:** removed.
- **Offline:** Destinations, Copy and Delete are disabled and read "Needs a connection".
- **Legacy lists:** a list the server has not put in a trip (`trip_destination` is null, which should not happen after Task 2) still gets its own card. It keeps the old client-side copy and `deletePackingList` paths.

Most of this file (template drawer, AddItemsDrawer, ItemEditDrawer) is dead legacy code. Leave it alone. `noUnusedLocals` is on, so remove only what this task makes unused (`doDelete`, `splitTarget`, `activeTripId`, `isActiveRow`). Do not add any new unused names.

- [ ] **Step 1: Update the test mocks**

In `client/src/__tests__/ManagePackingLists.test.tsx`:

1. Add after `import * as api from '../api';`:

```ts
import { tripApi } from '../api/tripApi';
```

2. Replace the `vi.mock('../components/SplitListDialog', ...)` block with:

```ts
vi.mock('../components/ManageDestinationsDrawer', () => {
  const React = require('react');
  return { default: (props: any) => (props.opened ? React.createElement('div', null, `destinations drawer for ${props.tripId}`) : null) };
});
vi.mock('../api/tripApi', () => ({
  tripApi: { copyTrip: vi.fn(), deleteTrip: vi.fn() },
}));
```

- [ ] **Step 2: Replace the `'ManagePackingLists trip destinations'` describe block**

Replace the whole `describe('ManagePackingLists trip destinations', () => { ... });` block with:

```tsx
  describe('ManagePackingLists trip cards', () => {
    const summary = (
      tripId: string,
      tripName: string,
      destinationId: string,
      destinationName: string,
      position: number,
      destinationCount: number,
      color: string,
      tripStartDate: string | null,
      tripEndDate: string | null,
    ) => ({ tripId, tripName, destinationId, destinationName, position, destinationCount, color, tripStartDate, tripEndDate });

    beforeEach(() => {
      // Spring Break is dated far in the future so it always sorts before the dateless Ski trip.
      availableListsMock = [
        { id: 'list2', name: "Spring Break · Grandma's", member_ids: ['ava'], trip_destination: summary('t1', 'Spring Break', 'd2', "Grandma's", 1, 2, 'green', '2099-03-01', '2099-03-08') },
        { id: 'list1', name: 'Spring Break · Paris', member_ids: ['dad'], trip_destination: summary('t1', 'Spring Break', 'd1', 'Paris', 0, 2, 'blue', '2099-03-01', '2099-03-08') },
        { id: 'list3', name: 'Ski', member_ids: [], trip_destination: summary('t2', 'Ski', 'd3', 'Ski', 0, 1, 'blue', null, null) },
      ];
      refreshListsMock = vi.fn().mockResolvedValue(availableListsMock);
      const family = {
        id: 'f1',
        active_packing_list_id: 'list1',
        members: [{ id: 'dad', name: 'Dad' }, { id: 'ava', name: 'Ava' }],
      };
      (api.getCurrentUserProfile as any).mockResolvedValue({ response: { ok: true }, data: { family } });
      (tripApi.copyTrip as any).mockResolvedValue({
        trip: { id: 't9', name: 'Spring Break 2' },
        destinations: [{ id: 'd9', packingListId: 'list9' }],
      });
      (tripApi.deleteTrip as any).mockResolvedValue(undefined);
    });

    it('shows one card per trip with a sub-row per destination', async () => {
      renderPage();
      expect(await screen.findByText('Spring Break · 2 destinations')).toBeTruthy();
      expect(screen.getByText('Ski')).toBeTruthy();
      expect(screen.getByText('Paris')).toBeTruthy();
      expect(screen.getByText("Grandma's")).toBeTruthy();
      expect(await screen.findByText('Dad')).toBeTruthy();
      expect(screen.getByText('Ava')).toBeTruthy();
      await waitFor(() => expect(screen.getAllByText('Active')).toHaveLength(1));
      expect(screen.getAllByRole('button', { name: 'Set as active' })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Edit Paris' })).toBeTruthy();
      expect(screen.getByRole('button', { name: "Edit Grandma's" })).toBeTruthy();
      expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
      expect(screen.queryByRole('button', { name: 'Split' })).toBeNull();
    });

    it('sets a trip active through its first destination list', async () => {
      const u = await user.setup();
      renderPage();
      await screen.findByText('Spring Break · 2 destinations');
      await u.click(screen.getByRole('button', { name: 'Set as active' }));
      await waitFor(() => expect(api.setActivePackingList).toHaveBeenCalledWith('f1', 'list3'));
    });

    it('opens the destinations drawer for a trip', async () => {
      const u = await user.setup();
      renderPage();
      await screen.findByText('Spring Break · 2 destinations');
      await u.click(screen.getAllByRole('button', { name: 'Destinations' })[0]);
      expect(screen.getByText('destinations drawer for t1')).toBeTruthy();
    });

    it('copies a trip through the server', async () => {
      const u = await user.setup();
      renderPage();
      await screen.findByText('Spring Break · 2 destinations');
      await u.click(screen.getAllByRole('button', { name: 'Copy' })[0]);
      const input = screen.getByDisplayValue('Spring Break (copy)');
      await u.clear(input);
      await u.type(input, 'Spring Break 2');
      await u.click(screen.getByRole('checkbox'));
      await u.click(screen.getByRole('button', { name: 'Create new trip' }));
      await waitFor(() => expect(tripApi.copyTrip).toHaveBeenCalledWith('t1', { name: 'Spring Break 2', includeOneOffs: true }));
      await waitFor(() =>
        expect(showNotificationMock).toHaveBeenCalledWith({ title: 'Created', message: 'Trip copied', color: 'green' })
      );
    });

    it('shows a notification when copying fails', async () => {
      (tripApi.copyTrip as any).mockRejectedValueOnce(new Error('boom'));
      const u = await user.setup();
      renderPage();
      await screen.findByText('Spring Break · 2 destinations');
      await u.click(screen.getAllByRole('button', { name: 'Copy' })[0]);
      await u.click(screen.getByRole('button', { name: 'Create new trip' }));
      await waitFor(() =>
        expect(showNotificationMock).toHaveBeenCalledWith({ title: 'Error', message: 'Failed to copy trip', color: 'red' })
      );
    });

    it('deletes the whole trip after confirming', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      try {
        const u = await user.setup();
        renderPage();
        await screen.findByText('Spring Break · 2 destinations');
        const baselineRefreshCalls = refreshListsMock.mock.calls.length;
        await u.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
        expect(confirmSpy).toHaveBeenCalledWith('Delete Spring Break and its 2 destination lists?');
        await waitFor(() => expect(tripApi.deleteTrip).toHaveBeenCalledWith('t1'));
        await waitFor(() => expect(refreshListsMock.mock.calls.length).toBeGreaterThan(baselineRefreshCalls));
        expect(api.deletePackingList).not.toHaveBeenCalled();
      } finally {
        confirmSpy.mockRestore();
      }
    });

    it('does not delete when the confirmation is cancelled', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      try {
        const u = await user.setup();
        renderPage();
        await screen.findByText('Ski');
        await u.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
        expect(confirmSpy).toHaveBeenCalledWith('Delete Ski?');
        expect(tripApi.deleteTrip).not.toHaveBeenCalled();
      } finally {
        confirmSpy.mockRestore();
      }
    });

    it('disables trip actions with "Needs a connection" while offline', async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      try {
        renderPage();
        await screen.findByText('Spring Break · 2 destinations');
        const buttons = screen.getAllByRole('button', { name: 'Needs a connection' }) as HTMLButtonElement[];
        expect(buttons).toHaveLength(6);
        buttons.forEach(b => expect(b.disabled).toBe(true));
        expect(screen.queryByRole('button', { name: 'Destinations' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
      } finally {
        delete (navigator as any).onLine;
      }
    });
  });
```

The `'ManagePackingLists active list actions'` describe block stays as it is. Its lists (`Beach`, `Ski`) have no `trip_destination`, so they render as legacy one-list cards with the same "Active" and "Set as active" behaviour.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run client/src/__tests__/ManagePackingLists.test.tsx`
Expected: FAIL. The new `trip cards` tests fail: there is no card label "Spring Break · 2 destinations", no Destinations button, and `tripApi.copyTrip` and `deleteTrip` are never called. If the run errors because `../components/ManageDestinationsDrawer` cannot be resolved, Task 10 has not been done yet. Do Task 10 first.

- [ ] **Step 4: Update imports and state in `ManagePackingLists.tsx`**

1. Replace

```ts
import SplitListDialog from './SplitListDialog';
```

with

```ts
import ManageDestinationsDrawer from './ManageDestinationsDrawer';
import { tripApi } from '../api/tripApi';
import { groupListsByTrip, sortTripGroups, tripGroupLabel, type TripGroup } from '../utils/listOptions';
```

2. Replace

```ts
  const [splitTarget, setSplitTarget] = useState<{ id: string; name: string } | null>(null);
```

with

```ts
  const [destinationsTripId, setDestinationsTripId] = useState<string | null>(null);
  const [copySourceTrip, setCopySourceTrip] = useState<{ id: string; name: string } | null>(null);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
```

3. Replace

```ts
            setActiveFamilyListId(familyRes.data.family.active_packing_list_id ?? null);
```

with

```ts
            setActiveFamilyListId(familyRes.data.family.active_packing_list_id ?? null);
            setFamilyMembers(familyRes.data.family.members || []);
```

4. Replace

```ts
            setActiveFamilyListId(profile.data.family.active_packing_list_id ?? null);
```

with

```ts
            setActiveFamilyListId(profile.data.family.active_packing_list_id ?? null);
            setFamilyMembers(profile.data.family.members || []);
```

- [ ] **Step 5: Replace `doDelete` with trip-level actions**

Replace the whole `const doDelete = async (id: string) => { ... };` function with:

```ts
  const setActiveGroup = async (group: TripGroup<any>) => {
    if (!familyId) return;
    const listId = group.entries[0].list.id;
    try {
      const res = await setActivePackingList(familyId, listId);
      if (!res.response.ok) {
        showNotification({ title: 'Error', message: 'Failed to set active list', color: 'red' });
        return;
      }
      setActiveFamilyListId(listId);
      showNotification({ title: 'Updated', message: 'Active list updated', color: 'green' });
      await reload();
    } catch {
      showNotification({ title: 'Error', message: 'Failed to set active list', color: 'red' });
    }
  };

  const deleteGroup = async (group: TripGroup<any>) => {
    const count = group.entries.length;
    const question = count > 1
      ? `Delete ${group.tripName} and its ${count} destination lists?`
      : `Delete ${group.tripName}?`;
    if (!confirm(question)) return;
    try {
      if (group.tripId) {
        await tripApi.deleteTrip(group.tripId);
      } else {
        const res = await deletePackingList(group.entries[0].list.id);
        if (!res.response.ok) throw new Error('Failed to delete list');
      }
      showNotification({ title: 'Deleted', message: `${group.tripName} deleted`, color: 'green' });
      await reload();
    } catch {
      showNotification({ title: 'Error', message: `Failed to delete ${group.tripName}`, color: 'red' });
    }
  };

  const memberNamesFor = (list: any): string =>
    (Array.isArray(list.member_ids) ? list.member_ids : [])
      .map((id: string) => familyMembers.find(m => m.id === id))
      .filter(Boolean)
      .map((m: any) => m.name || m.username)
      .join(', ');
```

- [ ] **Step 6: Make Copy work per trip**

1. Replace

```ts
  const openCopyFor = async (list: any) => {
    setCopySourceList(list);
```

with

```ts
  const openCopyFor = async (group: TripGroup<any>) => {
    if (group.tripId) {
      setCopySourceTrip({ id: group.tripId, name: group.tripName });
      setCopySourceList(null);
      setCopyName(`${group.tripName} (copy)`);
      setCopyIncludeOneOffs(false);
      setShowCopyDrawer(true);
      return;
    }
    await openListCopyFor(group.entries[0].list);
  };

  const openListCopyFor = async (list: any) => {
    setCopySourceTrip(null);
    setCopySourceList(list);
```

2. Replace

```ts
  const createCopy = async () => {
    if (!copySourceList) return;
```

with

```ts
  const createCopy = async () => {
    if (copySourceTrip) {
      if (!copyName.trim()) {
        showNotification({ title: 'Error', message: 'Trip name is required', color: 'red' });
        return;
      }
      setCopyLoading(true);
      try {
        const result = await tripApi.copyTrip(copySourceTrip.id, { name: copyName.trim(), includeOneOffs: copyIncludeOneOffs });
        showNotification({ title: 'Created', message: 'Trip copied', color: 'green' });
        setShowCopyDrawer(false);
        setCopySourceTrip(null);
        setCopyName('');
        await reload();
        const firstListId = result.destinations[0]?.packingListId;
        if (firstListId && requestOpenEdit) requestOpenEdit(firstListId);
      } catch {
        showNotification({ title: 'Error', message: 'Failed to copy trip', color: 'red' });
      } finally {
        setCopyLoading(false);
      }
      return;
    }
    if (!copySourceList) return;
```

The rest of `createCopy` (the legacy client-side copy) stays unchanged.

- [ ] **Step 7: Replace the list render**

Replace everything from

```tsx
  const activeTripId = lists.find(l => l.id === activeFamilyListId)?.trip_destination?.tripId ?? null;
```

down to and including the `</Stack>` that closes the `<Stack mt="sm">` (just before `{/* Rename modal removed - rename is now available inside the Edit modal */}`) with:

```tsx
  const groups = sortTripGroups(groupListsByTrip(lists));
  const activeGroupKey = groups.find(g => g.entries.some(e => e.list.id === activeFamilyListId))?.key ?? null;

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Title order={4}>Manage Packing Lists</Title>
      <Stack mt="sm">
        {groups.length === 0 ? (
          <Text c="dimmed">No packing lists yet</Text>
        ) : (
          groups.map(group => (
            <Card key={group.key} withBorder padding="sm" radius="md">
              <Group gap="xs">
                <Text fw={600}>{tripGroupLabel(group)}</Text>
                {group.key === activeGroupKey && <Badge color="green" variant="light">Active</Badge>}
              </Group>
              <Group gap="xs" mt="xs">
                {group.key !== activeGroupKey && (
                  <Button size="xs" disabled={!familyId} onClick={() => { void setActiveGroup(group); }}>
                    Set as active
                  </Button>
                )}
                {group.entries.length === 1 && (
                  <Button size="xs" onClick={() => openEditFor(group.entries[0].list)}>Edit</Button>
                )}
                {group.tripId && (
                  <Button size="xs" variant="light" disabled={!online} onClick={() => setDestinationsTripId(group.tripId)}>
                    {online ? 'Destinations' : 'Needs a connection'}
                  </Button>
                )}
                <Button size="xs" variant="light" disabled={!online} onClick={() => { void openCopyFor(group); }}>
                  {online ? 'Copy' : 'Needs a connection'}
                </Button>
                <Button size="xs" color="red" variant="light" disabled={!online} onClick={() => { void deleteGroup(group); }}>
                  {online ? 'Delete' : 'Needs a connection'}
                </Button>
              </Group>
              {group.entries.length >= 2 && (
                <Stack gap={4} mt="xs">
                  {group.entries.map(entry => (
                    <Group key={entry.list.id} justify="space-between" wrap="nowrap">
                      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            flexShrink: 0,
                            background: `var(--mantine-color-${entry.color || 'blue'}-6)`,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={500}>{entry.destinationName}</Text>
                          <Text size="xs" c="dimmed">{memberNamesFor(entry.list) || 'No one yet'}</Text>
                        </div>
                      </Group>
                      <Button
                        size="xs"
                        variant="subtle"
                        aria-label={`Edit ${entry.destinationName}`}
                        onClick={() => openEditFor(entry.list)}
                      >
                        Edit
                      </Button>
                    </Group>
                  ))}
                </Stack>
              )}
            </Card>
          ))
        )}
      </Stack>
```

- [ ] **Step 8: Update the copy drawer and swap the dialog**

1. In the Copy Drawer, replace

```tsx
        onClose={() => { setShowCopyDrawer(false); setCopySourceList(null); }}
        title={`Copy Packing List`}
```

with

```tsx
        onClose={() => { setShowCopyDrawer(false); setCopySourceList(null); setCopySourceTrip(null); }}
        title={copySourceTrip ? `Copy ${copySourceTrip.name}` : 'Copy Packing List'}
```

2. Replace

```tsx
            <Text mb="xs">New list name</Text>
            <TextInput value={copyName} onChange={(e) => setCopyName(e.currentTarget.value)} placeholder="New list name" />
```

with

```tsx
            <Text mb="xs">{copySourceTrip ? 'New trip name' : 'New list name'}</Text>
            <TextInput value={copyName} onChange={(e) => setCopyName(e.currentTarget.value)} placeholder={copySourceTrip ? 'New trip name' : 'New list name'} />
```

3. Replace

```tsx
            <Button onClick={createCopy} loading={copyLoading}>Create New List</Button>
```

with

```tsx
            <Button onClick={createCopy} loading={copyLoading}>{copySourceTrip ? 'Create new trip' : 'Create New List'}</Button>
```

4. Replace the whole `<SplitListDialog ... />` element (from `<SplitListDialog` through its closing `/>`) with:

```tsx
      <ManageDestinationsDrawer
        opened={!!destinationsTripId}
        tripId={destinationsTripId}
        onClose={() => {
          setDestinationsTripId(null);
          void reload();
        }}
      />
```

- [ ] **Step 9: Run the tests and watch them pass**

Run: `npx vitest run client/src/__tests__/ManagePackingLists.test.tsx`
Expected: PASS (6 active-list tests and 8 trip-card tests).

- [ ] **Step 10: Type check the client**

Run: `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"`
Expected: `93` or fewer. If it went up, run `npx tsc -p client/tsconfig.json --noEmit | grep ManagePackingLists`. A new `TS6133` usually means a leftover unused name such as `doDelete` or `isActiveRow`. Remove that name; do not suppress the error.

- [ ] **Step 11: Commit**

```bash
git add client/src/components/ManagePackingLists.tsx client/src/__tests__/ManagePackingLists.test.tsx
git commit -m "feat(client): manage lists shows one card per trip with destinations, copy and delete

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 14: Add/Edit destination sends `moveFrom`, asks about shared items, and hides Delete on the last destination

**Files:**
- Modify: `client/src/components/AddDestinationDialog.tsx`
- Modify: `client/src/components/TripPackingSection.tsx`
- Modify: `client/src/__tests__/AddDestinationDialog.test.tsx`
- Modify: `client/src/__tests__/TripPackingSection.test.tsx`

**AddDestinationDialog changes:**

- **No more client-side pre-moves.** Today the dialog takes people out of their old destination with separate PUTs, then creates or updates, and rolls back on failure. That path never carried items. Now it sends one request with `moveFrom: true` whenever a selected person belongs to another destination in the freshly fetched list, or after the user presses Move in the conflict alert. The server moves the people and their items in one transaction (Tasks 3–5).
- **Empty-destination check stays.** The client check still runs first, so the notification "Cannot move everyone" appears without a request. The server also refuses with `would_empty_destination`, which `destinationErrorText` turns into readable text.
- **Shared-items choice.** When adding a destination to a trip that has exactly one destination, a radio group asks "Keep shared items in <existing>" or "Move to <new name>". The choice is sent as `sharedItemsTo`, but only if the fresh destination list still has one entry.
- **Existing lists.** "Use an existing list" now offers lists that are the only destination of another trip, plus legacy lists with no trip. The server adopts the list and retires its old one-destination trip (Task 3).

**TripPackingSection change:** the Delete menu item is hidden when the trip has only one destination. The server would refuse with `last_destination` anyway.

This task builds on Task 10, which already added the `zIndex` props to both components. Apply these edits on top of it.

- [ ] **Step 1: Rewrite the move-related AddDestinationDialog tests**

In `client/src/__tests__/AddDestinationDialog.test.tsx`:

1. Replace the test `'moves a traveler out of another destination after confirming'` with:

```tsx
  it('moves a traveler out of another destination in one request after confirming', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    (tripApi.listDestinations as any).mockResolvedValue([grandma]);
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: "Ava (at Grandma's)" }));
    expect(confirm).toHaveBeenCalledWith("Move Ava from Grandma's?");
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', expect.objectContaining({ memberIds: ['ava'], moveFrom: true }));
  });
```

2. Replace the test `'asks to move a traveler the server says is already elsewhere, then retries'` with:

```tsx
  it('asks to move a traveler the server says is already elsewhere, then retries with moveFrom', async () => {
    const stale = [{ ...grandma, memberIds: ['leo'] }];
    const fresh = [{ ...grandma, memberIds: ['ava', 'leo'] }];
    (tripApi.listDestinations as any).mockResolvedValueOnce(stale).mockResolvedValue(fresh);
    (tripApi.createDestination as any).mockRejectedValueOnce(conflict('ava', 'd1')).mockResolvedValueOnce({});
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={stale} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ava' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText("Ava is already in Grandma's on this trip. Move them here?")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', expect.not.objectContaining({ moveFrom: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
    expect(tripApi.createDestination).toHaveBeenCalledTimes(2);
    expect(tripApi.createDestination).toHaveBeenLastCalledWith('t1', expect.objectContaining({ memberIds: ['ava'], moveFrom: true }));
  });
```

3. Replace the test `'uses freshly fetched destinations, not the stale prop, for moves'` with:

```tsx
  it('uses freshly fetched destinations, not the stale prop, to decide on moveFrom', async () => {
    const beach = { ...grandma, id: 'd2', name: 'Beach', memberIds: ['leo', 'dad'] };
    (tripApi.listDestinations as any).mockResolvedValue([{ ...grandma, memberIds: ['ava'] }, beach]);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dad' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', {
      name: 'Paris', memberIds: ['dad'], itemGroupIds: [], packingListId: undefined, moveFrom: true,
    });
  });
```

4. Replace the test `'restores moved travelers and calls onChanged when the final create fails'` with:

```tsx
  it('changes nothing on the client and reports the error when the create fails', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([grandma]);
    (tripApi.createDestination as any).mockRejectedValueOnce(new Error('boom'));
    vi.stubGlobal('confirm', vi.fn(() => true));
    const onSaved = vi.fn();
    const onChanged = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={null} onSaved={onSaved} onChanged={onChanged} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: "Ava (at Grandma's)" }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: "Couldn't save the destination. Please try again.",
    })));
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
```

5. Replace the test `'shows a generic message when a preliminary move hits a 409'` with these three tests:

```tsx
  it('sends moveFrom when editing pulls a traveler from another destination', async () => {
    const paris = { id: 'd2', tripId: 't1', name: 'Paris', color: 'blue', position: 1, packingListId: 'l2', memberIds: ['dad'] };
    (tripApi.listDestinations as any).mockResolvedValue([grandma, paris]);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma, paris]} familyMembers={familyMembers} editing={paris} onSaved={onSaved} />
    );
    await userEvent.click(screen.getByRole('checkbox', { name: "Ava (at Grandma's)" }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateDestination).toHaveBeenCalledTimes(1);
    expect(tripApi.updateDestination).toHaveBeenCalledWith('t1', 'd2', { name: 'Paris', memberIds: ['dad', 'ava'], moveFrom: true });
  });

  it('keeps shared items in the existing destination by default when the trip has one destination', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([grandma]);
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    expect((screen.getByRole('radio', { name: "Keep shared items in Grandma's" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('radio', { name: 'Move to Paris' })).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dad' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', {
      name: 'Paris', memberIds: ['dad'], itemGroupIds: [], packingListId: undefined, sharedItemsTo: 'existing',
    });
  });

  it('moves shared items to the new destination when chosen', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([grandma]);
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    expect(screen.getByRole('radio', { name: 'Move to the new destination' })).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('radio', { name: 'Move to Paris' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dad' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', expect.objectContaining({ sharedItemsTo: 'new' }));
  });

  it('does not ask about shared items when editing or when the trip has several destinations', async () => {
    const beach = { ...grandma, id: 'd2', name: 'Beach', memberIds: ['dad'] };
    const { unmount } = renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma, beach]} familyMembers={familyMembers} editing={null} onSaved={vi.fn()} />
    );
    expect(screen.queryByRole('radio')).toBeNull();
    unmount();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={grandma} onSaved={vi.fn()} />
    );
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('offers lists that are the only destination of another trip as existing lists', async () => {
    (getFamilyPackingLists as any).mockResolvedValue({
      response: { ok: true },
      data: {
        lists: [
          { id: 'solo', name: 'Camping', trip_destination: { tripId: 't7', destinationCount: 1 } },
          { id: 'multi', name: 'Easter · Rome', trip_destination: { tripId: 't8', destinationCount: 2 } },
          { id: 'mine', name: "Spring Break · Grandma's", trip_destination: { tripId: 't1', destinationCount: 1 } },
          { id: 'legacy', name: 'Old list', trip_destination: null },
        ],
      },
    });
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[]} familyMembers={familyMembers} editing={null} onSaved={vi.fn()} />
    );
    await userEvent.click(await screen.findByRole('textbox', { name: 'Use an existing list (optional)' }));
    expect(await screen.findByRole('option', { name: 'Camping' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Old list' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Easter · Rome' })).toBeNull();
    expect(screen.queryByRole('option', { name: "Spring Break · Grandma's" })).toBeNull();
  });
```

The other tests stay as they are. `'creates a destination with travelers and item groups'` still expects the exact payload without `moveFrom` or `sharedItemsTo`, because the fresh destination list is empty.

- [ ] **Step 2: Update the TripPackingSection tests**

In `client/src/__tests__/TripPackingSection.test.tsx`:

1. In `'deletes an empty destination and reloads'`, replace the body with:

```tsx
    vi.stubGlobal('confirm', vi.fn(() => true));
    (tripApi.listDestinations as any).mockResolvedValueOnce([paris, grandma]).mockResolvedValueOnce([grandma]);
    (tripApi.deleteDestination as any).mockResolvedValue(undefined);
    renderSection();
    await openMenu('Paris');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(tripApi.deleteDestination).toHaveBeenCalledWith('t1', 'd1', {});
    await waitFor(() => expect(screen.queryByText('Paris')).toBeNull());
    expect(screen.getByText("Grandma's")).toBeTruthy();
```

2. In `'does not delete when the confirm is cancelled'`, `'shows a readable error when deleting fails'` and `'disables destination changes while offline but still opens lists'`, change `mockResolvedValue([paris])` to `mockResolvedValue([paris, grandma])`.

3. Add this test after `'does not delete when the confirm is cancelled'`:

```tsx
  it('hides Delete on the last destination', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([paris]);
    renderSection();
    await openMenu('Paris');
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
  });
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run client/src/__tests__/AddDestinationDialog.test.tsx client/src/__tests__/TripPackingSection.test.tsx`
Expected: FAIL. The new and rewritten AddDestinationDialog tests fail: `updateDestination` is called for pre-moves, there is no `moveFrom`, there are no radios, and `Camping` is filtered out. `'hides Delete on the last destination'` also fails.

- [ ] **Step 4: Update `AddDestinationDialog.tsx`**

1. Change the Mantine import to add `Radio`:

```ts
import { Button, Chip, Group, Loader, Modal, Radio, Select, Stack, Text, TextInput } from '@mantine/core';
```

2. Change the types import to:

```ts
import type { DestinationWritePayload, Trip, TripDestination } from '../types/trip';
```

3. After `const [conflictLoading, setConflictLoading] = useState(false);` add:

```ts
  const [sharedItemsTo, setSharedItemsTo] = useState<'existing' | 'new'>('existing');
```

4. In the open effect, after `setConflictLoading(false);` add:

```ts
    setSharedItemsTo('existing');
```

5. Replace

```ts
        setFreeLists(listsRes.response.ok ? (listsRes.data.lists || []).filter((l: any) => !l.trip_destination) : []);
```

with

```ts
        // A list can join this trip if it has no trip or is the only destination of another trip.
        const adoptable = (l: any) =>
          !l.trip_destination || (l.trip_destination.destinationCount === 1 && l.trip_destination.tripId !== trip.id);
        setFreeLists(listsRes.response.ok ? (listsRes.data.lists || []).filter(adoptable) : []);
```

and change the effect's dependency array to `[opened, editing, trip.familyId, trip.id]`.

6. Replace the whole `save` function and the whole `moveAndRetry` function with:

```ts
  const save = async (forceMove = false) => {
    setSaving(true);
    setConflict(null);
    try {
      const current = await tripApi.listDestinations(trip.id);
      const others = current.filter(d => d.id !== editing?.id);
      // Fail before sending anything if a move would leave another destination empty.
      const emptied = others.find(d => d.memberIds.length > 0 && d.memberIds.every(id => memberIds.includes(id)));
      if (emptied) {
        showNotification({ title: 'Cannot move everyone', message: `${emptied.name} needs at least one traveler`, color: 'red' });
        return;
      }
      // The server moves these people, and their items, in the same transaction.
      const moveFrom = forceMove || others.some(d => d.memberIds.some(id => memberIds.includes(id)));
      const move = moveFrom ? { moveFrom: true } : {};
      if (editing) {
        const unchanged = memberIds.length === editing.memberIds.length && memberIds.every(id => editing.memberIds.includes(id));
        await tripApi.updateDestination(trip.id, editing.id, unchanged ? { name: name.trim() } : { name: name.trim(), memberIds, ...move });
      } else {
        const payload: DestinationWritePayload = {
          name: name.trim(),
          memberIds,
          itemGroupIds,
          packingListId: existingListId || undefined,
          ...move,
        };
        if (current.length === 1) payload.sharedItemsTo = sharedItemsTo;
        await tripApi.createDestination(trip.id, payload);
      }
      onSaved();
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiConflictError && err.body?.error === 'member_in_other_destination') {
        // Someone else moved this person since the dialog loaded.
        const { memberId, destinationId } = err.body;
        setConflictLoading(true);
        const info = await describeMemberConflict(trip.id, memberId, destinationId);
        setConflictLoading(false);
        setConflict({ memberId, destinationId, ...info });
      } else {
        showNotification({ title: 'Could not save destination', message: destinationErrorText(err, FALLBACK_ERROR), color: 'red' });
      }
    } finally {
      setSaving(false);
    }
  };

  const moveAndRetry = () => {
    if (!conflict) return;
    void save(true);
  };
```

7. Directly after the `{!editing && freeLists.length > 0 && ( <Select ... /> )}` block, add:

```tsx
        {!editing && destinations.length === 1 && (
          <Radio.Group
            label="Shared items (for the whole family)"
            value={sharedItemsTo}
            onChange={value => setSharedItemsTo(value === 'new' ? 'new' : 'existing')}
          >
            <Stack gap="xs" mt="xs">
              <Radio value="existing" label={`Keep shared items in ${destinations[0].name}`} />
              <Radio value="new" label={`Move to ${name.trim() || 'the new destination'}`} />
            </Stack>
          </Radio.Group>
        )}
```

8. Change the Save button's `onClick={save}` to `onClick={() => { void save(); }}`. Without this, the click event would be passed as `forceMove`.

If `DestinationWritePayload` in `client/src/types/trip.ts` does not yet have `moveFrom?: boolean` and `sharedItemsTo?: 'existing' | 'new'`, Task 8 has not been done yet. Do Task 8 first.

- [ ] **Step 5: Hide Delete on the last destination**

In `client/src/components/TripPackingSection.tsx`, wrap the Delete `<Menu.Item color="red" ...>Delete</Menu.Item>` element so it reads:

```tsx
                  {destinations.length > 1 && (
                    <Menu.Item
                      color="red"
                      disabled={!online}
                      onClick={() => {
                        if (window.confirm(`Delete ${destination.name}?`)) void deleteDestination(destination);
                      }}
                    >
                      Delete
                    </Menu.Item>
                  )}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run client/src/__tests__/AddDestinationDialog.test.tsx client/src/__tests__/TripPackingSection.test.tsx client/src/__tests__/ManageDestinationsDrawer.test.tsx`
Expected: PASS.

- [ ] **Step 7: Type check the client**

Run: `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"`
Expected: `93` or fewer.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/AddDestinationDialog.tsx client/src/components/TripPackingSection.tsx client/src/__tests__/AddDestinationDialog.test.tsx client/src/__tests__/TripPackingSection.test.tsx
git commit -m "feat(client): destinations move people with their items, ask about shared items, keep the last one

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 15: Trips page creates trips without dates and groups dateless trips under "No dates"

**Files:**
- Modify: `client/src/pages/TripsPage.tsx`
- Modify: `client/src/__tests__/TripsPage.test.tsx`

**Creating a trip:**

- Only the name is required now.
- Dates are sent only when both are filled in. If only one is filled in, the page shows "Add both dates or leave both empty." and sends nothing.
- The server gives the new trip a first destination with the whole family (Task 6), so it immediately has a packing list.

**The list:**

- Dated trips render first, in the order the server returns them.
- Dateless trips follow under a `No dates` heading.
- The date line on a card is only rendered when it has text.

- [ ] **Step 1: Add the failing tests**

In `client/src/__tests__/TripsPage.test.tsx`, add these tests inside `describe('TripsPage', ...)`, after `'creates a trip from the inline create form'`:

```tsx
  it('creates a trip with only a name', async () => {
    (tripApi.listTrips as any).mockResolvedValue([]);
    (tripApi.createTrip as any).mockResolvedValue({ id: 'trip-2', familyId: 'fam-1', name: 'Weekend', startDate: null, endDate: null, createdAt: '', updatedAt: '' });

    renderWithMantine(<TripsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /create trip/i }));
    fireEvent.change(screen.getByPlaceholderText(/trip name/i), { target: { value: '  Weekend ' } });
    fireEvent.click(screen.getByRole('button', { name: /save trip/i }));

    await waitFor(() => expect(tripApi.createTrip).toHaveBeenCalledWith({ name: 'Weekend' }));
  });

  it('requires a name', async () => {
    (tripApi.listTrips as any).mockResolvedValue([]);

    renderWithMantine(<TripsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /create trip/i }));
    fireEvent.click(screen.getByRole('button', { name: /save trip/i }));

    expect(await screen.findByText('Trip name is required')).toBeTruthy();
    expect(tripApi.createTrip).not.toHaveBeenCalled();
  });

  it('asks for both dates or neither', async () => {
    (tripApi.listTrips as any).mockResolvedValue([]);

    renderWithMantine(<TripsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /create trip/i }));
    fireEvent.change(screen.getByPlaceholderText(/trip name/i), { target: { value: 'Cabo' } });
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: /save trip/i }));

    expect(await screen.findByText('Add both dates or leave both empty.')).toBeTruthy();
    expect(tripApi.createTrip).not.toHaveBeenCalled();
  });

  it('lists dateless trips under a "No dates" heading after dated trips', async () => {
    (tripApi.listTrips as any).mockResolvedValue([
      { id: 'trip-3', familyId: 'fam-1', name: 'Weekend', startDate: null, endDate: null, createdAt: '', updatedAt: '' },
      { id: 'trip-1', familyId: 'fam-1', name: 'Cabo', startDate: '2026-09-01', endDate: '2026-09-08', createdAt: '', updatedAt: '' },
    ]);

    renderWithMantine(<TripsPage />);

    const heading = await screen.findByText('No dates');
    const cabo = screen.getByText('Cabo');
    const weekend = screen.getByText('Weekend');
    expect(cabo.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(weekend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Sep 1 – Sep 8, 2026')).toBeTruthy();
  });

  it('does not show a "No dates" heading when every trip has dates', async () => {
    (tripApi.listTrips as any).mockResolvedValue([
      { id: 'trip-1', familyId: 'fam-1', name: 'Cabo', startDate: '2026-09-01', endDate: '2026-09-08', createdAt: '', updatedAt: '' },
    ]);

    renderWithMantine(<TripsPage />);

    expect(await screen.findByText('Cabo')).toBeTruthy();
    expect(screen.queryByText('No dates')).toBeNull();
  });
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run client/src/__tests__/TripsPage.test.tsx`
Expected: FAIL. With only a name, the page shows "Name, start date, and end date are required" and never calls `createTrip`. There is no "No dates" heading.

- [ ] **Step 3: Update `createTrip` in `TripsPage.tsx`**

Replace the whole `const createTrip = async () => { ... };` function with:

```tsx
  const createTrip = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Trip name is required');
      return;
    }
    if (!!startDate !== !!endDate) {
      setError('Add both dates or leave both empty.');
      return;
    }
    try {
      setCreating(true);
      setError(null);
      await tripApi.createTrip(startDate && endDate ? { name: trimmed, startDate, endDate } : { name: trimmed });
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
```

- [ ] **Step 4: Group dateless trips**

1. In `tripCard`, replace

```tsx
      <Text size="sm" c="dimmed">{formatTripDateRange(trip.startDate, trip.endDate)}</Text>
```

with

```tsx
      {formatTripDateRange(trip.startDate, trip.endDate) && (
        <Text size="sm" c="dimmed">{formatTripDateRange(trip.startDate, trip.endDate)}</Text>
      )}
```

2. Directly after the `tripCard` function, add:

```tsx
  const datedTrips = trips.filter(trip => !!trip.startDate);
  const datelessTrips = trips.filter(trip => !trip.startDate);

  const renderTrips = (group: Trip[]) =>
    viewMode === 'card' ? (
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>{group.map(tripCard)}</SimpleGrid>
    ) : (
      <Stack gap="xs">{group.map(tripCard)}</Stack>
    );
```

3. Replace

```tsx
      ) : viewMode === 'card' ? (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>{trips.map(tripCard)}</SimpleGrid>
      ) : (
        <Stack gap="xs">{trips.map(tripCard)}</Stack>
      )}
```

with

```tsx
      ) : (
        <Stack gap="lg">
          {datedTrips.length > 0 && renderTrips(datedTrips)}
          {datelessTrips.length > 0 && (
            <div>
              <Title order={4} mb="xs">No dates</Title>
              {renderTrips(datelessTrips)}
            </div>
          )}
        </Stack>
      )}
```

4. Make the date inputs read as optional. Change their labels to `"Start date (optional)"` and `"End date (optional)"`. The tests query `/start date/i` and `/end date/i`, so they still match.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run client/src/__tests__/TripsPage.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 6: Type check the client**

Run: `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"`
Expected: `93` or fewer. `tripApi.createTrip` takes `Partial<Trip>`, so `{ name }` alone type-checks once Task 8 has made the dates optional.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/TripsPage.tsx client/src/__tests__/TripsPage.test.tsx
git commit -m "feat(client): trips can be created without dates and show under No dates

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 16: Remove `SplitListDialog`

**Files:**
- Delete: `client/src/components/SplitListDialog.tsx`
- Delete: `client/src/__tests__/SplitListDialog.test.tsx`
- Modify: `vitest.config.ts` (drop the include entry)

Tasks 11 and 13 replaced every use of the dialog with "Destinations". The server split route (`POST /trips/:tripId/split`) and `tripApi.splitList` stay for old clients and keep their tests (`trip-split.*` server tests and `tripApi.test.ts`).

- [ ] **Step 1: Confirm nothing imports the dialog any more**

Run: `grep -rn "SplitListDialog" client/src --include=*.ts --include=*.tsx`
Expected: matches only in `client/src/components/SplitListDialog.tsx` and `client/src/__tests__/SplitListDialog.test.tsx`. If `Dashboard.tsx`, `ManagePackingLists.tsx` or their tests still mention it, finish Task 11 and Task 13 first.

- [ ] **Step 2: Delete the dialog and its test**

```bash
git rm client/src/components/SplitListDialog.tsx client/src/__tests__/SplitListDialog.test.tsx
```

- [ ] **Step 3: Drop the vitest include entry**

In `vitest.config.ts`, delete this line:

```ts
      'client/src/__tests__/SplitListDialog.test.tsx', // Split-by-destination dialog
```

- [ ] **Step 4: Verify nothing references it**

Run: `grep -rn "SplitListDialog" client/src vitest.config.ts --include=*.ts --include=*.tsx`
Expected: no output (exit code 1). The docs in `client/src/APIUsage.md` and `client/src/components/ComponentUsage.md` are updated in Task 17.

- [ ] **Step 5: Run the client tests that used to mock it, and type check**

Run: `npx vitest run client/src/__tests__/Dashboard.test.tsx client/src/__tests__/ManagePackingLists.test.tsx client/src/__tests__/tripApi.test.ts`
Expected: PASS.

Run: `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"`
Expected: `93` or fewer. Deleting the file can only remove errors.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts
git commit -m "chore(client): remove SplitListDialog; Destinations replaces Split

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 17: Update the usage docs

**Files:**
- Modify: `client/src/APIUsage.md`
- Modify: `client/src/components/ComponentUsage.md`
- Modify: `docs/ServerAPIUsage.md`

The repo guidelines require these maps to stay current whenever components or API helpers change. This task is documentation only, so there are no tests.

- [ ] **Step 1: `client/src/APIUsage.md`**

1. Delete these two lines:

```
  - client/src/components/SplitListDialog.tsx (uses `getFamily`)
```

```
  - client/src/components/SplitListDialog.tsx (`getPackingList`, `getFamily`)
```

2. Replace

```
- `getTrips`, `createTrip`, `updateTrip`, `deleteTrip`:
  - client/src/pages/TripsPage.tsx
- `getTrip`, `listElements`, `listParticipants`:
  - client/src/pages/TripDetailPage.tsx
```

with

```
- `getTrips`, `createTrip` (dates optional; the trip starts with one destination), `updateTrip` (a rename also renames its destination lists), `deleteTrip` (also deletes the trip's destinations and lists):
  - client/src/pages/TripsPage.tsx
  - client/src/components/ManagePackingLists.tsx (`deleteTrip` from a trip card)
- `copyTrip`:
  - client/src/components/ManagePackingLists.tsx (Copy on a trip card; creates a dateless copy with every destination)
- `getTrip`, `listElements`, `listParticipants`:
  - client/src/pages/TripDetailPage.tsx
  - client/src/components/ManageDestinationsDrawer.tsx (`getTrip`)
```

3. Replace

```
- `listDestinations`, `deleteDestination` (409 `destination_has_items` → `ApiConflictError`):
  - client/src/components/TripPackingSection.tsx (`listDestinations` is also used by `AddDestinationDialog.tsx` and `SplitListDialog.tsx`)
- `createDestination`, `updateDestination`:
  - client/src/components/AddDestinationDialog.tsx (`updateDestination` is also used by `SplitListDialog.tsx`)
- `splitList` (409 `member_in_other_destination` → `ApiConflictError`):
  - client/src/components/SplitListDialog.tsx
- `listTrips`, `createTrip`:
  - client/src/components/SplitListDialog.tsx (pick or create the trip being split into)
```

with

```
- `listDestinations`, `deleteDestination` (409 `destination_has_items` or `last_destination` → `ApiConflictError`):
  - client/src/components/TripPackingSection.tsx (`listDestinations` is also used by `AddDestinationDialog.tsx`, `GlobalListEditDrawer.tsx` and `utils/destinationErrors.ts`)
- `createDestination` (`moveFrom`, `sharedItemsTo`), `updateDestination` (`moveFrom`):
  - client/src/components/AddDestinationDialog.tsx (`updateDestination` is also used by `GlobalListEditDrawer.tsx` to rename the destination and to Move a person with their items)
- `splitList`:
  - not used by the UI (kept for old clients; Destinations replaced Split)
```

- [ ] **Step 2: `client/src/components/ComponentUsage.md`**

1. Replace

```
### ActivePackingListSelector
**Used in:**
  - `Dashboard`
```

with

```
### ActivePackingListSelector
**Used in:**
  - `Dashboard`

One entry per trip, labelled "<trip>" or "<trip> · N destinations" (`utils/listOptions.ts`). Upcoming trips come first by start date, then past trips (most recent first), then dateless trips by name. Choosing a trip activates its first destination's list.
```

2. Replace

```
### GlobalListEditDrawer
**Used in:**
  - `SplitRailLayout`
  - `ManagePackingLists`
```

with

```
### GlobalListEditDrawer
**Used in:**
  - `SplitRailLayout`
  - `ManagePackingLists`

The title is the list's label. On a destination list the pencil renames the destination, "Destinations" opens `ManageDestinationsDrawer`, and Move in the member-conflict alert moves the person with their items (`moveFrom`).
```

3. Replace

```
### ManagePackingLists
**Used in:**
  - `src/pages/PackingListPage`
```

with

```
### ManagePackingLists
**Used in:**
  - `src/pages/PackingListPage`

One card per trip with Set as active, Edit (one-destination trips), Destinations (`ManageDestinationsDrawer`), Copy (`tripApi.copyTrip`) and Delete (`tripApi.deleteTrip`). Trips with several destinations list each destination with its color, people and an Edit button. Trip actions are disabled offline.
```

4. Replace the whole `### SplitListDialog` section (heading, "Used in" list and description paragraph) with:

```
### ManageDestinationsDrawer
**Used in:**
  - `Dashboard` ("Destinations")
  - `GlobalListEditDrawer` ("Destinations")
  - `ManagePackingLists` ("Destinations" on a trip card)

Bottom drawer (full height on phones) that hosts `TripPackingSection` for one trip, so destinations can be added, renamed, re-peopled or deleted without leaving the page. Opening a destination list closes it.
```

5. Replace

```
### TripPackingSection
**Used in:**
  - `TripDetailPage`

Destination cards with travelers and progress. Tapping a card opens the dashboard; the menu renames, changes travelers or deletes. Calls `onChanged` after a destination is saved or deleted so the page reloads; write actions are disabled offline.
```

with

```
### TripPackingSection
**Used in:**
  - `TripDetailPage`
  - `ManageDestinationsDrawer`

Destination cards with travelers and progress. Tapping a card opens the dashboard; the menu renames, changes travelers or deletes. Delete is hidden on a trip's last destination. Calls `onChanged` after a destination is saved or deleted so the page reloads; write actions are disabled offline.
```

6. Replace

```
Create or edit a destination: name, travelers (moving someone from another destination asks first via `MemberConflictAlert`), optional item groups, or an existing list. Calls `onChanged` after saving.
```

with

```
Create or edit a destination: name, travelers (moving someone from another destination asks first, then sends `moveFrom` so their items follow; `MemberConflictAlert` covers server conflicts), optional item groups, or an existing list (one with no trip, or the only destination of another trip). When the trip has one destination, asks whether shared items stay or move to the new one. Calls `onChanged` after saving.
```

7. In the `### MemberConflictAlert` "Used in" list, delete the line:

```
  - `SplitListDialog`
```

- [ ] **Step 3: `docs/ServerAPIUsage.md`**

1. Replace

```
- POST /families/:familyId/packing-lists
  - Purpose: Create a packing list for a family (optionally populate from template).
```

with

```
- POST /families/:familyId/packing-lists
  - Purpose: Create a packing list for a family (optionally populate from template). The list gets its own dateless trip with one destination named after the list.
```

2. Replace

```
  - Purpose: Update packing list metadata (name, template assignments, memberIds, etc.). With `memberIds` on a destination list, enforces the one-destination-per-person rule (409 `member_in_other_destination`).
```

with

```
  - Purpose: Update packing list metadata (name, template assignments, memberIds, etc.). With `memberIds` on a destination list, enforces the one-destination-per-person rule (409 `member_in_other_destination`). A `name` on a destination list renames the destination; the stored list name becomes its label ("<trip> · <destination>", or the trip name when they match).
```

3. Replace

```
  - Purpose: Soft-delete a packing list. For a trip destination list, the destination is soft-deleted too.
```

with

```
  - Purpose: Delete a packing list. If it is its trip's only destination, the whole trip is deleted (as `DELETE /trips/:tripId`). Otherwise its destination is deleted with the list (`deleteList`).
```

4. Directly before the `## Trip Destinations` heading, add:

```
## Trips

- GET /trips
  - Purpose: The family's trips, including dateless ones.
  - Client helper: `tripApi.listTrips`

- POST /trips
  - Purpose: Create a trip. Only `name` is required; dates are optional. The trip starts with one destination named after it, with `memberIds` (default: every family member).
  - Client helper: `tripApi.createTrip`

- PUT /trips/:tripId
  - Purpose: Update a trip. A rename also renames any destination that had the trip's old name, then renames the destination lists to their new labels.
  - Client helper: `tripApi.updateTrip`

- DELETE /trips/:tripId
  - Purpose: Delete a trip with its destinations and their lists.
  - Client helper: `tripApi.deleteTrip`

- POST /trips/:tripId/copy
  - Purpose: Body `{ name, includeOneOffs }`. Creates a dateless trip with a copy of every destination and its list (members, item groups, unchecked items; one-off items only with `includeOneOffs`). Returns 201 `{ trip, destinations }`.
  - Client helper: `tripApi.copyTrip`

---

```

5. Replace

```
  - Purpose: Create a destination with a new list (or adopt `packingListId`), set members, add item groups. 409 `member_in_other_destination` when a person is already in another destination.
```

with

```
  - Purpose: Create a destination with a new list (or adopt `packingListId`, which must have no trip or be the only destination of another trip), set members, add item groups. 409 `member_in_other_destination` when a person is already in another destination, unless `moveFrom: true`, which moves them with their items. `sharedItemsTo: 'existing' | 'new'` (only used when the trip had one destination) decides where whole-family items go.
```

6. Replace

```
  - Purpose: Rename, recolor, reorder or change members (same 409 rule).
```

with

```
  - Purpose: Rename, recolor, reorder or change members (same 409 rule; `moveFrom: true` moves people with their items; 400 `would_empty_destination` if that would leave another destination with nobody). Renaming updates the list name to the label.
```

7. Replace

```
  - Purpose: Remove a destination atomically. Body `{ moveSharedItemsTo?, deleteList? }`; 409 `destination_has_items` when the list has items and neither is given.
```

with

```
  - Purpose: Remove a destination atomically. Body `{ moveSharedItemsTo?, deleteList? }`; 409 `last_destination` when it is the trip's only destination; 409 `destination_has_items` when the list has items and neither is given. A kept list moves into its own new trip.
```

8. Replace

```
  - Purpose: Split a list into destinations in one transaction (personal items follow their people with their checks; shared items go to the chosen destination). Returns `{ destinations, skippedCount }`.
```

with

```
  - Purpose: Kept for old clients. Split a list into destinations in one transaction on the shared move logic (personal items follow their people with their checks; shared items go to the chosen destination). Returns `{ destinations, skippedCount }`.
```

- [ ] **Step 4: Check that no stale references remain**

Run: `grep -n "SplitListDialog" client/src/APIUsage.md client/src/components/ComponentUsage.md docs/ServerAPIUsage.md`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add client/src/APIUsage.md client/src/components/ComponentUsage.md docs/ServerAPIUsage.md
git commit -m "docs: usage maps for trip-per-list, Destinations drawer and trip copy

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 18: Full verification and the 390px check

**Files:** none. Only fix-up commits if verification finds problems.

- [ ] **Step 1: Type check both projects**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no output, exit code 0.

Run: `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"`
Expected: `93` or fewer. If the count went up, run `npx tsc -p client/tsconfig.json --noEmit | grep "error TS" | grep -v TS6133 | head` and `git diff main --stat` to find the file that added errors. Fix it; do not suppress the error.

- [ ] **Step 2: Run every test touched by this plan in one go**

```bash
npx vitest run \
  server/utils/destinationLabel.test.ts \
  server/__tests__/trip-shells-migration.test.ts \
  server/repositories/tripDestinationRepository.test.ts \
  server/repositories/tripRepository.test.ts \
  server/services/tripSplitService.test.ts \
  server/services/tripListService.test.ts \
  server/__tests__/trip-destinations.routes.test.ts \
  server/__tests__/trips.routes.test.ts \
  server/__tests__/packing-list.integration.test.ts \
  server/__tests__/routes.test.ts \
  server/__tests__/active-packing-list.events.test.ts \
  server/__tests__/template-propagation.test.ts \
  server/__tests__/middleware/tripAccessMiddleware.test.ts \
  client/src/__tests__/destinationLabel.test.ts \
  client/src/__tests__/tripApi.test.ts \
  client/src/__tests__/destinationErrors.test.ts \
  client/src/__tests__/listOptions.test.ts \
  client/src/__tests__/ManageDestinationsDrawer.test.tsx \
  client/src/__tests__/TripPackingSection.test.tsx \
  client/src/__tests__/AddDestinationDialog.test.tsx \
  client/src/__tests__/Dashboard.test.tsx \
  client/src/__tests__/dashboardGroups.test.ts \
  client/src/__tests__/GlobalListEditDrawer.test.tsx \
  client/src/__tests__/GlobalListEditDrawer.destination.test.tsx \
  client/src/__tests__/ManagePackingLists.test.tsx \
  client/src/__tests__/TripsPage.test.tsx
```

Expected: every file passes.

- [ ] **Step 3: Run the whole suite**

Run: `npx vitest run`
Expected: everything that passed before this plan still passes. For any failing file, check whether it also fails without this plan's changes. The base is commit `748f8d9` ("Spec: every list belongs to a trip").

```bash
git stash -u            # only if there are uncommitted changes
git checkout 748f8d9
npx vitest run <failing file>
git checkout -          # back to feature/multi-destination-trip-lists
git stash pop           # only if you stashed
```

A failure that also happens on the base is pre-existing. Note it in your report and leave it alone. A failure that only happens with this plan's changes must be fixed before continuing.

- [ ] **Step 4: Confirm the old dialog and the old list naming are gone**

Run: `grep -rn "SplitListDialog" client/src vitest.config.ts --include=*.ts --include=*.tsx; grep -rn '– \${' server --include=*.ts`
Expected: no output. The old `${trip} – ${destination}` list names came from `tripSplitService.ts` and `tripRoutes.ts`. Both now use `destinationListLabel`.

- [ ] **Step 5: Apply the migration to the shared dev database**

A dev server (`tsx watch server/index.ts` plus `vite` on port 3000) normally already runs from this worktree. On startup the server applies pending migrations, recording them in `data/migrations.json` and first backing up the database to `data/travel-list.sqlite.<timestamp>.bak`. Server edits made during this plan restart it through `tsx watch`.

1. Check whether the migration has run: `grep -c 20261109_01_trip_shells_for_lists data/migrations.json`
   - `1`: it has run. Continue to item 3.
   - `0`: restart the dev server. Find the PIDs with `ps aux | grep -E "tsx watch|vite" | grep -v grep`, stop them with `kill <pid>`, then start `npm run dev` in a detached background session. Look for "Found 1 pending migration(s)" and "DB backed up to" in its output, and re-run the grep.
2. Do not use `node server/migrations/run-migrations.cjs up` for this. That CLI records migrations in the tracked `server/migrations/migrations.json` rather than `data/migrations.json`, so the server would try to apply the migration again.
3. Confirm every list now has a trip:

```bash
node -e "
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('data/travel-list.sqlite', sqlite3.OPEN_READONLY);
db.all(\`SELECT
  (SELECT COUNT(*) FROM packing_lists pl WHERE pl.deleted_at IS NULL AND NOT EXISTS (
     SELECT 1 FROM trip_destinations d WHERE d.packing_list_id = pl.id AND d.deleted_at IS NULL)) AS lists_without_trip,
  (SELECT COUNT(*) FROM trips WHERE deleted_at IS NULL) AS trips\`, (e, r) => { console.log(e || r); db.close(); });
"
```

Expected: `lists_without_trip: 0`. Before the migration this database had 9 lists without a trip and 2 trips, so `trips` should now be at least 11.

- [ ] **Step 6: Manual check at 390px**

Open `http://localhost:3000`, sign in, and set the browser devtools viewport to 390×844. Then:

1. **Selector:** the active-list selector shows one entry per trip. The two-list trip reads "<trip> · 2 destinations". Upcoming trips come first, then past ones, then dateless ones by name.
2. **Manage Packing Lists:**
   - Every list is a trip card, and the two-destination trip shows sub-rows with color dots and people.
   - Copy a one-list trip. A new dateless trip "<name> (copy)" appears.
   - Delete that copy. The card disappears.
3. **Main check: people move with their items.** On the dashboard, pick a one-list trip that has personal items for at least two people. Tap **Destinations**, then **+ Add destination**. Name it "Grandma's", select one person already on the list (confirm "Move <name> from <trip>?"), choose **Move to Grandma's** for shared items, and save. Then confirm all of the following:
   - The drawer shows two destination cards.
   - The selector entry now reads "<trip> · 2 destinations".
   - That person's items, including any already checked, now appear under Grandma's in both Person view and Columns view, and no longer appear in the original destination.
   - The shared items moved to Grandma's.
4. **Edit list dialog:**
   - Open Edit list on the new destination. The title is "<trip> · Grandma's".
   - Rename it with the pencil to "Nana's". The title becomes "<trip> · Nana's".
5. **Last destination:**
   - In Destinations, delete Nana's. Its menu offers Delete because there are two destinations.
   - On the destination that remains, the menu has no Delete.
6. **Trips page:**
   - Trips created by the migration and by Copy appear under "No dates".
   - Create a trip with only a name. It appears under "No dates" and in the selector.
7. **Offline:** use devtools Network → Offline. Destinations, Copy and Delete read "Needs a connection" and are disabled. Turn the network back on.

Report anything that doesn't behave as described, with what you saw; don't paper over it.

- [ ] **Step 7: Final commit, if anything changed**

Run: `git status --short`

If verification led to fixes, commit them with a descriptive message ending in the `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer. Do not commit anything under `data/`; it is git-ignored.

---

## Self-review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Label "Trip · Destination", or the trip name when the names match (case and space insensitive); server and client copies with the same tests | 1 |
| Stored list name always equals the label: on destination create and rename, on adopt, on trip rename | 3 (`syncListNamesTx`), 4, 5, 6, 7 |
| Migration steps 1–6: linked lists, member-conflict shell, unlinked lists, memberless lists, trips without destinations, renames, tracking table, down | 2 |
| `moveMembersTx`: move, copy with checks, whole-family rows stay; split runs on it | 3 |
| `moveFrom: true` on destination PUT and POST | 4, 5 (server); 12, 14 (client) |
| `sharedItemsTo` on the first added destination | 4, 5 (server); 14 (client) |
| `POST /trips`: optional dates, optional `memberIds`, first destination | 4, 6 |
| `PUT /trips/:tripId` rename sync | 4, 6 |
| `DELETE /trips/:tripId` cascades | 4 (repository), 6 |
| `POST /trips/:tripId/copy` | 4, 6 (server); 8, 13 (client) |
| `POST /families/:familyId/packing-lists` creates a shell trip | 7 |
| `DELETE /packing-lists/:id`: one-destination trip and multi-destination trip | 7 (new test plus the existing `'soft-deletes the destination when its list is deleted via the list route'`) |
| `DELETE …/destinations/:id` returns 409 `last_destination` | 4, 5; the UI hides the action in 14 |
| Destination PUT writes the label and renames a one-destination trip | 4, 5 |
| `trip_destination` always present; `GET /trips` includes dateless trips | 2 (data), 6 (test) |
| `/split` kept, on the shared logic | 3 |
| Selector: one entry per trip, order, lowest-position list activated | 9 |
| Dashboard: Destinations replaces Split; labels | 11 |
| Edit list dialog: label title, pencil renames the destination, Destinations link | 12 |
| ManagePackingLists: cards, ACTIVE badge, actions, sub-rows, Edit on one-destination cards, New List unchanged | 13 |
| `ManageDestinationsDrawer`: bottom, full height on phones, loads trip, renders `TripPackingSection`, `onClose` refreshes the opener | 10 (opened from 11, 12, 13) |
| AddDestinationDialog: `moveFrom` after confirmation, shared-items question; Delete hidden on last destination | 14 |
| TripsPage: "No dates" group, create without dates | 15 |
| SplitListDialog, its tests and its entry points removed | 11, 13, 16 |
| Offline: destination, trip and copy actions show "Needs a connection" | 10, 11, 12, 13, 14 |
| Errors: moves and copy run in one transaction; client notifies on failure | 3, 4 (transactions); 13, 14 (notifications) |
| Usage docs | 17 |
| Manual 390px check against the migrated shared database | 18 |

### Placeholder scan

- Searched every task for "TBD", "TODO", "implement later", "similar to Task" and "add appropriate". Nothing found.
- Every code step contains the complete code, or an exact find/replace pair.

### Type and name consistency

These names and signatures match across tasks and the preamble's "Shared names" block:

- `destinationListLabel`, `namesMatch`
- `moveMembersTx`, `pullMembersIntoDestinationTx`
- `LastDestinationError`, `createShellTripForListTx`, `renameDestinationTx`, `applyTripRenameTx`, `deleteDestinationTx`, `copyTrip`
- `TripGroup` / `groupListsByTrip` / `sortTripGroups` / `tripGroupLabel`
- `ManageDestinationsDrawer({ opened, tripId, onClose })`
- `DestinationWritePayload.moveFrom` / `sharedItemsTo`
- `tripApi.copyTrip`

The error codes agree in the server tasks (4, 5), `destinationErrors.ts` (8) and the docs (17):

- `would_empty_destination`: 400
- `last_destination`: 409
- `invalid_shared_items_to`: 400

### Known limits, accepted

- Shell trips made by the migration get no `trip_participants`. The spec does not ask for them, and live destination writes add participants as people are set.
- In multi-destination Columns view, column labels repeat the trip name ("Trip · Paris"), because the spec says section labels use `destinationListLabel`.
- Mantine notifications render below drawers with zIndex 3000 or more. That was already true of the Edit list dialog and is unchanged here.
