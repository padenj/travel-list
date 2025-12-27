# Application Behavior Specifications

## User Roles and Permissions

### SystemAdmin
- **Access**: All families, users, and system settings
- **Capabilities**: 
  - Create/delete families
  - Add/remove users with any role
  - View audit logs across all families
  - System configuration and maintenance

### FamilyAdmin  
- **Access**: Own family members and data only
- **Capabilities**:
  - Add/remove family members
  - Promote family members to FamilyAdmin role
  - Manage family categories, items, and templates
  - View family audit logs

### FamilyMember
- **Access**: Own family data (read/write), limited user management
- **Capabilities**:
  - Create and manage own packing lists
  - Add/edit family items and categories
  - Use and modify templates
  - Cannot manage other users

### Authentication Behavior

### Initial Setup
- Default administrator account created on first install
- Administrator MUST change password on first login
- Strong password policy enforced (implemented as: minimum 8 characters and at least 2 of the following character types: uppercase, lowercase, numbers, symbols). See `server/auth.ts` for the authoritative implementation.
- Session expires after 60 days of inactivity

### Login Flow  
1. User enters credentials
2. System validates and returns JWT token
3. If first login for admin, redirect to password change
4. Frontend stores token and displays role-appropriate interface
5. All subsequent API calls include authentication token

## Family and Member Management

### Family Structure
- **Single Family Membership**: Each user belongs to exactly one family
- **Multiple Admins**: Families can have multiple FamilyAdmin users
- **Member Information**: First name, last name, optional email
- **Email Requirements**: Required for FamilyAdmin, optional for FamilyMember

### Family Data Isolation
- Users can only access data from their own family
- SystemAdmin can access all families
- All data (items, categories, templates, lists) scoped to family

## Item and Category Management

### Items and Categories
- **Multi-Category Items**: Items can belong to multiple categories
  - Example: "Winter Jacket" → ["Cold Weather", "International", "Formal"]
- **Member Assignment**: Items assigned to specific family members globally
  - Example: "Laptop" assigned to John, "Child's Toys" assigned to Sally
  - Assignment applies to all templates and packing lists
- **Whole Family Items**: Items can be marked as needed by entire family

### Category System
- **Standard Categories**: International, Cold Weather, Beach, Formal, Work, Car
- **Custom Categories**: Families can create additional categories
- **Category Deletion**: Soft delete preserves historical data

## Template System

### Template Composition
- **Flexible Structure**: Templates can include:
  - Entire categories (dynamic - includes all current items in category)
  - Individual items (static - specific items only)
  - Mix of both approaches
- **No Direct Assignments**: Templates reference categories or individual items only; they do not specify item assignments (to members or whole family)
- **Dynamic Updates**: When items are added to categories, category-based templates automatically include them (for future packing lists)

### Template Usage
- **Base for Packing Lists**: Templates generate initial packing lists by including all items from referenced categories/individual items, along with each item's predefined assignments (to specific members or whole family)
- **Customization During Packing**: Users can add/remove items while packing
- **Template Update Option**: Changes made during packing can optionally update the original template

## Packing List Workflow

### List Creation
1. **Template Selection**: Choose existing template or start blank
2. **Trip Information**: Enter packing list name (no start/end dates required; creation date tracked automatically)
3. **Item Population**: All items from template's categories/individual items are added, with each item's predefined assignments (to specific members or whole family)
4. **Initial Generation**: System creates packing list with all template items and their assignments

### Packing Process
- **Item Status**: Mark items as packed/unpacked (checked status maintained per packing list)
- **Add Items**: Add new items during packing process
- **Remove Items**: Remove unneeded items from list
- **Member Sections**: Separate views for each family member's items, organized by category
- **Whole Family Section**: Shared items visible to all members, organized by category
- **Dynamic Item Updates**: Changes to item names, assignments, or removals in item manager are reflected in packing lists
- **New Item Prompts**: If new items are added to referenced categories, track and prompt user to optionally add them to the packing list

### Template Feedback
- **Update Prompt**: When packing list is modified, offer to update source template
- **User Choice**: User decides whether changes should be saved to template
- **New Template**: Option to save modified list as new template

## Offline and Sync Behavior

### Offline Capabilities
- **Full Functionality**: All core features work offline
- **Local Storage**: Changes stored in browser's IndexedDB
- **Sync Queue**: API calls queued when offline, executed when online
- **Conflict Resolution**: Last writer wins automatically (no user intervention)

### Data Synchronization
- **Background Sync**: Automatic sync when connection restored
- **Change Tracking**: All modifications timestamped for conflict resolution
- **Soft Deletes**: Deleted items preserved for sync, with optional restoration
- **Incremental Updates**: Only changed data transmitted during sync

## Default Data and Examples

### Standard Categories (Created for New Families)
1. **International**: Cross-border travel items
2. **Cold Weather**: Winter and cold climate gear  
3. **Beach**: Beach and water activity items
4. **Formal**: Business and formal event attire
5. **Work**: Professional and business travel items
6. **Car**: Road trip and driving essentials

### Example Templates (Provided as Starting Points)
1. **International Beach Vacation**: Combines International + Beach categories
2. **Work Conference**: Combines Work + Formal categories + specific items
3. **Weekend Mountain Trip**: Cold Weather + Car + specific outdoor items
4. **National Park Adventure**: Car + outdoor items + camping gear

