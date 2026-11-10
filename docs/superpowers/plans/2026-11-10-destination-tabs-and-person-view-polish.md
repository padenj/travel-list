# Destination Tabs and Person View Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/superpowers/specs/2026-11-10-destination-tabs-and-person-view-polish-design.md`.

**Architecture:** These are client-only changes to three areas:

- Dashboard grouping and `PersonView`: shorter titles, a combined section for a destination with one traveler, and the show-packed toggle.
- The dashboard view toggle.
- `GlobalListEditDrawer`: destination tabs.

**Tech stack:** React 18, Mantine 8, vitest with Testing Library.

## Conventions

- **Repo:** `/config/.paseo/worktrees/0zd8zt0o/lazy-dragonfly`, branch `feature/multi-destination-trip-lists`.
- **Tests:** run from the repo root with `npx vitest run <files>`. A client test file only runs if it is listed in the `include` array of `vitest.config.ts`.
- **Type check:** `npx tsc -p client/tsconfig.json --noEmit | grep -c "error TS"` must stay at 93 or below.
- **Workflow:** TDD. Write a failing test, run it and watch it fail, implement, run it and watch it pass, then commit.
- **Commits:** stage only the task's files with `git add <paths>`. End every message with `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- **Don't touch:** `/tmp`, `data/`, or the dev server on ports 3000 and 3001.
- **Mobile first:** everything must work at 390px width, with tap targets at least 36px.

---

### Task 1: Shorter titles and a combined section for a single traveler

**Files:**
- Modify: `client/src/utils/dashboardGroups.ts` (`buildDestinationGroup` returns the plain destination name; drop the `tripName` / `destinationListLabel` use added in commit a0b0c31)
- Modify: `client/src/components/Dashboard.tsx` (stop passing `tripName` to `buildDestinationGroup`)
- Modify: `client/src/components/PersonView.tsx`
- Modify: `client/src/components/DestinationColumns.tsx`, only if its band header needs updating so it reads "<destination> · <members>"
- Test: `client/src/__tests__/dashboardGroups.test.ts`, `client/src/__tests__/PersonView.test.tsx`, `client/src/__tests__/Dashboard.test.tsx`

- [ ] **Step 1: Write the failing tests**
  - **`dashboardGroups`:** the group `name` equals the destination name ("Paris"), not "Trip · Paris". Update the a0b0c31 test that expected the label.
  - **`PersonView`, selected person's group has `members.length === 1` on a split trip:**
    - Exactly one section is rendered, titled "<person> · <destination>".
    - There is no "<destination> shared" section.
    - Shared items appear in that section under their category, each with a "shared" badge.
    - Personal items have no badge.
    - Checking a shared row calls the shared toggle. Checking a personal row calls the person's toggle. Use the same callbacks the two-section layout uses today.
    - On a split trip, a shared row's menu still offers "Move to <other destination>".
    - The "+" button adds for the person.
  - **`PersonView`, two-member group:** two sections, as before.
  - **`PersonView` titles:** no trip name appears in any section title.
  - **Ordinary list (not a trip) with one member:** also one combined section, titled "<person>".

- [ ] **Step 2: Run the tests and confirm they fail**

  Run: `npx vitest run client/src/__tests__/dashboardGroups.test.ts client/src/__tests__/PersonView.test.tsx`

- [ ] **Step 3: Implement**
  - In `PersonView`, build a merged item list. Tag each row with its source (`'person' | 'shared'`), plus the actions and not-needed set for that source.
  - Change `ItemSection`, `CategorizedRows` and `ItemRow` so each row carries its own actions and its own not-needed flag, instead of one set for the whole section.
  - Merge the packed and not-needed partitions across both sources.
  - Keep the existing two-section rendering when the group has two or more members.

- [ ] **Step 4: Run the tests and confirm they pass**

  Run all of: `dashboardGroups.test.ts`, `PersonView.test.tsx`, `Dashboard.test.tsx`, `DashboardViewToggle.test.tsx`.

- [ ] **Step 5: Run the type check, then commit**

  Commit message: `feat(client): one combined section for a single-traveler destination; shorter titles`.

### Task 2: "Show packed" toggle

**Files:**
- Modify: `client/src/components/DashboardViewToggle.tsx`, or add `client/src/components/ShowPackedToggle.tsx` with a `useShowPacked()` hook that persists to `localStorage` key `personViewShowPacked` (default `false`)
- Modify: `client/src/components/Dashboard.tsx` (render the switch next to the view toggle, only in Person view; pass `showPacked` to `PersonView`)
- Modify: `client/src/components/PersonView.tsx` (`showPacked` prop)
- Test: `client/src/__tests__/PersonView.test.tsx`, `client/src/__tests__/Dashboard.test.tsx`, and a new hook/toggle test if you add a new file (register it in `vitest.config.ts`)

