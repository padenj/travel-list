# Offline Sync Cleanup - December 2024

## Overview
Removed complex IndexedDB-based offline sync system in favor of simple localStorage backup approach. This document summarizes all cleanup actions taken.

## Files Deleted

### Client-Side Offline System
- `src/lib/offlineStore.ts` - IndexedDB wrapper with debug overlay
- `src/lib/offlineApi.ts` - Offline operation wrapper with queue management
- `src/lib/syncEngine.ts` - Background sync engine with intervals
- `src/lib/idbShim.ts` - Runtime IndexedDB loader

### Tests
- `src/__tests__/offlineStore.test.ts` - Tests for offline store
- `src/__tests__/offlineApi.test.ts` - Tests for offline API
- `src/__tests__/syncEngine.test.ts` - Tests for sync engine
- `tests/integration/offline-sync-e2e.test.ts` - End-to-end offline sync tests
- `server/__tests__/sync.test.ts` - Tests for server sync endpoints

### Server-Side
- Removed `/api/sync/push` endpoint from `server/routes.ts`
- Removed `/api/sync/pull` endpoint from `server/routes.ts`
- Removed `SyncRepository` class from `server/repositories.ts`

### Migrations
- `server/migrations/20251011_create_sync_ops.js`
- `server/migrations/migrations/20251011_create_sync_ops.js`
- `server/migrations/migrations/20251011_create_sync_ops.cjs`

## Files Modified

### Type Definitions
- `src/shared/types.ts`
  - Removed `OfflineOpType` type
  - Removed `OfflineOp` interface

### Routes
- `server/routes.ts`
  - Removed `SyncRepository` import
  - Removed `syncRepo` instance
  - Removed `/api/sync/push` endpoint
  - Removed `/api/sync/pull` endpoint

### Repositories
- `server/repositories.ts`
  - Removed `SyncRepository` class (methods: `recordOp`, `hasOp`, `changesSince`)

### Components
- `src/components/Dashboard.tsx`
  - Removed `offlineApi` imports
  - Updated `handleCheckItem` to use `togglePackingListItemCheck` API + `simpleOffline` helpers
  - Added check state merging on load using `getLocalCheckState`
  - Removed IndexedDB population code
  - Updated `handleItemDrawerSaved` to use `addItemToPackingList` API

- `src/components/ManagePackingLists.tsx`
  - Removed `offlineApi` imports
  - Added direct API imports: `updatePackingList`, `deletePackingList`, `addItemToPackingList`
  - Updated `doRename` to use `updatePackingList` API
  - Updated `doDelete` to use `deletePackingList` API
  - Updated `applyAddItems` to use `addItemToPackingList` API
  - Updated template assignment save to use `updatePackingList` API
  - Temporarily disabled remove button (TODO: implement with `deletePackingListItem`)
  - Fixed item drawer `onSaved` to use `addItemToPackingList` API
  - Removed unused `openEditModal` function

- `src/components/PackingListPage.tsx`
  - Removed `createPackingListOffline` import
  - Updated `createNewList` to use `createPackingList` API directly

- `src/App.tsx`
  - Removed sync engine startup (removed `useEffect` and `startSyncEngine` import)

## New Simplified System

### Implementation
- `src/lib/simpleOffline.ts` (~80 lines)
  - `saveCheckLocally(pliId, memberId, checked)` - Save check state to localStorage
  - `getLocalCheckState()` - Retrieve all local check states
  - `clearCheckAfterSync(pliId, memberId)` - Clear after successful sync
  - `getPendingChecks()` - Get count of pending checks

### Documentation
- `docs/SIMPLE_OFFLINE.md` - Explains the new minimal approach

## How It Works Now

1. **Check Operation**: 
   - Save to localStorage immediately
   - Call server API (`togglePackingListItemCheck`)
   - Clear localStorage on success

2. **Page Load**:
   - Fetch data from server
   - Merge localStorage check state with server data
   - Display merged state to user

3. **Reconnection**:
   - User manually re-checks items if needed
   - No automatic background sync
   - Simple and predictable behavior

## Benefits of Simplified Approach

- **No Dependencies**: No IndexedDB library needed
- **Simpler Code**: ~80 lines vs. ~600 lines
- **Easier Debugging**: Plain localStorage, visible in DevTools
- **No Background Processes**: No intervals, no sync engine
- **Predictable**: Direct API calls, no complex queue logic
- **Works Offline**: Checks saved locally and persist across reloads

## Verification

- ✅ TypeScript compilation passes (`npx tsc --noEmit`)
- ✅ All client components use direct API calls
- ✅ All server sync endpoints removed
- ✅ All offline-related types removed
- ✅ All test files cleaned up
- ✅ All migration files removed

## Next Steps

1. Test in browser to verify check persistence works
2. Test offline behavior (disconnect network, check items, reconnect)
3. Consider adding a UI indicator for pending checks
4. Implement `deletePackingListItem` API and wire up remove button in ManagePackingLists