### Default Items by Category
- **International**: Passport, Visa, Travel Insurance, Currency, Power Adapter
- **Cold Weather**: Heavy Jacket, Warm Boots, Gloves, Hat, Thermal Underwear  
- **Beach**: Swimsuit, Sunscreen, Beach Towel, Sunglasses, Sandals
- **Formal**: Dress Shirt, Tie, Dress Shoes, Suit, Jewelry
- **Work**: Laptop, Chargers, Business Cards, Notebook, Pens
- **Car**: Driver's License, Car Keys, Phone Charger, Sunglasses, Water Bottle

## User Experience Flows

### New Family Setup
1. SystemAdmin creates family
2. FamilyAdmin user created and assigned to family
3. Default categories and items automatically created
4. Example templates available immediately
5. Family can customize items and create new templates

### Trip Planning Workflow  
1. **Template Selection**: Browse and select appropriate template
2. **Customization**: Add/remove items based on specific trip needs
3. **Member Assignment**: Assign items to specific family members
4. **List Generation**: Create final packing list for trip
5. **Packing Execution**: Check off items as packed
5. **Template Update**: Optionally save modifications back to template
6. **User Choice**: User decides whether changes should be saved to template
7. **New Template**: Option to save modified list as new template

## Packing Lists (Detailed)

This section captures the detailed requirements and behaviors for creating, updating and managing packing lists.

### Core data and propagation rules
- Packing lists reference master items by ID; items are not copied. Changes to a master item's name, category membership, or global assignments propagate to any packing list that references the master item.
- Items can belong to multiple categories. In packing list displays that show a single category group for an item, the item's "first" category (deterministic order by category name) is used for grouping.
- Items may be assigned to multiple family members (or the whole family). The packing list UI shows each item once and renders assignments as a comma-separated list (e.g. "T-Shirts — Bob, Sally, Tim").

### Per-user checked state and visibility
- Checks (packed/unpacked) are stored per (packing_list_item_id, user_id). Each family member's check state is independent, and checks are visible to all family members.
- A single packing list may be marked as the family's active list. The Dashboard renders the active list as columns: the left-most column contains whole-family items; subsequent columns represent each family member's items.

### "Not needed" behavior and one-offs
- Users may mark an item as "not needed" for the list; this flag is persisted on the packing list item row, the item is visually greyed and moved toward the bottom of its column but remains in the list history.
- Items added ad-hoc (one-off items) are initially stored only on the packing list (they reference no master item). The UI offers an option to "Promote to Master Item / Template" which, when chosen, creates a new master item (and optionally updates templates) and converts the list row to reference that master item.

### Concurrency, propagation and templates
- Master item updates (name, assignments, categories) must be propagated to packing list rows that reference the master item. For one-offs, changes to master data do not affect existing one-off rows unless promoted.
- Template-referenced categories are dynamic: creating a list from a template that references a category includes all current items in that category at list creation time. Future additions to the category do not retroactively modify existing lists unless the user chooses to pull new items into the list via an explicit prompt.

### APIs (recommended)
Design suggestions for server endpoints to implement the behaviors above (names may be adapted to local conventions):
- GET /api/packing-lists — list packing lists for the family (supports sort=name|created_at and filter=q)
- POST /api/packing-lists — create a packing list, optional body: { name, templateId?, includeTemplateAssignments=true }
- POST /api/packing-lists/:id/populate-from-template — (server-side helper) populate an existing list from a template
- POST /api/packing-lists/:id/items — add item(s) to a list; body supports either { masterItemId, assignments? } or { oneOff: { name, categoryId?, assignments? } }
- PATCH /api/packing-lists/:id/items/:itemId/check — toggle or set per-user checked state; body: { userId, checked: true|false }
- PATCH /api/packing-lists/:id/items/:itemId/not-needed — set not_needed flag; body: { notNeeded: true|false }
- POST /api/packing-lists/:id/items/:itemId/promote — promote one-off to master item/template; body: { createTemplate?: boolean }
- PATCH /api/packing-lists/:id/active — set this list as the family's active list

### Frontend behaviors and UX
- Packing Lists page: shows all lists for the family; default sort is creation date (most recent first) and supports sorting by name. A case-insensitive filter input filters list names and template names; filter input is debounced (250ms).
- Create New List flow: modal dialog where user picks an optional template, reviews the populated items (with assignments shown), edits assignments and one-offs before saving; the modal validates that at least one item exists before allowing creation.
- Dashboard active list rendering: left-most column shows whole-family items grouped by category (first category when multiple); subsequent columns per family member, each grouped by category; within each category items are sorted alphabetically.
- Checking/unchecking an item triggers an API update for the current user and updates UI optimistically. "Not needed" toggles persist to the list and update UI accordingly.

### Filters, performance and edge cases
- Search/filter inputs are debounced (250ms) and perform case-insensitive substring matches across item names and member assignments.
- Edge cases covered: empty family (no members) should render only whole-family column; items with no categories show in an "Uncategorized" group; items assigned only to members not in the family are ignored at render time and surfaced in validation logs.

### Acceptance criteria
- Backend endpoints exist and are covered by unit/integration tests that verify: creation from template preserves assignments and references master item IDs; per-user checks are recorded separately; not_needed behavior persists; promoting a one-off converts it to a master item and updates the list row to reference it.
- Frontend UI exists for creating, viewing, filtering, and managing packing lists, including the create modal and Dashboard active-list rendering. UI tests (unit or E2E) validate the main user flows: create from template, toggle checks, mark not_needed, add one-off and promote.
