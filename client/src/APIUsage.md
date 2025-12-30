## API Usage Map

Generated on 2025-12-30

This document maps functions exported from `client/src/api.ts` to the client-side files that import and use them.

---

### App-level auth helpers
- `setAuthToken`, `clearAuthToken`, `getAuthToken`:
  - client/src/AppRoutes.tsx
  - client/src/App.tsx (uses `getAuthToken`)

### Authentication
- `login`:
  - client/src/LoginPage.tsx
- `changePassword`:
  - client/src/PasswordChangePage.tsx

### User / Profile
- `getCurrentUserProfile`:
  - client/src/components/TemplateManager.tsx
  - client/src/components/ManagePackingLists.tsx
  - client/src/components/Dashboard.tsx
  - client/src/pages/FamilyAdminPage.tsx
  - client/src/pages/SystemAdminPage.tsx
  - client/src/contexts/ActivePackingListContext.tsx
- `getUsers`, `createUser`, `deleteUser`:
  - client/src/pages/SystemAdminPage.tsx

### Families
- `getFamilies`, `getFamily`, `createFamily`, `deleteFamily`:
  - client/src/pages/SystemAdminPage.tsx
  - client/src/components/BulkEditDrawer.tsx (uses `getFamily`)

### Family members
- `createFamilyMember`, `editFamilyMember`, `resetFamilyMemberPassword`, `updateFamilyMemberOrder`:
  - client/src/components/FamilyMembersTable.tsx
  - client/src/pages/FamilyAdminPage.tsx
  - client/src/pages/SystemAdminPage.tsx

### Categories & Items
- `getCategories`, `createCategory`, `updateCategory`, `deleteCategory`, `getItems`, `getItemsForCategory`, `getCategoriesForItem`, `getItemsForTemplate`:
  - client/src/pages/CategoryManagementPage.tsx
  - client/src/components/AddItemsDrawer.tsx
  - client/src/components/TemplateManager.tsx
  - client/src/components/BulkEditDrawer.tsx
  - client/src/components/ItemEditDrawer.tsx
  - client/src/components/PackingListsSideBySide.tsx

### Item assignments, checks, and packing lists
- `assignItemToCategory`, `removeItemFromCategory`, `assignToMember`, `removeFromMember`, `assignToWholeFamily`, `removeFromWholeFamily`, `setChecked`:
  - client/src/components/ItemEditDrawer.tsx
  - client/src/components/BulkEditDrawer.tsx

- `getFamilyPackingLists`, `getPackingList`, `createPackingList`, `addItemToPackingList`, `populatePackingListFromTemplate`, `deletePackingListItem`, `togglePackingListItemCheck`, `setPackingListItemNotNeeded`, `setPackingListItemNotNeededForMember`, `updatePackingList`, `deletePackingList`:
  - client/src/components/ManagePackingLists.tsx
  - client/src/components/GlobalListEditDrawer.tsx
  - client/src/components/Dashboard.tsx
  - client/src/pages/PackingListPage.tsx

### Templates
- `createTemplate`, `getTemplates`, `getTemplate`, `updateTemplate`, `deleteTemplate`, `assignCategoryToTemplate`, `removeCategoryFromTemplate`, `assignItemToTemplate`, `removeItemFromTemplate`, `getCategoriesForTemplate`, `getItemsForTemplate`, `getExpandedItemsForTemplate`, `syncTemplateItems`:
  - client/src/components/TemplateManager.tsx

### Misc / Utilities
- `getMembersForItem`:
  - client/src/components/TemplateManager.tsx
  - client/src/components/BulkEditDrawer.tsx
- `getCategoriesForItem`:
  - client/src/components/ItemEditDrawer.tsx

---

Direct `fetch` uses (bypass `api.ts`):
- `client/src/App.tsx` — fetches `/api/events` for SSE setup.
-- `client/src/components/VersionText.tsx` — now uses `getBuildInfo()` from `api.ts`.
-- `client/src/components/Layout.tsx` — now uses `getBuildInfo()` from `api.ts`.
- Service worker files (`client/src/sw.ts`, `client/src/sw.js`, `client/src/sw-simple.js`) use `fetch` for network handling.


---
Generated automatically.
