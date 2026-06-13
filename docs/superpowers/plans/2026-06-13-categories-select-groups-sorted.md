# Categories Select + Sorted Item Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tab-based Manage Categories UI with a searchable dropdown selector (preserving custom sort order); sort item groups alphabetically in their selector; and display items in an item group grouped by category name with alphabetical ordering within each group.

**Architecture:** A small backend JOIN enriches `getItemsForTemplate` with `categoryId` and `categoryName` on each returned item. The categories page swaps `<Tabs>` for a `<Select>` (no order change). The item groups page sorts groups alphabetically in the Select and renders items grouped under bold category headers. No new API routes or DB migrations needed.

**Tech Stack:** Node ≥22, Express, SQLite (`sqlite`/`sqlite3`), TypeScript, React 18 + Mantine v8, Vitest + supertest.

---

## Background facts (verified)

- `TemplateRepository.getItemsForTemplate()` is in `server/repositories.ts` ~line 391. It returns `Item[]` from `SELECT i.* FROM items i JOIN template_items ...`. This needs a LEFT JOIN with `categories` to add `categoryId` and `categoryName`.
- Route `GET /item-group/:id/items` and `GET /template/:id/items` both call `templateRepo.getItemsForTemplate(id)` and return `{ items }`.
- `client/src/components/TemplateManager.tsx` — the item groups page. Currently stores items as `Item = { id: string; name: string }`. Needs `categoryId?: string; categoryName?: string` added.
- `client/src/pages/CategoryManagementPage.tsx` — uses `<Tabs value={selectedTab}>` with `<Tabs.List>` and `<Tabs.Panel>`. Needs tabs replaced with `<Select searchable>` + a single rendered panel for the selected category. Custom sort order must be preserved (no alphabetical sorting of the Select data).
- Root vitest config runs `server/**/*.test.ts` but NOT `client/src/__tests__/CategoryManagementPage.test.tsx` if it exists.
- `npm run build` = `npm --prefix client run build` (Vite). `npm test` = `npx vitest --run`.

---

## File Map

| File | Change |
|------|--------|
| `server/repositories.ts` | Enrich `getItemsForTemplate` query with LEFT JOIN on `categories` |
| `server/__tests__/template-repository.test.ts` | Add test: items returned include `categoryId` and `categoryName` |
| `client/src/components/TemplateManager.tsx` | Sort groups Select alphabetically; render items grouped by `categoryName` |
| `client/src/pages/CategoryManagementPage.tsx` | Replace `<Tabs>` with `<Select searchable>` + single category card |

---

## Task 1: Enrich getItemsForTemplate with category info

**Files:**
- Modify: `server/repositories.ts` (~line 391)
- Modify: `server/__tests__/template-repository.test.ts`

- [ ] **Step 1: Write the failing test**

Open `server/__tests__/template-repository.test.ts`. Add this test INSIDE the existing `describe('TemplateRepository', ...)` block, after the existing tests:

