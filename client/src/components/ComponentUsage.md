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
Uses a searchable Mantine `Select` to choose the active category while preserving custom drag-sort order before showing that category's detail card.
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
Searchable item-group manager using a Mantine `Select` picker, an item-only list, an `Add Item` action via `AddItemsDrawer`, and an `Add from categories` snapshot modal.
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

### PackingListAuditPanel
**Used in:**
  - `Dashboard`

### PackingListItemAuditModal
**Used in:**
  - `Dashboard`

### TripParticipantsPanel
**Used in:**
  - `pages/TripDetailPage.tsx`

Lists/add/removes trip travelers (family members and outside guests). Exports `findOrCreateParticipant` helper used by `BookingCard` for inline traveler creation.

### BookingCard
**Used in:**
  - `pages/TripDetailPage.tsx` (once per flight-type `TripElement`)

Displays existing bookings (confirmation number, per-person advertised price, actual total from transactions, "Also covers" links to other linked elements) and a form to create a new booking with traveler multi-select, inline new-traveler creation, and multi-element linking. Renders `BookingTransactionList` per booking.

### BookingTransactionList
**Used in:**
  - `BookingCard`

Lists/add/removes transactions for a single booking with a running total; supports recording price-drop rebookings (negative amount + new confirmation number) and free-text fee/tax breakdown notes.

### FlightSeatGrid
**Used in:**
  - `pages/TripDetailPage.tsx` (once per flight leg)

Inline-editable seat number per trip traveler.
---
**Note:** This file lists current supporting components only; deleted components were removed from the project and are not included here.