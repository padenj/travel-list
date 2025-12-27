# Simple Offline Check Implementation

## Approach: Ultra-Minimal localStorage Backup

Instead of the complex IndexedDB + sync queue system, we use a **dead-simple localStorage backup** that:

1. **Saves check state to localStorage immediately** when user clicks
2. **Immediately tries to send to server** using existing API
3. **On success**: removes from localStorage 
4. **On failure**: keeps in localStorage for next load
5. **On page load**: merges localStorage state with server data

## How It Works

### When User Checks an Item

```typescript
1. Update UI optimistically (immediate visual feedback)
2. Save to localStorage: { listId, itemId, userId, checked, timestamp }
3. Try POST to /api/packing-lists/:listId/items/:itemId/check
   ├─ Success → Remove from localStorage (synced!)
   └─ Failure → Keep in localStorage (offline or error)
```

### When Page Loads

```typescript
1. Fetch data from server API (current behavior)
2. For each item:
   ├─ Check if localStorage has a pending check for this item
   ├─ If yes → Use localStorage value (offline change wins)
   └─ If no → Use server value (normal)
3. Render merged data
```

### Background Retry (Future Enhancement)

Currently checks retry only on page load. To add background retry:

```typescript
// In App.tsx or similar
setInterval(async () => {
  const pending = getPendingChecks();
  for (const check of pending) {
    try {
      await togglePackingListItemCheck(check.listId, check.itemId, check.userId, check.checked);
      clearCheckAfterSync(check.listId, check.itemId, check.userId);
    } catch (e) {
      // Still offline, leave for next retry
    }
  }
}, 30000); // retry every 30 seconds
```

## Files

### `/src/lib/simpleOffline.ts`
- `saveCheckLocally()` - Save check to localStorage
- `getLocalCheckState()` - Get saved check for an item
- `clearCheckAfterSync()` - Remove after successful server sync
- `getPendingChecks()` - Get all pending checks (for background retry)

### `/src/components/Dashboard.tsx`
Modified:
- `handleCheckItem()` - Now saves locally + sends to server immediately
- `useEffect()` load logic - Merges localStorage state when rendering items

## Benefits

✅ **Simple** - Just localStorage, no IndexedDB complexity
✅ **Fast** - Immediate UI update, immediate server attempt
✅ **Reliable** - localStorage persists across reloads
✅ **Visible** - Can inspect `localStorage.getItem('offline_checks_v1')`
✅ **Compatible** - Uses existing server API endpoints
✅ **No migrations** - No new database tables needed
✅ **No sync engine** - No background processes

## Trade-offs

❌ **Manual retry** - Checks only retry on page load (unless we add setInterval)
❌ **localStorage limits** - 5-10MB limit (but checks are tiny)
❌ **Per-device** - localStorage doesn't sync across devices (by design)

## Testing

1. **Check an item online**
   - Item checks immediately
   - Console shows: `[Dashboard] Check synced to server successfully`
   - localStorage entry removed

2. **Check an item offline** (disconnect network)
   - Item checks immediately in UI
   - Console shows: `[Dashboard] Failed to sync check (offline?), saved locally`
   - localStorage entry persists

3. **Reload page while offline**
   - Item remains checked (localStorage state used)

4. **Go back online and reload**
   - Server still shows old state (check not synced yet)
   - Item shows checked (localStorage state)
   - To sync: either refresh again or wait for background retry (if implemented)

## Debugging

```javascript
// In browser console
localStorage.getItem('offline_checks_v1')
// Returns: {"<listId>:<itemId>:<userId>": {...}, ...}

// Clear all pending checks
localStorage.removeItem('offline_checks_v1')
```

## Next Steps (Optional)

1. Add background retry with exponential backoff
2. Add UI indicator showing "X checks pending sync"
3. Add manual "Sync Now" button
4. Extend to other operations (add/delete items, etc.)

---

**Status**: Implemented ✅  
**Complexity**: Minimal  
**Dependencies**: None (just localStorage)  
**Lines of Code**: ~80 total