```typescript
it('getItemsForTemplate includes categoryId and categoryName on each item', async () => {
  const db = await getDb();
  const repo = new TemplateRepository();
  const now = new Date().toISOString();
  const famId = uuidv4();
  const catId = uuidv4();
  const templateId = uuidv4();
  const itemId = uuidv4();

  await db.run(`INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`, [famId, 'Fam', now, now]);
  await db.run(`INSERT INTO categories (id, familyId, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [catId, famId, 'Electronics', now, now]);
  await db.run(`INSERT INTO items (id, familyId, categoryId, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [itemId, famId, catId, 'Laptop', now, now]);
  await repo.create({ id: templateId, family_id: famId, name: 'T', created_at: now, updated_at: now });
  await repo.assignItem(templateId, itemId);

  const items = await repo.getItemsForTemplate(templateId);
  expect(items).toHaveLength(1);
  expect(items[0].categoryId).toBe(catId);
  expect((items[0] as any).categoryName).toBe('Electronics');
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest --run server/__tests__/template-repository.test.ts`
Expected: FAIL — `categoryName` is `undefined`.

- [ ] **Step 3: Update getItemsForTemplate to JOIN categories**

In `server/repositories.ts`, replace the `getItemsForTemplate` method body (currently ~line 391–394):

```typescript
async getItemsForTemplate(template_id: string): Promise<Item[]> {
  const db = await getDb();
  return db.all(
    `SELECT i.*, c.name AS categoryName
     FROM items i
     JOIN template_items ti ON i.id = ti.item_id
     LEFT JOIN categories c ON i.categoryId = c.id
     WHERE ti.template_id = ? AND i.deleted_at IS NULL`,
    [template_id]
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest --run server/__tests__/template-repository.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

Run: `npx vitest --run`
Expected: all tests PASS (127+ tests).

- [ ] **Step 6: Commit**

```bash
git add server/repositories.ts server/__tests__/template-repository.test.ts
git commit -m "feat(server): include categoryName in getItemsForTemplate response"
```

---

## Task 2: Item groups page — alphabetical Select + items grouped by category

**Files:**
- Modify: `client/src/components/TemplateManager.tsx`

The `Item` type needs `categoryId` and `categoryName`. Groups Select data must be sorted A→Z. The items list must be replaced with a grouped display: one bold section header per category, items sorted A→Z within each section, "Uncategorized" section last.

- [ ] **Step 1: Update the Item type and groups Select sort**

At the top of `TemplateManager.tsx`, change the `Item` type and the `groups` Select `data` prop:

```typescript
// Replace the existing type:
type Item = { id: string; name: string; categoryId?: string; categoryName?: string };
```

In the `<Select ... data={...}>` prop (around line 155), sort groups alphabetically:
```tsx
data={groups.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(g => ({ value: g.id, label: g.name }))}
```

Also update `handleDelete` to select the first item from the sorted list after deletion (around line 131):
```typescript
const sorted = [...loaded].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
setSelectedGroupId(sorted[0]?.id ?? null);
```

- [ ] **Step 2: Replace the flat items List with a grouped render**

Replace the `<List mb="md">...</List>` block (lines 202–226) with a grouped render. Insert this helper function ABOVE the `return` statement in the component (after `const excludedItemIds = ...`):

```typescript
// Group items by categoryName, sort within each group, put Uncategorized last
const groupedItems: { categoryName: string; items: Item[] }[] = (() => {
  const map = new Map<string, Item[]>();
  for (const item of currentItems) {
    const key = item.categoryName || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  const entries = Array.from(map.entries())
    .map(([categoryName, items]) => ({
      categoryName: categoryName || 'Uncategorized',
      items: items.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    }))
    .sort((a, b) => {
      if (a.categoryName === 'Uncategorized') return 1;
      if (b.categoryName === 'Uncategorized') return -1;
      return a.categoryName.localeCompare(b.categoryName);
    });
  return entries;
})();
```

Then replace the `<List mb="md">...</List>` block with:

```tsx
<div mb-md>
  {currentItems.length === 0 ? (
    <Text c="dimmed">No items in this group yet.</Text>
  ) : (
    groupedItems.map(group => (
      <div key={group.categoryName} style={{ marginBottom: 12 }}>
        <Text fw={700} size="sm" c="dimmed" mb={4}>{group.categoryName}</Text>
        <List>
          {group.items.map(item => (
            <List.Item key={item.id}>
              <Group justify="space-between">
                <Text>{item.name}</Text>
                <Group>
                  <Text c="dimmed" size="sm">{(itemMembers[item.id] || []).map(m => m.name).join(', ')}</Text>
                  <ActionIcon color="blue" variant="light" onClick={() => { setEditMasterItemId(item.id); setShowEditDrawer(true); }}>
                    <IconEdit size={16} />
                  </ActionIcon>
                  <ActionIcon color="red" variant="light" onClick={async () => {
                    await removeItemFromItemGroup(selectedGroup.id, item.id);
                    setGroupItems(prev => ({ ...prev, [selectedGroup.id]: (prev[selectedGroup.id] || []).filter(i => i.id !== item.id) }));
                  }}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </List.Item>
          ))}
        </List>
      </div>
    ))
  )}
</div>
```

Note: the `<div mb-md>` is a wrapper div — use `style={{ marginBottom: '1rem' }}` or just `<div>` since `mb-md` is not valid HTML. Use: `<div style={{ marginBottom: 16 }}>`.

- [ ] **Step 3: Build to verify TypeScript compiles**

Run: `npm run build`
Expected: `✓ built in X.XXs` with no TypeScript errors. Fix any errors before continuing.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/TemplateManager.tsx
git commit -m "feat(client): sort item groups alphabetically and group items by category"
```

---

## Task 3: Categories page — replace Tabs with searchable Select

**Files:**
- Modify: `client/src/pages/CategoryManagementPage.tsx`

Replace the `<Tabs>` navigation with a searchable `<Select>` while preserving the existing detail card, sort mode, all handlers, and the custom category order.

- [ ] **Step 1: Update imports**

In `client/src/pages/CategoryManagementPage.tsx`, replace the Mantine import block:

```typescript
// REMOVE from import: Tabs
// ADD to import: Select
import {
  Card,
  Title,
  Stack,
  Group,
  Button,
  TextInput,
  Loader,
  ActionIcon,
  Text,
  Select,
  List,
  Modal,
  Checkbox,
} from '@mantine/core';
```

- [ ] **Step 2: Replace the Tabs block with Select + single card**

Find the `<Tabs value={selectedTab} ...>` block (starts around line 337) through the closing `</Tabs>` (around line 488). Replace the ENTIRE `<Tabs>...</Tabs>` block with:

```tsx
<Select
  mb="md"
  searchable
  placeholder="Select a category"
  nothingFoundMessage="No categories found"
  data={categories.map(cat => ({ value: cat.id, label: cat.name }))}
  value={selectedTab}
  onChange={changeSelectedTab}
  aria-label="Select category"
/>

{selectedTab && (() => {
  const cat = categories.find(c => c.id === selectedTab);
  if (!cat) return null;
  return (
    <Card withBorder mt="md">
      <Group mb="md" align="center" style={{ justifyContent: 'space-between' }}>
        {editId === cat.id ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <TextInput
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUpdate()}
              style={{ flex: '1 1 auto' }}
            />
            <ActionIcon color="green" onClick={handleUpdate} title="Save">
              <IconEdit size={16} />
            </ActionIcon>
            <ActionIcon color="gray" onClick={() => { setEditId(null); setEditName(''); }} title="Cancel">
              <IconX size={16} />
            </ActionIcon>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Title order={4} style={{ margin: 0 }}>{cat.name}</Title>
            <ActionIcon color="blue" variant="light" onClick={() => handleEdit(cat.id, cat.name)} title="Edit category name">
              <IconEdit size={16} />
            </ActionIcon>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div>
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => {
              changeSelectedTab(cat.id);
              setShowAddPaneForCategory({ open: true, categoryId: cat.id });
              setEditMasterItemId(null);
              setShowEditDrawer(true);
            }}>Add</Button>
          </div>
          <div>
            <Checkbox label="Select multiple" checked={multiSelectMode} onChange={(e) => { setMultiSelectMode(e.currentTarget.checked); if (!e.currentTarget.checked) setSelectedItems(new Set()); }} />
          </div>
          {multiSelectMode && (
            <div>
              <Group>
                <Text size="sm">{selectedItems.size} selected</Text>
                <Button size="xs" onClick={() => setShowBulkEdit(true)} disabled={selectedItems.size === 0}>Bulk Edit</Button>
              </Group>
            </div>
          )}
        </div>
      </Group>
      <Title order={5} mb="sm">Items in this category</Title>
      {categoryItems[cat.id]?.length > 0 ? (
        <div>
          <style>{`
            .tl-category-grid {
              display: grid;
              gap: 8px;
              grid-template-columns: repeat(1, 1fr);
            }
            @media (min-width: 640px) {
              .tl-category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            }
            @media (min-width: 1024px) {
              .tl-category-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            }
            @media (min-width: 1280px) {
              .tl-category-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
            }
            .tl-category-item {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 8px 10px;
              border-radius: 6px;
              border: 1px solid rgba(0,0,0,0.04);
              background: #fff;
            }
            .tl-category-item .tl-item-left { flex: 1 1 auto; margin-right: 12px; }
            .tl-category-item .tl-item-right { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
          `}</style>
          <div className="tl-category-grid">
            {categoryItems[cat.id].slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((item) => (
              <div key={item.id} className="tl-category-item">
                <div className="tl-item-left" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {multiSelectMode && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.name}`}
                      checked={selectedItems.has(item.id)}
                      onChange={(e) => {
                        const checked = (e.currentTarget as HTMLInputElement).checked;
                        setSelectedItems(prev => {
                          const copy = new Set(prev);
                          if (checked) copy.add(item.id); else copy.delete(item.id);
                          return copy;
                        });
                      }}
                    />
                  )}
                  <div>
                    <Text>{item.name}</Text>
                    {itemWholeFamily[item.id] ? (
                      <Text c="dimmed" size="sm">Whole family</Text>
                    ) : Array.isArray(itemMembers[item.id]) && itemMembers[item.id].length > 0 ? (
                      <Text c="dimmed" size="sm">{itemMembers[item.id].map((m: any) => m.name).join(', ')}</Text>
                    ) : null}
                  </div>
                </div>
                <div className="tl-item-right">
                  <ActionIcon color="blue" variant="light" onClick={() => { setEditMasterItemId(item.id); setShowEditDrawer(true); }} title="Edit item">
                    <IconEdit size={16} />
                  </ActionIcon>
                  <ConfirmDelete
                    title="Delete item"
                    confirmText="Delete item?"
                    onConfirm={async () => {
                      const res = await deleteItem(item.id);
                      if (res.response.ok) {
                        setCategoryItems(prev => ({
                          ...prev,
                          [cat.id]: (prev[cat.id] || []).filter(i => i.id !== item.id),
                        }));
                        setItems(prev => prev.filter(i => i.id !== item.id));
                        bumpRefresh();
                      } else {
                        alert('Failed to delete item: ' + (res.data?.error || res.response.statusText));
                      }
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Text c="dimmed">No items in this category</Text>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 16 }}>
        <ConfirmDelete onConfirm={() => handleDelete(cat.id)} title="Delete category" />
      </div>
    </Card>
  );
})()}
```

- [ ] **Step 3: Build to verify TypeScript compiles**

Run: `npm run build`
Expected: `✓ built in X.XXs` with no TypeScript errors. Fix any errors before continuing.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest --run`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/CategoryManagementPage.tsx
git commit -m "feat(client): replace category tabs with searchable select dropdown"
```

---

## Spec Coverage Check

| Requirement | Task |
|-------------|------|
| Categories page: searchable Select instead of tabs | Task 3 |
| Categories keep custom sort order in Select | Task 3 (data not sorted) |
| Sort mode / drag-and-drop preserved | Task 3 (not touched) |
| Item groups Select sorted alphabetically | Task 2 Step 1 |
| Item groups items grouped by category | Task 2 Step 2 |
| Items within each category section sorted A→Z | Task 2 Step 2 |
| Uncategorized items in separate section at bottom | Task 2 Step 2 |
| Backend enriches items with categoryName | Task 1 |
| Backend test for categoryName on items | Task 1 Step 1 |
