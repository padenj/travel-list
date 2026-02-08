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

- `getFamilyPackingLists`, `getPackingList`, `getPackingListAudit`, `getPackingListItemAudit`, `createPackingList`, `addItemToPackingList`, `populatePackingListFromTemplate`, `deletePackingListItem`, `togglePackingListItemCheck`, `setPackingListItemNotNeeded`, `setPackingListItemNotNeededForMember`, `updatePackingList`, `deletePackingList`:
  - client/src/components/ManagePackingLists.tsx
  - client/src/components/GlobalListEditDrawer.tsx
  - client/src/components/Dashboard.tsx
  - client/src/components/PackingListAuditPanel.tsx
  - client/src/components/PackingListItemAuditModal.tsx
  - client/src/pages/PackingListPage.tsx

### Templates
- `createTemplate`, `getTemplates`, `getTemplate`, `updateTemplate`, `deleteTemplate`, `assignCategoryToTemplate`, `removeCategoryFromTemplate`, `assignItemToTemplate`, `removeItemFromTemplate`, `getCategoriesForTemplate`, `getItemsForTemplate`, `getExpandedItemsForTemplate`, `syncTemplateItems`:
  - client/src/components/TemplateManager.tsx

### Item Groups (aliases)
- `getItemGroups`, `getItemGroup`, `updateItemGroup`, `deleteItemGroup`, `assignCategoryToItemGroup`, `removeCategoryFromItemGroup`, `assignItemToItemGroup`, `removeItemFromItemGroup`, `getCategoriesForItemGroup`, `getItemsForItemGroup`, `getExpandedItemsForItemGroup`, `syncItemGroupItems`:
  - client/src/components/ItemEditDrawer.tsx
  - client/src/components/TemplateManager.tsx

### Migration cleanup checklist
- **Server code to remove/rename after verification:**
  - Replace `templates` endpoints with `item-groups` and remove the `/templates` aliases in `server/routes.ts`.
  - Rename `TemplateRepository` to `ItemGroupRepository` in `server/repositories.ts` and update usages.
  - Rename types `Template` -> `ItemGroup` in `server/types.ts` and `server/server-types.ts`.
  - Update `db.ts` DDL to create `item_groups` tables and remove `templates` creation; drop old `templates*` tables in a follow-up migration.

- **Client code to remove/rename after verification:**
  - Replace usages of `getTemplates`/`createTemplate` etc. with `getItemGroups`/`createItemGroup` and remove alias helper functions in `client/src/api.ts`.
  - Rename UI components and variables that use "template" terminology (e.g., `TemplateManager` → `ItemGroupManager`) where desirable.
  - Update tests in `client/src/__tests__` to use new helper names and endpoints.

- **Data cleanup:**
  - After verifying migration, run migration step to drop `templates`, `template_items`, `template_categories`, `packing_list_item_templates` tables.
  - Remove any leftover rows or FKs referencing old table/column names.

Keep this checklist updated as you complete migration verification and removal steps.

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
