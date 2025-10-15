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
} from '../api';
import { showNotification } from '@mantine/notifications';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import ItemEditDrawer from './ItemEditDrawer';

export default function ManagePackingLists() {
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [lists, setLists] = useState<any[]>([]);
  // selected removed; edit modal holds the current list being edited in editListId
  // promote UI removed for now; will reintroduce promotion logic later
  // edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
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

  const { pendingOpenEditId, clearPendingOpenEdit } = useActivePackingList();

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

  const openEditFor = async (list: any) => {
    setEditListId(list.id);
    setEditListName(list.name || '');
    setShowEditModal(true);
    setEditLoading(true);
    try {
      const res = await getPackingList(list.id);
      if (!res.response.ok) {
        showNotification({ title: 'Error', message: 'Failed to load list items', color: 'red' });
        setEditItems([]);
        return;
      }
      // server returns items with members, categories (array) and template_ids
      const listItems = res.data.items || [];
      setEditItems(listItems);
  // load templates assigned to this packing list (if server provides them)
  const assigned = Array.isArray(res.data.template_ids) ? res.data.template_ids : (Array.isArray(res.data.templates) ? res.data.templates.map((t: any) => t.id) : []);
  setEditAssignedTemplates(assigned || []);
      // we now rely on server-provided category arrays and per-item template_ids
  // rely on server-provided item.categories and item.template_ids
    } catch (err) {
      console.error(err);
      setEditItems([]);
    } finally {
      setEditLoading(false);
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
                <Button size="xs" color="red" onClick={() => doDelete(l.id)}>Delete</Button>
                {/* Promote One-off button removed; promotion will be implemented later */}
              </Group>
            </Group>
          ))
        )}
      </Stack>

      {/* Rename modal removed - rename is now available inside the Edit modal */}

      {/* Promote modal removed */}

  <Drawer opened={showEditModal} onClose={() => setShowEditModal(false)} title={`Edit Packing List`} position="right" size={isMobile ? '100%' : 720} padding="md">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Group style={{ marginBottom: 8, gap: 8 }}>
            {!isEditingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text fw={700} style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{editListName}</Text>
                <ActionIcon onClick={() => { setEditNameDraft(editListName); setIsEditingName(true); }} size="md">
                  <IconEdit size={16} />
                </ActionIcon>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TextInput value={editNameDraft} onChange={(e) => setEditNameDraft(e.currentTarget.value)} style={{ minWidth: 240, maxWidth: '60%' }} />
                <ActionIcon color="green" onClick={doRename}>
                  <IconCheck size={16} />
                </ActionIcon>
                <ActionIcon color="gray" onClick={() => { setEditNameDraft(editListName); setIsEditingName(false); }}>
                  <IconX size={16} />
                </ActionIcon>
              </div>
            )}
          </Group>
          {editLoading ? (
            <div>Loading...</div>
          ) : (
            <>
              {/* controls panel placed between header and items list */}
              <div style={{ width: '100%', background: '#f5f5f7', padding: 12, borderRadius: 6, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                  <Button onClick={() => setShowTemplateAssignDrawer(true)} size="xs">Manage Template Assignments</Button>
                  <Button onClick={openAddItemsPane} disabled={editLoading} size="xs">Add Items</Button>
                </div>
                <div />
              </div>
                  {/* show applied template badges just above the items list */}
                  {editAssignedTemplates.length > 0 && (
                    <Group style={{ gap: 8, marginBottom: 8 }}>
                      {editAssignedTemplates.map(tid => {
                        const t = templates.find(tt => tt.id === tid);
                        return t ? <Badge key={tid}>{t.name}</Badge> : null;
                      })}
                    </Group>
                  )}
                  <div style={{ flex: 1, overflow: 'auto' }}>
                  {editItems.length === 0 ? (
                <Text c="dimmed">No items in this list</Text>
              ) : (
                // group items by first category name (fall back to 'Uncategorized')
                (() => {
                  const groups: Record<string, any[]> = {};
                  for (const it of editItems) {
                    const catName = (it.categories && it.categories.length > 0) ? (it.categories[0].name || 'Uncategorized') : 'Uncategorized';
                    const cat = it.item_id === null ? 'Uncategorized' : catName;
                    if (!groups[cat]) groups[cat] = [];
                    groups[cat].push(it);
                  }
                  // sort categories alphabetically using localeCompare
                  return Object.keys(groups).slice().sort((a, b) => (a || '').localeCompare(b || '')).map(cat => (
                    <div key={cat} style={{ marginBottom: 8 }}>
                      <Text fw={700} size="sm" style={{ margin: '8px 0' }}>{cat}</Text>
                      <div>
                                  {(
                          // sort items within the category alphabetically by name
                          (groups[cat] || []).slice().sort((x: any, y: any) => ((x.name || '')).localeCompare((y.name || '')))
                        ).map((it: any) => {
                          const assignmentText = it.whole_family ? 'Whole Family' : (it.members && it.members.length > 0 ? it.members.map((m: any) => m.name || m.username).join(', ') : 'Unassigned');
                                  const isFromTemplate = Array.isArray(it.template_ids) && it.template_ids.length > 0;
                                  return (
                            <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                                  <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {it.name}
                                    <Text component="span" size="xs" c="dimmed">{` - ${assignmentText}`}</Text>
                                  </Text>
                                </div>
                                        {it.oneOff ? <Badge color="gray" size="xs">One-off</Badge> : null}
                                        {isFromTemplate ? (
                                          <Tooltip label="From template" withArrow>
                                            <ActionIcon size="xs" variant="transparent">
                                                <IconLayersOff size={14} />
                                              </ActionIcon>
                                          </Tooltip>
                                        ) : null}
                              </div>
                              <div style={{ flex: '0 0 auto', marginLeft: 12 }}>
                                <Group>
                                  <Button size="xs" variant="subtle" onClick={() => openEditItemDrawerFor(it)}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconEdit size={14} />Edit</span>
                                  </Button>
                                  <Button size="xs" color="red" variant="subtle" onClick={async () => {
                                    if (!confirm('Remove this item from the packing list?')) return;
                                    try {
                                      if (!editListId) return;
                                      const res = await deletePackingListItem(editListId, it.id);
                                      if (res.response.ok) {
                                        showNotification({ title: 'Removed', message: 'Item removed from list', color: 'green' });
                                        // Refresh modal and list
                                        if (editListId) await openEditFor({ id: editListId, name: editListName });
                                        await reload();
                                      } else {
                                        showNotification({ title: 'Error', message: 'Failed to remove item', color: 'red' });
                                      }
                                    } catch (err) {
                                      console.error('Failed to remove item', err);
                                      showNotification({ title: 'Error', message: 'Failed to remove item', color: 'red' });
                                    }
                                  }}>Remove</Button>
                                </Group>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>
          </>
          )}

        </div>
      </Drawer>

      {/* Nested Drawer for managing template assignments */}
      <Drawer opened={showTemplateAssignDrawer} onClose={() => setShowTemplateAssignDrawer(false)} title="Manage Template Assignments" position="right" size={isMobile ? '80%' : 420} padding="md" zIndex={2200}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ marginBottom: 8 }}>
            <Text mb="xs">Assigned templates</Text>
            <MultiSelect
              data={templates.map(t => ({ value: t.id, label: t.name }))}
              value={editAssignedTemplates}
              onChange={(vals) => setEditAssignedTemplates(vals)}
              placeholder="Select templates to assign..."
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
                  removeItemsForRemovedTemplates = confirm('You removed one or more templates. Remove items that were added solely because of those templates?');
                }
                const payload: any = { templateIds: editAssignedTemplates };
                if (removeItemsForRemovedTemplates) payload.removeItemsForRemovedTemplates = true;
                const res = await updatePackingList(editListId, payload);
                if (res.response.ok) {
                  showNotification({ title: 'Saved', message: 'Template assignments saved', color: 'green' });
                  await reload();
                  if (editListId) await openEditFor({ id: editListId, name: editListName });
                  setShowTemplateAssignDrawer(false);
                } else {
                  showNotification({ title: 'Failed', message: 'Could not save template assignments', color: 'red' });
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
  showNameField={!!(editTargetItem && !editTargetItem.itemId)}
  defaultAssignedMemberId={itemDrawerDefaultMember}
  zIndex={3000}
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
