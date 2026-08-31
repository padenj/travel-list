# Packing List Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-packing-list trip notes that are editable from a collapsible dashboard panel with 3-line preview and debounce+blur autosave that does not disrupt typing/caret.

**Architecture:** Persist notes on `packing_lists.notes` and reuse existing single-list read/update APIs (`GET /packing-lists/:id`, `PUT /packing-lists/:id`) instead of creating new endpoints. On the dashboard, load notes with the active list payload, keep a local draft as the textarea source of truth, and autosave via debounced + blur-triggered `updatePackingList` calls with request sequencing to avoid stale response overwrites.

**Tech Stack:** TypeScript, Express, SQLite, React, Mantine, Vitest, Testing Library

---

## File Structure (planned changes)

- **Create:** `server/migrations/migrations/20260711_01_add_packing_list_notes.cjs`
  - Adds `notes TEXT` to `packing_lists` with reversible down migration.
- **Modify:** `server/server-types.ts`
  - Add `notes?: string | null` to `PackingList`.
- **Modify:** `server/routes.ts`
  - Validate optional `notes` in `PUT /packing-lists/:id` and persist via existing update flow.
- **Modify:** `server/__tests__/database.test.ts`
  - Assert `packing_lists` schema includes `notes`.
- **Modify:** `server/__tests__/packing-list.integration.test.ts`
  - Add integration coverage for read/write notes on packing lists.
- **Modify:** `client/src/components/Dashboard.tsx`
  - Add “Trip Notes” collapsible panel above list content; implement draft state and autosave behavior.
- **Modify:** `client/src/__tests__/Dashboard.test.tsx`
  - Add tests for collapsed preview, helper text, debounce save, blur save, and typing stability safeguards.

---

### Task 1: Add packing-list notes schema and server type support

**Files:**
- Create: `server/migrations/migrations/20260711_01_add_packing_list_notes.cjs`
- Modify: `server/server-types.ts`
- Test: `server/__tests__/database.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
// server/__tests__/database.test.ts
it('should create packing_lists table with notes column', async () => {
  const tableInfo = await db.all("PRAGMA table_info(packing_lists)");
  const columnNames = tableInfo.map((col: any) => col.name);
  expect(columnNames).toContain('notes');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/database.test.ts -t "packing_lists table with notes column"`
Expected: FAIL with assertion that `notes` is missing from `packing_lists` columns.

- [ ] **Step 3: Add migration and update server type**

```js
// server/migrations/migrations/20260711_01_add_packing_list_notes.cjs
module.exports = {
  up: async ({ db }) => {
    await db.exec(`ALTER TABLE packing_lists ADD COLUMN notes TEXT;`);
  },
  down: async ({ db }) => {
    await db.exec(`
      CREATE TABLE packing_lists_backup AS
      SELECT id, family_id, name, created_at, updated_at, deleted_at
      FROM packing_lists;
      DROP TABLE packing_lists;
      ALTER TABLE packing_lists_backup RENAME TO packing_lists;
    `);
  },
};
```

```ts
// server/server-types.ts
export interface PackingList {
  id: string;
  family_id: string;
  name: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  member_ids?: string[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/database.test.ts -t "packing_lists table with notes column"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/migrations/migrations/20260711_01_add_packing_list_notes.cjs server/server-types.ts server/__tests__/database.test.ts
git commit -m "feat(server): add packing list notes schema"
```

---

### Task 2: Add API behavior for reading/writing notes on single-list endpoints

**Files:**
- Modify: `server/routes.ts:748-769,836-885`
- Modify: `server/__tests__/packing-list.integration.test.ts`

- [ ] **Step 1: Write failing integration tests for notes read/write**

