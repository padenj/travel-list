## Component Usage Map

_Generated on 2025-12-30_

This document lists all components in `src/components`, where they are used, and marks unused components for follow up.
## Component Usage Map

_Generated on 2025-12-30 (updated)_

This document lists current supporting components in `src/components` and where they are used. Page components have been moved to `src/pages` and are listed first.

---

## Pages (moved to src/pages)
- CategoryManagementPage — used by `AppRoutes` at `/categories`
- FamilyAdminPage — used by `AppRoutes` at `/admin/family` and `/settings/family`
- PackingListPage — used by `AppRoutes` at `/packing-lists`
- SystemAdminPage — used by `AppRoutes` at `/admin/system`

---

## Components (supporting)

### FamilyMembersTable
**Used in:**
  - `src/pages/FamilyAdminPage`
  - `src/pages/SystemAdminPage`

### CategoryManagementPage (supporting parts)
**Used in:**
  - `src/pages/CategoryManagementPage`

### SettingsSecurity
**Used in:**
  - AppRoutes (settings/security)

### ServiceWorkerStatus
**Used in:**
  - `SplitRailLayout`

### SettingsProfile
**Used in:**
  - AppRoutes (settings/profile)

### PasswordRequirements
**Used in:**
  - `FamilyMembersTable`
  - `PasswordChangePage`

### TemplateManager
**Used in:**
  - Route `/templates`
  - `__tests__/TemplateManager.test.tsx`

### AddItemsDrawer
**Used in:**
  - `GlobalListEditDrawer`
  - `src/pages/CategoryManagementPage`
  - `TemplateManager`
  - `ManagePackingLists`
  - `Dashboard`

### VersionText
**Used in:**
  - `SplitRailLayout`
  - `Layout`

### ConfirmDelete
**Used in:**
  - `src/pages/CategoryManagementPage`
  - `BulkEditDrawer`

### ActivePackingListSelector
**Used in:**
  - `Dashboard`

### SplitRailLayout
**Used in:**
  - Top-level layout in `AppRoutes`

### UpdateBanner
**Used in:**
  - `App.tsx`

### ItemEditDrawer
**Used in:**
  - `GlobalListEditDrawer`
  - `PackingListsSideBySide`
  - `AddItemsDrawer`
  - `ManagePackingLists`
  - `TemplateManager`
  - `src/pages/CategoryManagementPage`
  - `Dashboard`

### BulkEditDrawer
**Used in:**
  - `src/pages/CategoryManagementPage`

### Layout
**Used in:**
  - `VersionText` and other layout contexts

### GlobalListEditDrawer
**Used in:**
  - `SplitRailLayout`
  - `ManagePackingLists`

### ManagePackingLists
**Used in:**
  - `src/pages/PackingListPage`

### PackingListsSideBySide
**Used in:**
  - `Dashboard`
  - `ItemEditDrawer`

### Dashboard
**Used in:**
  - AppRoutes (route `/`)

---
**Note:** This file lists current supporting components only; deleted components were removed from the project and are not included here.