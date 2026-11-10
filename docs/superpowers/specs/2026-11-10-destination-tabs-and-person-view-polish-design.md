# Destination tabs and Person view polish

Date: 2026-11-10
Builds on: `2026-11-09-every-list-is-a-trip-design.md`

Three small UI changes from user testing on a split trip. Phones come first.

## 1. Destination tabs in the Edit list dialog (`GlobalListEditDrawer`)

- **When:** shown only when the list's trip has two or more live destinations. The data comes from `GET /packing-lists/:id` → `trip_destination.destinations`, ordered by `position`.
- **Look:**
  - One tab per destination, placed under the title row. Each tab shows a dot in the destination's color and the destination name (not the full label).
  - The tab for the list being edited is selected.
  - The row scrolls sideways when it doesn't fit, with no wrapping. Use Mantine `Tabs` or `ScrollArea` + `SegmentedControl`, whichever keeps the tab targets at least 36px tall.
- **Switching:**
  - Selecting a tab calls `openForList(destination.packingListId, label)` from `ListEditDrawerContext`.
  - The drawer's existing list-switch handling then takes over: it flushes any pending debounced save, starts a new session token, and reloads.
  - The tabs are disabled while the dialog is loading, or while a member Move or rename is in progress. The same rule already applies to the dialog's other controls.
- **Opening:** the dashboard's "Edit list" opens on the destination being viewed.
  - In Person view, that is the selected person's destination.
  - In Columns view, and in any other case, it is the active list.
- **Offline:** switching tabs still works, because it only loads a list.

## 2. One section for a destination with a single traveler (Person view)

- **When:** in `PersonView`, the selected person's destination group has exactly one member.
- **What changes:** the dashboard shows one section instead of "<person> · <destination>" plus "<destination> shared".
  - **Title:** "<person> · <destination>" on a split trip, otherwise "<person>".
  - **Add:** the "+" button adds for that person, the same as their own section's "+" did.
  - **Grouping:** the person's items and the shared items are grouped together by category, ordered by name within each category.
  - **Shared marker:** each shared row shows a small "shared" badge (Mantine `Badge`, size `xs`, variant `light`, color `gray`) after its name.
- **Row behaviour:** each row keeps the actions of its source.
  - **Shared rows:** checking a shared row records the whole-family check, and "Not needed" uses the shared not-needed set. On a split trip, the "Move to <destination>" menu entries still appear.
  - **Personal rows:** they behave exactly as before.
- **Counts:** the packed and not-needed counts, and the fold-out (when shown), combine both sources.
- **Two or more members:** the layout is unchanged, with two sections.
- **Columns view:** unchanged.

## 3. Shorter section titles (Person view)

- **Dashboard groups:** `buildDestinationGroup` gets back the plain destination name as `name`, instead of the label. `tripName` is dropped from the group-building call.
- **Person view titles:** "<person> · <destination>" and "<destination> shared". The trip name already appears above them.
- **Columns view:** the color band header becomes "<destination> · <members>".

## 4. "Show packed inline" toggle (Person view)

- **Control:** a compact `Switch` labelled "Show packed", next to the Person/Columns toggle. It is only shown in Person view.
- **Storage:** the setting is kept per device in `localStorage` under `personViewShowPacked`. The default is off, which keeps today's behaviour.
- **On:**
  - Packed and not-needed items stay in their category, in name order. Packed rows show a checked checkbox, and not-needed rows are struck through, as today.
  - The "N packed · N not needed" fold-out is hidden.
  - Unchecking a row leaves it where it is.
- **Off:** today's behaviour. To-do items appear first, and packed and not-needed items sit behind the fold-out.
- **Scope:** applies to every section in Person view, including the combined single-traveler section.

## Testing

- **`GlobalListEditDrawer`:**
  - No tabs when there is one destination.
  - Tabs appear when there are several, with the current list's tab selected.
  - Clicking a tab calls `openForList` with that destination's list.
  - Tabs are disabled while loading.
- **Dashboard:** "Edit list" in Person view opens the selected person's destination list.
- **`PersonView`:**
  - A single-member group renders one section that includes the shared items with a "shared" badge.
  - Checking a shared row calls the shared toggle, and checking a personal row calls the personal toggle.
  - A two-member group still renders two sections.
  - The titles have no trip name.
- **Show packed:**
  - When on, packed rows are in their category and there is no fold-out.
  - When off, the fold-out behaves as before.
  - The setting persists in `localStorage`.
- **Manual check at 390px** on the Cabo trip.