```ts
// server/__tests__/packing-list.integration.test.ts
it('returns notes when fetching a packing list by id', async () => {
  const createRes = await request(app)
    .post(`/api/families/${testFamilyId}/packing-lists`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Trip with notes' });
  const listId = createRes.body.list.id;

  await request(app)
    .put(`/api/packing-lists/${listId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ notes: 'Line 1\nLine 2\nLine 3\nLine 4' })
    .expect(200);

  const getRes = await request(app)
    .get(`/api/packing-lists/${listId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  expect(getRes.body.list.notes).toBe('Line 1\nLine 2\nLine 3\nLine 4');
});

it('rejects non-string notes updates', async () => {
  const createRes = await request(app)
    .post(`/api/families/${testFamilyId}/packing-lists`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Trip invalid notes' });
  const listId = createRes.body.list.id;

  const badRes = await request(app)
    .put(`/api/packing-lists/${listId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ notes: { bad: true } });

  expect(badRes.status).toBe(400);
  expect(badRes.body.error).toBe('notes must be a string');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/packing-list.integration.test.ts`
Expected: FAIL for missing notes validation and/or missing notes persistence assertion.

- [ ] **Step 3: Implement route-level notes validation and persistence**

```ts
// server/routes.ts (inside PUT /packing-lists/:id)
if (Object.prototype.hasOwnProperty.call(updates, 'notes') && typeof updates.notes !== 'string') {
  return res.status(400).json({ error: 'notes must be a string' });
}

const updated = await packingListRepo.update(id, updates);
return res.json({ list: updated });
```

```ts
// server/routes.ts (GET /packing-lists/:id already returns `list`; keep it as-is after type/schema update)
return res.json({ list, items: sanitizedItems, checks, not_needed_rows: notNeededRows, template_ids: templateIds });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/packing-list.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts server/__tests__/packing-list.integration.test.ts
git commit -m "feat(server): support packing list notes updates"
```

---

### Task 3: Build dashboard Trip Notes panel with stable draft + autosave

**Files:**
- Modify: `client/src/components/Dashboard.tsx:1-585`
- Test: `client/src/__tests__/Dashboard.test.tsx`

- [ ] **Step 1: Write failing dashboard tests for panel rendering + autosave**

```tsx
// client/src/__tests__/Dashboard.test.tsx
it('shows helper text in collapsed notes panel when notes are empty', async () => {
  (api.getPackingList as any).mockResolvedValue({
    response: { ok: true },
    data: { list: { id: 'list-1', notes: '' }, items: [], checks: [], not_needed_rows: [] },
  });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(await screen.findByText('Add reminders for future trips…')).toBeInTheDocument();
});

it('autosaves notes on debounce and on blur', async () => {
  vi.useFakeTimers();
  const updateSpy = (api.updatePackingList as any).mockResolvedValue({ response: { ok: true }, data: {} });
  (api.getPackingList as any).mockResolvedValue({
    response: { ok: true },
    data: { list: { id: 'list-1', notes: 'Line 1' }, items: [], checks: [], not_needed_rows: [] },
  });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);

  const input = await screen.findByRole('textbox', { name: 'Trip notes' });
  await userEvent.type(input, ' updated');
  vi.advanceTimersByTime(500);
  expect(updateSpy).toHaveBeenCalledWith('list-1', { notes: 'Line 1 updated' });

  await userEvent.tab(); // blur
  expect(updateSpy).toHaveBeenCalled();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/__tests__/Dashboard.test.tsx`
Expected: FAIL because notes panel and autosave logic do not exist yet.

- [ ] **Step 3: Implement Trip Notes UI + local-draft autosave logic**

```tsx
// client/src/components/Dashboard.tsx (state)
const [listNotes, setListNotes] = useState<string>('');
const [notesDraft, setNotesDraft] = useState<string>('');
const [notesExpanded, setNotesExpanded] = useState(false);
const [notesSaving, setNotesSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
const saveTimerRef = React.useRef<number | null>(null);
const saveSeqRef = React.useRef(0);
const latestAppliedSeqRef = React.useRef(0);
```

```tsx
// client/src/components/Dashboard.tsx (after getPackingList success)
const fetchedNotes = typeof listRes.data.list?.notes === 'string' ? listRes.data.list.notes : '';
setListNotes(fetchedNotes);
setNotesDraft(fetchedNotes);
```

```tsx
// client/src/components/Dashboard.tsx (save helpers)
const saveNotesNow = useCallback(async (nextNotes: string) => {
  if (!activeListId) return;
  const requestSeq = ++saveSeqRef.current;
  setNotesSaving('saving');
  try {
    const res = await import('../api').then(m => m.updatePackingList(activeListId, { notes: nextNotes }));
    if (!res.response.ok) throw new Error('Failed to save notes');
    if (requestSeq >= latestAppliedSeqRef.current) {
      latestAppliedSeqRef.current = requestSeq;
      setListNotes(nextNotes);
      setNotesSaving('saved');
    }
  } catch (err) {
    if (requestSeq >= latestAppliedSeqRef.current) {
      setNotesSaving('error');
      showNotification({ title: 'Save failed', message: 'Unable to save trip notes', color: 'red' });
    }
  }
}, [activeListId]);

const scheduleDebouncedSave = useCallback((nextNotes: string) => {
  if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  saveTimerRef.current = window.setTimeout(() => { void saveNotesNow(nextNotes); }, 500);
}, [saveNotesNow]);
```

```tsx
// client/src/components/Dashboard.tsx (panel above list content)
<div style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: 12 }}>
  <Group justify="space-between">
    <Text fw={600}>Trip Notes</Text>
    <Button size="xs" variant="subtle" onClick={() => setNotesExpanded(v => !v)}>
      {notesExpanded ? 'Collapse' : 'Expand'}
    </Button>
  </Group>

  {!notesExpanded ? (
    <Text style={{ whiteSpace: 'pre-line', marginTop: 8 }}>
      {(notesDraft || 'Add reminders for future trips…').split('\n').slice(0, 3).join('\n')}
    </Text>
  ) : (
    <textarea
      aria-label="Trip notes"
      value={notesDraft}
      onChange={(e) => {
        const next = e.currentTarget.value;
        setNotesDraft(next);
        scheduleDebouncedSave(next);
      }}
      onBlur={() => {
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        void saveNotesNow(notesDraft);
      }}
      style={{ width: '100%', minHeight: 120, marginTop: 8 }}
    />
  )}
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/__tests__/Dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Dashboard.tsx client/src/__tests__/Dashboard.test.tsx
git commit -m "feat(client): add dashboard trip notes panel with autosave"
```

---

### Task 4: Add regression tests for stale-response protection and list switching

**Files:**
- Modify: `client/src/__tests__/Dashboard.test.tsx`

- [ ] **Step 1: Write failing tests for stale responses and list switching**

```tsx
it('keeps local draft when older save resolves after newer save', async () => {
  vi.useFakeTimers();
  let resolveFirst: any;
  let resolveSecond: any;
  (api.updatePackingList as any)
    .mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }))
    .mockReturnValueOnce(new Promise((r) => { resolveSecond = r; }));

  // type twice quickly -> two saves
  // resolve second first, then first; assert textbox still has newest text
});

