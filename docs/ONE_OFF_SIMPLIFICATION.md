# One-Off Item Detection - Simplified Implementation

## Problem
The client had multiple, redundant ways of detecting whether an item was a "one-off" (packing-list-only item that doesn't appear in the master list):
- Checking multiple field name variations: `isOneOff`, `is_one_off`, `master_is_one_off`, `masterIsOneOff`, `one_off`, `oneOff`
- Different logic paths for promoteContext vs masterItemId
- Fallback logic that queried packing lists separately

## Solution
**Single Source of Truth**: The `items.isOneOff` column in the database (exposed as `item.isOneOff` in API responses).

## Key Changes

### Server (`server/routes.ts`)
The `/items/:itemId/edit-data` endpoint now includes the `item` object:
```typescript
const [item, categories, itemCategories, members, itemMembers, wholeAssigned] = await Promise.all([
  itemRepo.findById(itemId),  // ← Added
  // ... rest
]);

return res.json({ item, categories, itemCategories, members, itemMembers, wholeAssigned });
```

### Client (`client/src/components/ItemEditDrawer.tsx`)

**Simplified Detection:**
```typescript
// OLD: Multiple field checks
const masterOneOffFlag = !!(
  payload.item?.isOneOff || payload.item?.is_one_off || 
  payload.master_is_one_off || payload.masterIsOneOff || 
  payload.one_off || payload.oneOff
);

// NEW: Single field check
const masterOneOffFlag = !!(payload.item?.isOneOff);
```

**Removed:**
- Separate promoteContext loading path
- Fallback logic that fetched packing lists
- Multiple field name checks

**Flow:**
1. When editing an item (with `masterItemId`), call `/items/:masterItemId/edit-data`
2. Read `payload.item.isOneOff` 
3. Set `isMasterOneOff` state
4. UI uses computed `isOneOff = isCreatingOneOff || isMasterOneOff` for validation

## API Response Structure

### Packing List API (`GET /packing-lists/:id`)
Each item includes `master_is_one_off`:
```json
{
  "id": "75030301-5f0d-4f4d-9bf5-b02e6dffa1f1",
  "master_id": "71c70560-f144-414e-ac04-252936ab153a",
  "master_is_one_off": 1,  // ← Present in packing list responses
  "name": "One off Spouse",
  ...
}
```

### Edit Data API (`GET /items/:itemId/edit-data`)
Now returns the item object:
```json
{
  "item": {
    "id": "71c70560-f144-414e-ac04-252936ab153a",
    "isOneOff": 1,  // ← Canonical source
    "name": "One off Spouse",
    ...
  },
  "categories": [...],
  "itemCategories": [...],
  ...
}
```

## Benefits
1. **Single source of truth**: `items.isOneOff` column
2. **Simpler code**: Removed ~150 lines of fallback/duplicate logic
3. **Easier maintenance**: Only one field name to check
4. **No backwards compatibility burden**: Old field names removed

## Testing
- All 115 tests pass
- TypeScript compilation successful
- No runtime errors
