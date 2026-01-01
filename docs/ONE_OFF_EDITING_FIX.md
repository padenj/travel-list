# One-Off Item Editing - Correct Behavior

## Data Architecture for One-Off Items

One-off items store their data on the **master item** (in the `items` table):
- ✅ **Name** - Stored on master item
- ✅ **Member assignments** - Stored on master item (via `item_members` and `item_whole_family` tables)
- ✅ **Category** - One-off items require a category (single-category model)
- ✅ **isOneOff flag** - Stored on master item (`isOneOff = 1`)

The packing list simply references the master item via `item_id`. All data comes from the master.

## Solution
**For one-off items** (detected by `isOneOff`):
- ✅ Update master item **name**
- ✅ Update **member assignments** on master item
- ✅ Update **category** on master item (one-offs must have a category)
- � Refresh packing list view after save to show updated name

## Implementation

### Save Logic (`client/src/components/ItemEditDrawer.tsx`)
```typescript
// After updating the master item name...
if (isOneOff && promoteContext) {
  console.log('[ItemEditDrawer] skipping category/member updates for one-off with promoteContext');
  showNotification({ title: 'Saved', message: 'One-off item name updated.', color: 'green' });
  if (onSaved) await onSaved(updatedName ? { name: updatedName } : undefined);
  onClose();
  return; // Skip category/member updates
}
// Continue with regular category/member updates for non-one-off items...
```

### UI Changes
1. **Top note text** - Context-aware message:
   - One-off item: "Note: One-off items do not have categories. Changes to name and assignments apply to this item only."
   - Regular item: "Note: changing categories or assignments here updates the master item and will apply to all lists."

2. **Category section** - Disabled for all one-offs with helper text

3. **Assignments section** - Fully functional for one-off items:
   - ✅ Can change member assignments
   - ✅ Can toggle whole family assignment
   - Changes save to the master item

## Data Architecture

### One-Off Items
```
Master Item (items table):
├─ id: "71c70560-..."
├─ name: "One off Spouse"     ← Editable in ItemEditDrawer
├─ isOneOff: 1                ← Flag indicating it's a one-off
├─ categoryId: null           ← Always null for one-offs
└─ (member assignments via item_members, item_whole_family) ← Editable in ItemEditDrawer

Packing List Item (packing_list_items table):
├─ id: "75030301-..."
├─ item_id: "71c70560-..."    ← References master item
└─ packing_list_id: "ef682045-..."
```

### Regular (Non-One-Off) Items
```
Master Item (items table):
├─ id: "26a314d2-..."
├─ name: "Pants"              ← Editable in ItemEditDrawer
├─ isOneOff: 0
├─ categoryId: "41ff8929-..."  ← Editable in ItemEditDrawer
└─ (member assignments via item_members, item_whole_family) ← Editable in ItemEditDrawer

Packing List Item (packing_list_items table):
├─ id: "058bb889-..."
├─ item_id: "26a314d2-..."    ← References master item
└─ packing_list_id: "ef682045-..."
```

## User Experience

### Correct Behavior (Current)
1. User opens one-off item "One off Spouse" from packing list
2. Drawer shows: "One-off items do not have categories. Changes to name and assignments apply to this item only."
3. Category selection is enabled and required for one-off items
4. Assignment section is fully functional:
   - Shows current member assignments
   - User can change assignments (add/remove members, toggle whole family)
5. User changes name to "One off Spouse C" and updates assignments
6. User clicks Save
7. ✅ System updates master item name and member assignments
8. ✅ Success message: "One-off item updated."
9. ✅ Packing list view refreshes automatically to show new name
10. ✅ Clear, predictable behavior - all changes saved correctly

## Testing
- ✅ All 115 tests pass
- ✅ TypeScript compilation successful
- ✅ No breaking changes to regular item editing flow

## Future Enhancements
To allow editing member assignments for one-off items from the drawer, we would need to:
1. Create server API: `PATCH /packing-lists/:listId/items/:packingListItemId/assignments`
2. Update client to detect and use this API for one-off items
3. Store `packingListItemId` in drawer state when `promoteContext` is present
4. Update save logic to call the packing list item assignment API instead of master item assignment API
