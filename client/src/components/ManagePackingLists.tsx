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
import { useImpersonation } from '../contexts/ImpersonationContext';
import { showNotification } from '@mantine/notifications';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import ItemEditDrawer from './ItemEditDrawer';
import AddItemsDrawer from './AddItemsDrawer';
export default function ManagePackingLists() {
  const [familyId, setFamilyId] = useState<string | null>(null);
  const { impersonatingFamilyId } = useImpersonation();
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
  const [templateSelections, setTemplateSelections] = useState<string[]>([]);
  
  const [editAssignedTemplates, setEditAssignedTemplates] = useState<string[]>([]);
  const [showAddPane, setShowAddPane] = useState(false);
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

  const { availableLists, refreshLists } = useActivePackingList();

  // Keep local lists in sync with the provider's available lists (which
  // already prefer impersonation). Trigger a refresh on mount or when
  // impersonation changes so the provider can fetch the correct lists.
  useEffect(() => {
    (async () => {
      try {
        await refreshLists();
      } catch (e) {
        // ignore
      }
    })();
  }, [impersonatingFamilyId]);

  // sync local display lists whenever the provider updates
  useEffect(() => {
    setLists(availableLists || []);
  }, [availableLists]);

  // Keep a local familyId (used for creating/copying lists) in sync with
  // impersonation / profile fallback.
  useEffect(() => {
    (async () => {
      // Do not fall back to the current user's profile when impersonation is active.
      let fid: string | null = null;
      if (impersonatingFamilyId) {
        fid = impersonatingFamilyId;
      } else {
        try {
          const profile = await getCurrentUserProfile();
          fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
        } catch (e) {
          fid = null;
        }
      }
      setFamilyId(fid);
      // Load templates for this family so the assignments drawer can show them
      try {
        if (fid) {
          const tRes = await getTemplates(fid);
          if (tRes.response && tRes.response.ok) {
            setTemplates(tRes.data?.templates || []);
          } else {
            setTemplates([]);
          }
        } else {
          setTemplates([]);
        }
      } catch (e) {
        setTemplates([]);
      }
    })();
  }, [impersonatingFamilyId]);

  // react-centric: open edit modal if the context has requested it
  // (we rely on availableLists having been loaded via reload)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 600);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { pendingOpenEditId, clearPendingOpenEdit, requestOpenEdit } = useActivePackingList();

  useEffect(() => {
    if (pendingOpenEditId) {
      (async () => {
        // reload may return the fetched lists directly (improved provider)
        const fetched = await refreshLists();
        const source = Array.isArray(fetched) ? fetched : (availableLists || []);
        const l = source.find((x: any) => x.id === pendingOpenEditId);
        if (l) {
          openEditFor(l);
          clearPendingOpenEdit && clearPendingOpenEdit();
        }
      })();
    }
  }, [pendingOpenEditId, familyId]);

  const reload = async () => {
    // ask the shared provider to refresh lists for the active family
    try {
      await refreshLists();
    } catch (e) {
      // ignore
    }
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
  // server returns items with members, category (single object) and template_ids
      const listItems = res.data.items || [];
      // Normalize server-provided packing-list rows to include camelCase aliases
      // so existing UI code can rely on itemId and oneOff properties.
      const normalized = (listItems || []).map((it: any) => ({
        ...it,
        itemId: it.item_id,
        oneOff: !!it.master_is_one_off,
      }));
      setEditItems(normalized);
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
    // Open the shared AddItemsDrawer which will fetch items itself.
    setShowAddPane(true);
  };

  // apply logic handled by AddItemsDrawer via the onApply prop below

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
                  <IconEdit size={16} />
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
                  <Button onClick={() => { setTemplateSelections(editAssignedTemplates ? [...editAssignedTemplates] : []); setShowTemplateAssignDrawer(true); }} size="xs">Manage Item Group Assignments</Button>
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
                  (() => {
                  const groups: Record<string, any[]> = {};
                  for (const it of editItems) {
                    const catName = it.category && it.category.name ? it.category.name : 'Uncategorized';
                    // Robust one-off detection: server and client may provide multiple field names
                    const isOneOff = (() => {
                      if (typeof it.master_is_one_off !== 'undefined') return !!it.master_is_one_off;
                      if (typeof it.masterIsOneOff !== 'undefined') return !!it.masterIsOneOff;
                      if (typeof it.oneOff !== 'undefined') return !!it.oneOff;
                      if (typeof it.added_during_packing !== 'undefined') return !!it.added_during_packing;
                      if (typeof it.addedDuringPacking !== 'undefined') return !!it.addedDuringPacking;
                      // If no explicit flags, treat rows without a master/item id as one-offs
                      const mid = it.item_id || it.master_id || it.itemId || it.masterId;
                      return !mid;
                    })();
                    const cat = isOneOff ? 'One-off' : catName;
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
                                          <Tooltip label="From item group" withArrow>
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
      <Drawer opened={showTemplateAssignDrawer} onClose={() => setShowTemplateAssignDrawer(false)} title="Manage Item Group Assignments" position="right" size={isMobile ? '80%' : 420} padding="md" zIndex={2200}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ marginBottom: 8 }}>
            <Text mb="xs">Assigned item groups</Text>
            <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid rgba(0,0,0,0.04)', borderRadius: 6, padding: 8 }}>
              {templates.length === 0 ? (
                <Text c="dimmed" size="sm">No item groups</Text>
              ) : (
                templates.map(t => {
                  const checked = templateSelections.includes(t.id);
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid rgba(0,0,0,0.02)' }}>
                      <input type="checkbox" checked={checked} onChange={(e) => {
                        const next = e.currentTarget.checked ? [...templateSelections, t.id] : templateSelections.filter(id => id !== t.id);
                        setTemplateSelections(next);
                      }} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 14 }}>{t.name}</div>
                        {t.description ? <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>{t.description}</div> : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <Button variant="default" onClick={() => setShowTemplateAssignDrawer(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!editListId) return;
              setEditLoading(true);
              try {
                const serverRes = await getPackingList(editListId);
                const serverTemplateIds: string[] = serverRes.response.ok ? (Array.isArray(serverRes.data.template_ids) ? serverRes.data.template_ids : []) : [];
                const removed = serverTemplateIds.filter(tid => !templateSelections.includes(tid));
                let removeItemsForRemovedTemplates = false;
                if (removed.length > 0) {
                  removeItemsForRemovedTemplates = confirm('You removed one or more item groups. Remove items that were added solely because of those item groups?');
                }
                // If user removed templates we ask whether to also remove items that
                // were added solely because of those templates. If the user cancels
                // that confirmation, abort the save and revert the temporary
                // selections back to the server-provided template set so nothing
                // is changed.
                if (removed.length > 0) {
                  const keepGoing = removeItemsForRemovedTemplates;
                  if (!keepGoing) {
                    // User cancelled the confirmation -> revert selections and abort
                    setTemplateSelections(Array.isArray(serverTemplateIds) ? [...serverTemplateIds] : []);
                    showNotification({ title: 'Cancelled', message: 'No changes were saved', color: 'gray' });
                    setEditLoading(false);
                    return;
                  }
                }

                const payload: any = { templateIds: templateSelections };
                if (removeItemsForRemovedTemplates) payload.removeItemsForRemovedTemplates = true;
                const res = await updatePackingList(editListId, payload);
                if (res.response.ok) {
                  showNotification({ title: 'Saved', message: 'Item group assignments saved', color: 'green' });
                  // Apply the confirmed selections locally so the UI reflects the saved assignments
                  setEditAssignedTemplates([...templateSelections]);
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
      <AddItemsDrawer
        opened={showAddPane}
        onClose={() => setShowAddPane(false)}
        familyId={familyId}
        // Exclude items already on the current packing list
        excludedItemIds={(editItems || []).map(i => i.itemId).filter(Boolean)}
        onApply={async (ids: string[]) => {
          if (!editListId) return;
          try {
            for (const id of ids) {
              await addItemToPackingList(editListId, id);
            }
            showNotification({ title: 'Added', message: 'Items added to list', color: 'green' });
            if (editListId) await openEditFor({ id: editListId, name: editListName });
            await reload();
            setShowAddPane(false);
          } catch (err) {
            console.error('Failed to add items from AddItemsDrawer', err);
            showNotification({ title: 'Error', message: 'Failed to add items', color: 'red' });
          }
        }}
        title="Add Items"
        showIsOneOffCheckbox={true}
        autoApplyOnCreate={false}
      />
      
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
          // When a new master item is created from ItemEditDrawer while AddItemsDrawer is open,
          // AddItemsDrawer's auto-select/auto-apply (autoApplyOnCreate) will handle adding if desired.
          // Here we refresh the edit modal and call shared handler to update list UI.
          try {
            if (editListId) await openEditFor({ id: editListId, name: editListName });
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
