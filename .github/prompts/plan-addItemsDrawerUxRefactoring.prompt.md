# Plan: Refactor AddItemsDrawer UX & One-Off Item Handling

Consolidate search and add functionality into a unified experience, flip one-off toggle logic, enforce category requirements for all items, and integrate one-off items into category groups on the dashboard.

## Steps

1. **Extract reusable fuzzy search utility** from [AddItemsDrawer.tsx](client/src/components/AddItemsDrawer.tsx#L75-L83) and [ItemEditDrawer.tsx](client/src/components/ItemEditDrawer.tsx#L161-L169). Create `useFuzzySearch` hook in [client/src/utils/](client/src/utils/) with standardized Fuse.js configuration (threshold: 0.3, keys: ['name', 'description']). Update both components to use the new hook.

2. **Refactor AddItemsDrawer search to unified add experience** in [AddItemsDrawer.tsx](client/src/components/AddItemsDrawer.tsx). Remove standalone "New Item" button at [line 142](client/src/components/AddItemsDrawer.tsx#L142). When search query has no exact match (compare `query.trim().toLowerCase()` against `visibleItems.map(i => i.name.toLowerCase())`), show "Add New Item: {query}" button below search input. Pass `initialName={query}` to nested `ItemEditDrawer` at [line 207](client/src/components/AddItemsDrawer.tsx#L207).

3. **Flip one-off toggle logic in ItemEditDrawer** at [lines 691-710](client/src/components/ItemEditDrawer.tsx#L691-L710). Change label from "name" to "Item" at [line 584](client/src/components/ItemEditDrawer.tsx#L584). Update `alsoAddForFutureTrips` default at [line 101](client/src/components/ItemEditDrawer.tsx#L101) to `true`. Invert toggle: OFF = add to future trips (isOneOff=0), ON = this trip only (isOneOff=1). Update label text to "This Trip Only" when checked, "Add for Future Trips" when unchecked.

4. **Enforce category requirement for all items** in [ItemEditDrawer.tsx](client/src/components/ItemEditDrawer.tsx#L374-L382). Remove `isOneOff` condition from category validation at [line 379](client/src/components/ItemEditDrawer.tsx#L379). Enable category selector for one-off items by removing `disabled` check at [line 647](client/src/components/ItemEditDrawer.tsx#L647). Update `addItemToPackingList` calls to include `oneOffCategoryId` parameter.

5. **Integrate one-off items into category groups on dashboard** in [PackingListsSideBySide.tsx](client/src/components/PackingListsSideBySide.tsx). Remove separate "One-off" sections at [lines 363-381](client/src/components/PackingListsSideBySide.tsx#L363-L381) (per-member) and [lines 272-289](client/src/components/PackingListsSideBySide.tsx#L272-L289) (whole family). Merge one-off items into category groups using `category?.id ?? 'uncategorized'`. Add visual indicator icon (e.g., `IconSparkles` from tabler-icons) next to one-off item names, using `isOneOffItem()` helper at [line 81](client/src/components/PackingListsSideBySide.tsx#L81).

6. **Apply category grouping to whole family list** in [PackingListsSideBySide.tsx](client/src/components/PackingListsSideBySide.tsx#L256-L306). Replace flat item list with same category grouping logic used for per-member columns ([lines 326-348](client/src/components/PackingListsSideBySide.tsx#L326-L348)). Group by `category?.id`, render category headers, sort items alphabetically within groups.

## Further Considerations

1. **Icon for one-off items:** Recommend `IconSparkles`, `IconStar`, or `IconFlame` from @tabler/icons-react to visually distinguish one-off items within category groups. Should icon appear inline with name or as badge?

2. **Migration for existing one-off items:** Existing one-off items have no category (`category_id IS NULL`). Should we assign them to default "Uncategorized" group, or run migration to prompt users to categorize? Could add background job or prompt on first dashboard load.

3. **Search exact match threshold:** What tolerance for "exact match"? Current proposal uses `query.trim().toLowerCase()` strict equality. Should fuzzy score < 0.1 count as exact match to handle typos?
