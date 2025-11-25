import { useEffect, useState } from 'react';
import { Card, Title, Group, Button, Stack, Text, Drawer, TextInput, Badge, Checkbox, MultiSelect, ActionIcon, Tooltip } from '@mantine/core';
import { IconEdit, IconCheck, IconX, IconLayersOff } from '@tabler/icons-react';
import {
  getFamilyPackingLists,
  getCurrentUserProfile,
  getPackingList,
  getTemplates,
  getItems,
  updatePackingList,
  deletePackingList,
  deletePackingListItem,
  addItemToPackingList,
  createPackingList,
  populatePackingListFromTemplate,
} from '../api';
import { showNotification } from '@mantine/notifications';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import { useListEditDrawer } from '../contexts/ListEditDrawerContext';
import ItemEditDrawer from './ItemEditDrawer';

export default function ManagePackingLists() {
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [lists, setLists] = useState<any[]>([]);
  // selected removed; edit modal holds the current list being edited in editListId
  // promote UI removed for now; will reintroduce promotion logic later
  // edit modal state
  // showEditModal is managed by the global drawer
  const [editListId, setEditListId] = useState<string | null>(null);
  const [editListName, setEditListName] = useState<string>('');
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editNameDraft, setEditNameDraft] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  // categoryByItem removed - server now returns categories per item
  const [editLoading, setEditLoading] = useState(false);
  const [showTemplateAssignDrawer, setShowTemplateAssignDrawer] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  
  const [editAssignedTemplates, setEditAssignedTemplates] = useState<string[]>([]);
  const [showAddPane, setShowAddPane] = useState(false);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [addingLoading, setAddingLoading] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  // Item edit drawer state (moved to shared component)
  const [showEditItemDrawer, setShowEditItemDrawer] = useState(false);
  const [editTargetItem, setEditTargetItem] = useState<any | null>(null); // packing-list item object from editItems
  const [itemDrawerDefaultMember, setItemDrawerDefaultMember] = useState<string | null | undefined>(undefined);

  // Copy drawer state
  const [showCopyDrawer, setShowCopyDrawer] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyName, setCopyName] = useState('');
  const [copyIncludeOneOffs, setCopyIncludeOneOffs] = useState(false);
  const [copySourceList, setCopySourceList] = useState<any | null>(null);
  const [copySourceItems, setCopySourceItems] = useState<any[]>([]);
  const [copySourceTemplateIds, setCopySourceTemplateIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const profile = await getCurrentUserProfile();
      const fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
      setFamilyId(fid);
      if (!fid) return;
      const res = await getFamilyPackingLists(fid);
      if (res.response.ok) setLists(res.data.lists || []);
      try {
        const tRes = await getTemplates(fid);
        if (tRes.response.ok) setTemplates(tRes.data.templates || []);
      } catch (e) {
        // ignore
      }
    })();
    // react-centric: open edit modal if the context has requested it
    // (we rely on availableLists having been loaded via reload)
    const handleResize = () => setIsMobile(window.innerWidth < 600);
    handleResize();
    window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { pendingOpenEditId, clearPendingOpenEdit, requestOpenEdit } = useActivePackingList();

  useEffect(() => {
    if (pendingOpenEditId && familyId) {
      (async () => {
        await reload();
        const l = (await (async () => { const r = await getFamilyPackingLists(familyId || ''); return r.response.ok ? (r.data.lists || []) : []; })())?.find((x: any) => x.id === pendingOpenEditId);
        if (l) {
          openEditFor(l);
          clearPendingOpenEdit && clearPendingOpenEdit();
        }
      })();
    }
  }, [pendingOpenEditId, familyId]);

  const reload = async () => {
    if (!familyId) return;
    const res = await getFamilyPackingLists(familyId);
    if (res.response.ok) setLists(res.data.lists || []);
  };

  const doRename = async () => {
    // rename from edit modal: use editNameDraft
    if (!editListId || !editNameDraft) return;
    const res = await updatePackingList(editListId, { name: editNameDraft });
    if (res.response.ok) {
      showNotification({ title: 'Renamed', message: 'List renamed', color: 'green' });
      // update local state and exit edit mode
      setEditListName(editNameDraft);
      setIsEditingName(false);
      await reload();
    } else {
      showNotification({ title: 'Error', message: 'Failed to rename list', color: 'red' });
    }
  };

  const doDelete = async (id: string) => {
    if (!confirm('Delete this packing list?')) return;
    const res = await deletePackingList(id);
    if (res.response.ok) {
      showNotification({ title: 'Deleted', message: 'List deleted', color: 'green' });
      await reload();
    } else {
      showNotification({ title: 'Error', message: 'Failed to delete list', color: 'red' });
    }
  };

  const { openForList } = useListEditDrawer();

  const openEditFor = async (list: any) => {
    // Prefer global drawer to host the full edit UI. Keep legacy requestOpenEdit for compatibility.
    if (requestOpenEdit) requestOpenEdit(list.id);
    openForList(list.id, list.name);
  };

  const openCopyFor = async (list: any) => {
    setCopySourceList(list);
    setCopyName(`${list.name} (copy)`);
    setCopyIncludeOneOffs(false);
    setShowCopyDrawer(true);

    try {
      const serverRes = await getPackingList(list.id);
      if (serverRes.response.ok) {
        setCopySourceItems(Array.isArray(serverRes.data.items) ? serverRes.data.items : []);
        setCopySourceTemplateIds(Array.isArray(serverRes.data.template_ids) ? serverRes.data.template_ids : []);
      } else {
        setCopySourceItems([]);
        setCopySourceTemplateIds([]);
      }
    } catch (err) {
      setCopySourceItems([]);
      setCopySourceTemplateIds([]);
    }
  };

  const createCopy = async () => {
    if (!copySourceList) return;
    if (!familyId) {
      showNotification({ title: 'Error', message: 'No family', color: 'red' });
      return;
    }
    if (!copyName || copyName.trim() === '') {
      showNotification({ title: 'Error', message: 'List name is required', color: 'red' });
      return;
    }

    setCopyLoading(true);
    try {
      const createdRes = await createPackingList(familyId, copyName.trim());
      if (!createdRes.response.ok || !createdRes.data || !createdRes.data.list) {
        showNotification({ title: 'Error', message: 'Failed to create list', color: 'red' });
        return;
      }
      const newList = createdRes.data.list;

      // Populate templates (server will reconcile)
      if (Array.isArray(copySourceTemplateIds) && copySourceTemplateIds.length > 0) {
        for (const tid of copySourceTemplateIds) {
          try {
            await populatePackingListFromTemplate(newList.id, tid);
          } catch (err) {
            console.error('populate template failed', tid, err);
          }
        }
      }

      // Fetch new list items to avoid duplicating master items
      let existingMasterIds = new Set<string>();
      try {
        const newListRes = await getPackingList(newList.id);
        if (newListRes.response.ok) {
          const newItems = Array.isArray(newListRes.data.items) ? newListRes.data.items : [];
          for (const ni of newItems) {
            const mid = ni.item_id || ni.master_id || ni.itemId || ni.masterId;
            if (mid) existingMasterIds.add(String(mid));
          }
        }
      } catch (err) {
        // proceed anyway
      }

      // Add master and optionally one-off items from source
      for (const srcItem of copySourceItems || []) {
        // Robust one-off detection: prefer explicit flags from the server, but
        // fall back to presence of a display_name if flags are missing.
        const isOneOff = (() => {
          if (typeof srcItem.master_is_one_off !== 'undefined') return !!srcItem.master_is_one_off;
          if (typeof srcItem.masterIsOneOff !== 'undefined') return !!srcItem.masterIsOneOff;
          if (typeof srcItem.oneOff !== 'undefined') return !!srcItem.oneOff;
          // If server didn't supply flags, treat rows with an explicit display_name
          // or an `added_during_packing` flag as one-offs (legacy/compat cases).
          return !!(srcItem.display_name || srcItem.displayName || srcItem.added_during_packing || srcItem.addedDuringPacking);
        })();
        const srcMasterId = srcItem.item_id || srcItem.master_id || srcItem.itemId || srcItem.masterId;

        if (!isOneOff && srcMasterId) {
          // master item: add only if not already present
          if (!existingMasterIds.has(String(srcMasterId))) {
            try {
              await addItemToPackingList(newList.id, srcMasterId);
              existingMasterIds.add(String(srcMasterId));
            } catch (err) {
              console.error('Failed to add master item to copy', srcMasterId, err);
            }
          }
        } else {
          // one-off item (display_name)
          if (copyIncludeOneOffs) {
            try {
              // derive category id and member assignments from source item if present
              const srcCategoryId = srcItem.category && srcItem.category.id ? srcItem.category.id : (srcItem.master_category_id || srcItem.category_id || undefined);
              const srcMemberIds = Array.isArray(srcItem.members) ? srcItem.members.map((m: any) => m.id).filter(Boolean) : undefined;
              const srcWholeFamily = !!(srcItem.whole_family || srcItem.wholeFamily);
              await addItemToPackingList(newList.id, undefined, srcItem.display_name || srcItem.name || srcItem.displayName, srcCategoryId, srcMemberIds, srcWholeFamily);
            } catch (err) {
              console.error('Failed to add one-off item to copy', srcItem.display_name, err);
            }
          }
        }
      }

      showNotification({ title: 'Created', message: 'List copied', color: 'green' });
      setShowCopyDrawer(false);
      setCopySourceList(null);
      setCopySourceItems([]);
      setCopySourceTemplateIds([]);
      setCopyName('');
      try { await reload(); } catch {}
      try { if (requestOpenEdit) requestOpenEdit(newList.id); } catch {}
    } catch (err) {
      console.error('Copy failed', err);
      showNotification({ title: 'Error', message: String(err), color: 'red' });
    } finally {
      setCopyLoading(false);
    }
  };

  const openEditItemDrawerFor = (it: any) => {
    // If editing a one-off packing-list item, allow opening the drawer in promote mode (so user can promote to master)
    setEditTargetItem(it);
    setShowEditItemDrawer(true);
  };

  const handleItemSaved = async (payload?: { name?: string }) => {
    try {
      if (editListId) await openEditFor({ id: editListId, name: editListName });
      await reload();
      if (payload?.name && editTargetItem) setEditTargetItem({ ...editTargetItem, name: payload.name });
    } catch (err) {
      // ignore
    }
  };

  // Note: single-use "apply template" remains available via direct API call if needed.

  const openAddItemsPane = async () => {
    if (!familyId) return;
    setShowAddPane(true);
    try {
      const res = await getItems(familyId);
      if (!res.response.ok) return;
      const items = res.data.items || [];
      // exclude items already on the edit list (by itemId)
      const existingMasterIds = new Set(editItems.map(e => e.itemId).filter(Boolean));
      const available = items.filter((it: any) => !existingMasterIds.has(it.id));
      setAllItems(available);
      setSelectedToAdd([]);
    } catch (err) {
      console.error('Failed to load items', err);
    }
  };

  const applyAddItems = async () => {
    if (!editListId) return;
    if (selectedToAdd.length === 0) {
      setShowAddPane(false);
      return;
    }
      setAddingLoading(true);
    try {
      await Promise.all(selectedToAdd.map(id => addItemToPackingList(editListId, id)));
      showNotification({ title: 'Added', message: 'Items added to list', color: 'green' });
      // refresh modal items
      if (editListId) await openEditFor({ id: editListId, name: editListName });
      await reload();
      setShowAddPane(false);
      setSelectedToAdd([]);
    } catch (err) {
      console.error(err);
      showNotification({ title: 'Error', message: String(err), color: 'red' });
    } finally {
      setAddingLoading(false);
    }
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Title order={4}>Manage Packing Lists</Title>
      <Stack mt="sm">
          {lists.length === 0 ? (
          <Text c="dimmed">No packing lists yet</Text>
        ) : (
          lists.map(l => (
            <Group key={l.id} align="center" style={{ justifyContent: 'space-between' }}>
              <Text>{l.name}</Text>
              <Group>
                <Button size="xs" onClick={() => openEditFor(l)}>Edit</Button>
                <Button size="xs" onClick={() => openCopyFor(l)}>Copy</Button>
                <Button size="xs" color="red" onClick={() => doDelete(l.id)}>Delete</Button>
                {/* Promote One-off button removed; promotion will be implemented later */}
              </Group>
            </Group>
          ))
        )}
      </Stack>

      {/* Rename modal removed - rename is now available inside the Edit modal */}

      {/* Promote modal removed */}

      {/* Main edit drawer is now provided globally via GlobalListEditDrawer; avoid rendering it here. */}

      {/* Nested Drawer for managing template assignments */}
      <Drawer opened={showTemplateAssignDrawer} onClose={() => setShowTemplateAssignDrawer(false)} title="Manage Item Group Assignments" position="right" size={isMobile ? '80%' : 420} padding="md" zIndex={2200}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ marginBottom: 8 }}>
            <Text mb="xs">Assigned item groups</Text>
            <MultiSelect
              data={templates.map(t => ({ value: t.id, label: t.name }))}
              value={editAssignedTemplates}
              onChange={(vals) => setEditAssignedTemplates(vals)}
              placeholder="Select item groups to assign..."
              searchable
              styles={{ dropdown: { zIndex: 2300 } }}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <Button variant="default" onClick={() => setShowTemplateAssignDrawer(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!editListId) return;
              setEditLoading(true);
              try {
                const serverRes = await getPackingList(editListId);
                const serverTemplateIds: string[] = serverRes.response.ok ? (Array.isArray(serverRes.data.template_ids) ? serverRes.data.template_ids : []) : [];
                const removed = serverTemplateIds.filter(tid => !editAssignedTemplates.includes(tid));
                let removeItemsForRemovedTemplates = false;
                if (removed.length > 0) {
                  removeItemsForRemovedTemplates = confirm('You removed one or more item groups. Remove items that were added solely because of those item groups?');
                }
                const payload: any = { templateIds: editAssignedTemplates };
                if (removeItemsForRemovedTemplates) payload.removeItemsForRemovedTemplates = true;
                const res = await updatePackingList(editListId, payload);
                if (res.response.ok) {
                  showNotification({ title: 'Saved', message: 'Item group assignments saved', color: 'green' });
                  await reload();
                  if (editListId) await openEditFor({ id: editListId, name: editListName });
                  setShowTemplateAssignDrawer(false);
                } else {
                  showNotification({ title: 'Failed', message: 'Could not save item group assignments', color: 'red' });
                }
              } catch (err) {
                console.error('Failed to save template assignments', err);
                showNotification({ title: 'Failed', message: 'Could not save template assignments', color: 'red' });
              } finally {
                setEditLoading(false);
              }
            }}>Save Assignments</Button>
          </div>
        </div>
      </Drawer>

      {/* Copy Drawer */}
      <Drawer
        opened={showCopyDrawer}
        onClose={() => { setShowCopyDrawer(false); setCopySourceList(null); }}
        title={`Copy Packing List`}
        position="right"
        size={isMobile ? '80%' : 420}
        padding="md"
        zIndex={2200}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ marginBottom: 8 }}>
            <Text mb="xs">New list name</Text>
            <TextInput value={copyName} onChange={(e) => setCopyName(e.currentTarget.value)} placeholder="New list name" />
          </div>
          <div style={{ marginBottom: 8 }}>
            <Checkbox label="Include one-off items" checked={copyIncludeOneOffs} onChange={(e) => setCopyIncludeOneOffs(e.currentTarget.checked)} />
            <Text size="xs" c="dimmed" mt="xs">If unchecked, only items that reference master items and templates will be copied.</Text>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <Button variant="default" onClick={() => setShowCopyDrawer(false)} disabled={copyLoading}>Cancel</Button>
            <Button onClick={createCopy} loading={copyLoading}>Create New List</Button>
          </div>
        </div>
      </Drawer>

      {/* Nested Drawer for Add Items pane */}
      <Drawer opened={showAddPane} onClose={() => setShowAddPane(false)} position="right" size={isMobile ? '80%' : 420} padding="md" zIndex={2100}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text fw={700}>Add Items</Text>
            <Group>
              <Button variant="default" size="xs" onClick={() => setShowAddPane(false)}>Cancel</Button>
              <Button size="xs" onClick={() => {
                // Open ItemEditDrawer in create mode for a one-off item
                setEditTargetItem({ itemId: null, name: '' });
                // defaultAssignedMember left undefined; caller can set to null for whole-family if needed
                setItemDrawerDefaultMember(undefined);
                setShowEditItemDrawer(true);
              }}>New Item</Button>
              <Button size="xs" onClick={applyAddItems} loading={addingLoading}>Apply</Button>
            </Group>
          </div>
          <div style={{ overflow: 'auto' }}>
            {allItems.length === 0 ? (
              <Text c="dimmed">No additional items available</Text>
            ) : (
              <div>
                {allItems.map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Checkbox checked={selectedToAdd.includes(it.id)} onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setSelectedToAdd(prev => checked ? [...prev, it.id] : prev.filter(x => x !== it.id));
                      }} />
                      <div>
                        <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</Text>
                        <Text size="xs" c="dimmed">{it.description || ''}</Text>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Drawer>
      {/* Add items pane inside the modal - simple responsive overlay */}
      {showAddPane && (
        <div style={{ position: 'fixed', top: 80, right: 40, bottom: 80, width: isMobile ? '90%' : 420, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, zIndex: 2000, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
            <Text fw={700}>Add Items</Text>
            <Group>
              <Button variant="default" size="xs" onClick={() => setShowAddPane(false)}>Cancel</Button>
              <Button size="xs" onClick={applyAddItems} loading={addingLoading}>Apply</Button>
            </Group>
          </div>
          <div style={{ padding: 12, height: '100%', overflow: 'auto' }}>
            {allItems.length === 0 ? (
              <Text c="dimmed">No additional items available</Text>
            ) : (
              <div>
                {allItems.map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Checkbox checked={selectedToAdd.includes(it.id)} onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setSelectedToAdd(prev => checked ? [...prev, it.id] : prev.filter(x => x !== it.id));
                      }} />
                      <div>
                        <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</Text>
                        <Text size="xs" c="dimmed">{it.description || ''}</Text>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      <ItemEditDrawer
        opened={showEditItemDrawer}
        onClose={() => { setShowEditItemDrawer(false); setEditTargetItem(null); setItemDrawerDefaultMember(undefined); }}
        masterItemId={editTargetItem?.itemId}
        initialName={editTargetItem?.name}
        familyId={familyId}
  // Show the name input when creating a new item (editTargetItem exists and has no itemId)
  // The name field is now always shown by the ItemEditDrawer.
  defaultAssignedMemberId={itemDrawerDefaultMember}
  zIndex={3000}
  // Preselect category when editing a packing-list item (use category if present)
  initialCategoryId={editTargetItem && editTargetItem.category ? editTargetItem.category.id : undefined}
  // Preselect member assignments and whole-family flag from the packing-list item
  initialMembers={editTargetItem && Array.isArray(editTargetItem.members) ? editTargetItem.members.map((m: any) => m.id) : undefined}
  initialWhole={!!(editTargetItem && editTargetItem.whole_family)}
        onSaved={async (payload) => {
          // When a new master item is created from the add-items pane, refresh the available items list so it can be added
          try {
            // If an item was created and we're editing a packing list from the Add Items pane,
            // add the created item to that packing list so it appears in the modal immediately.
                if (payload && (payload as any).id && showAddPane && editListId) {
              try {
                await addItemToPackingList(editListId, (payload as any).id);
                showNotification({ title: 'Added', message: 'New item added to the packing list', color: 'green' });
              } catch (addErr) {
                console.error('Failed to auto-add created item to packing list', addErr);
                // continue to refresh available items even if auto-add failed
              }
            }
            if (showAddPane && familyId) {
              const res = await getItems(familyId);
              if (res.response.ok) setAllItems((res.data.items || []).filter((it: any) => !new Set(editItems.map(e => e.itemId).filter(Boolean)).has(it.id)));
            }
          } catch (e) {
            // ignore
          }
          if (handleItemSaved) await handleItemSaved(payload as any);
        }}
        showIsOneOffCheckbox={true}
        promoteContext={editTargetItem && !editTargetItem.itemId ? { listId: editListId || '', packingListItemId: editTargetItem.id } : null}
      />
    </Card>
  );
}
