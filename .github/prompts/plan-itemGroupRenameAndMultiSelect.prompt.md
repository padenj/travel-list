# Plan: Add Item Group Multi-Select to Item Drawers & Rename Template to Item Group

This plan adds item group assignment via multi-select checkboxes to the item creation/edit flows and systematically renames "template" to "item_group" throughout the codebase, including database schema migration.

## Steps

1. **Extend item edit-data API** to include item's current item group assignments and all available item groups for the family. Modify [GET /items/:itemId/edit-data](server/routes.ts#L1178) to fetch templates via `TemplateRepository.findTemplatesForItem()` and `TemplateRepository.findAll()`, add to response payload as `itemGroups` and `itemGroupIds`.

2. **Add item group multi-select to [ItemEditDrawer](client/src/components/ItemEditDrawer.tsx#L28-L46)** using checkbox pattern from [TemplateManager](client/src/pages/TemplateManager.tsx#L388-L395). Display below member assignments section. On save, diff `initialGroupIds` vs `selectedGroupIds` and call `assignItemToTemplate()` / `removeItemFromTemplate()` for each change before closing drawer.

3. **Create database migration** to rename tables and columns: `templates` → `item_groups`, `template_items` → `item_group_items`, `template_categories` → `item_group_categories`, `packing_list_item_templates` → `packing_list_item_groups`. Update all foreign key columns (e.g., `template_id` → `item_group_id`). Add migration to [server/migrations/](server/migrations/) directory following existing patterns.

4. **Update server-side code** systematically: Rename [types.ts](server/types.ts#L73-L81) interfaces (`Template` → `ItemGroup`), update [db.ts](server/db.ts#L69-L113) CREATE TABLE statements, refactor [TemplateRepository](server/repositories.ts#L380-L460) to `ItemGroupRepository`, rename all route handlers in [routes.ts](server/routes.ts#L60-L314) from `/templates` → `/item-groups` and `/template` → `/item-group`.

5. **Update client-side code** to match backend changes: Rename API functions in [api.ts](client/src/api.ts#L147-L154) (e.g., `getTemplates` → `getItemGroups`), update all imports/usages in [TemplateManager.tsx](client/src/pages/TemplateManager.tsx), [PackingListPage.tsx](client/src/pages/PackingListPage.tsx#L196-L198), and [AddItemsDrawer.tsx](client/src/components/AddItemsDrawer.tsx). Update type definitions and state variables throughout components.

6. **Verify and test** database migration with rollback capability, run existing integration tests ([packing-list.integration.test.ts](server/__tests__/packing-list.integration.test.ts)), update tests to use new naming, and manually verify item group assignment UI in both create and edit flows.

## Further Considerations

1. **Migration strategy**: Should the database migration run automatically on server startup, or require manual execution? Recommend auto-migration for development, manual for production with backup verification.

2. **API versioning**: The URL change from `/templates` to `/item-groups` is breaking. Should we maintain `/templates` endpoints as deprecated aliases for backward compatibility, or enforce a clean break? Current assessment: clean break acceptable since this appears to be an internal application.

3. **UI placement**: Where should the item group checkboxes appear in [ItemEditDrawer](client/src/components/ItemEditDrawer.tsx)? Options: (A) After member assignments, (B) In a separate collapsible section, (C) In a new tab if drawer becomes too long. Recommend (A) for simplicity unless drawer height becomes problematic.