- [ ] **Step 1: Write the failing tests**
  - **`PersonView` with `showPacked`:**
    - A packed item renders under its category heading, in name order, checked.
    - A not-needed item renders struck through.
    - No "N packed" fold-out button.
  - **`PersonView` without `showPacked`:** unchanged from today. The fold-out exists, and packed rows are hidden until it is expanded.
  - **Hook:** it reads and writes `localStorage` `personViewShowPacked`.
  - **`Dashboard`:**
    - A "Show packed" switch is visible in Person view and not in Columns view.
    - Toggling it changes the `showPacked` prop passed to `PersonView`.

- [ ] **Step 2: Run the tests and confirm they fail**

- [ ] **Step 3: Implement**
  - Use a Mantine `Switch` with `size="sm"` and the label "Show packed".
  - In `ItemSection`, when `showPacked` is on, render every item through `CategorizedRows` in a single pass. Each row's checked state comes from the item, and its struck-through state from its not-needed flag.
  - Hide the fold-out.

- [ ] **Step 4: Run the tests and confirm they pass**

- [ ] **Step 5: Run the type check, then commit**

  Commit message: `feat(client): show packed items inline in person view`.

### Task 3: Destination tabs in the Edit list dialog

**Files:**
- Modify: `client/src/components/GlobalListEditDrawer.tsx`
- Modify: `client/src/components/Dashboard.tsx` ("Edit list" in Person view opens the selected person's destination list)
- Test: the existing GlobalListEditDrawer test files in `client/src/__tests__/` (`GlobalListEditDrawer.test.tsx`, `GlobalListEditDrawer.destination.test.tsx`) and `Dashboard.test.tsx`

**Read before you start:** `GlobalListEditDrawer` has carefully reviewed handling for race conditions:
- session tokens in `sessionRef`
- request counters
- `trackSave`, which chains member writes per list
- flushing a pending debounced save when the list switches or the drawer closes
- session guards in the load effect
- controls disabled while loading or moving

Switching tabs must go through `openForList` from `ListEditDrawerContext`, so all of this applies unchanged. Do not add a second list-switch path.

- [ ] **Step 1: Write the failing tests**
  - **One destination, or not a trip:** no tablist.
  - **Three destinations:**
    - A `role="tablist"` with three tabs, in position order, each labelled with the destination name.
    - The current list's tab has `aria-selected="true"`.
    - Clicking another tab calls `openForList(thatDestination.packingListId, <label>)`.
  - **While loading:** the tabs are disabled.
  - **`Dashboard`:** in Person view with a person selected, "Edit list" calls `openForList` with that person's destination `listId`.

- [ ] **Step 2: Run the tests and confirm they fail**

- [ ] **Step 3: Implement**
  - Keep the destinations from the loaded `trip_destination.destinations` in state, and reset them on every load.
  - Render Mantine `Tabs` (`variant="pills"`, inside a horizontal `ScrollArea` with `type="never"`). Each tab has a color dot (an 8px circle in `var(--mantine-color-<color>-6)`) and the destination name.
  - Disable the tabs while loading, while a Move is in progress, or while the name is saving.
  - **Dashboard:** Person view already tracks the selected person, through state or a callback, so use it. If the selected person isn't available in Dashboard, add an `onSelectedPersonChange` callback prop to `PersonView`, or lift the state up. Then make "Edit list" open that person's group's `listId`.

- [ ] **Step 4: Run the tests and confirm they pass**

  Run all the GlobalListEditDrawer test files and `Dashboard.test.tsx`.

- [ ] **Step 5: Run the type check, then commit**

  Commit message: `feat(client): destination tabs in the edit list dialog`.

### Task 4: Docs and verification

- [ ] **Docs:** update `client/src/components/ComponentUsage.md` with the new prop(s) on `PersonView`, the new toggle component if one was added, and the tabs in `GlobalListEditDrawer`. Commit.
- [ ] **Full checks:** `npx vitest run`, `npx tsc -p tsconfig.build.json --noEmit`, and the client type check.
- [ ] **Manual check at 390px** on the Cabo trip:
  - the combined section for "UI Tester · Grandma's"
  - the Show packed switch
  - the Edit list tabs