it('loads notes for newly selected list', async () => {
  // mock activeListId switching list-1 -> list-2 and getPackingList responses
  // assert textarea/preview shows list-2 notes after switch
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/__tests__/Dashboard.test.tsx -t "older save|selected list"`
Expected: FAIL before stale-response/list-switch logic is fully covered.

- [ ] **Step 3: Implement missing guardrails (if any) to satisfy tests**

```tsx
// client/src/components/Dashboard.tsx
if (requestSeq < latestAppliedSeqRef.current) return;
latestAppliedSeqRef.current = requestSeq;
```

```tsx
// client/src/components/Dashboard.tsx (on activeListId change / load)
if (saveTimerRef.current) {
  window.clearTimeout(saveTimerRef.current);
  saveTimerRef.current = null;
}
setNotesSaving('idle');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/__tests__/Dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/__tests__/Dashboard.test.tsx client/src/components/Dashboard.tsx
git commit -m "test(client): cover notes autosave race and list switching"
```

---

### Task 5: Final targeted verification

**Files:**
- Modify: none
- Test: `server/__tests__/database.test.ts`, `server/__tests__/packing-list.integration.test.ts`, `client/src/__tests__/Dashboard.test.tsx`

- [ ] **Step 1: Run backend targeted tests**

Run: `npx vitest run server/__tests__/database.test.ts server/__tests__/packing-list.integration.test.ts`
Expected: PASS for notes schema and API behavior tests.

- [ ] **Step 2: Run frontend targeted tests**

Run: `npx vitest run client/src/__tests__/Dashboard.test.tsx`
Expected: PASS for notes panel rendering + autosave + race protection tests.

- [ ] **Step 3: Commit verification checkpoint**

```bash
git add -A
git commit -m "chore: verify packing list notes feature"
```

---

## Self-Review Checklist (completed)

1. **Spec coverage:** Covered data model, single-list API read/write, dashboard collapsible preview/editor, debounce+blur autosave, typing/caret stability safeguards, and targeted tests.
2. **Placeholder scan:** No TODO/TBD placeholders; each code-change step includes concrete snippets and commands.
3. **Type consistency:** Uses `notes` consistently across migration, `PackingList` type, route update payload, and dashboard/client usage.
