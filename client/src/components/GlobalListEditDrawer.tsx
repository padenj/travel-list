import React, { useEffect, useState, useRef } from 'react';
import { Drawer, Group, Text, ActionIcon, Button, Tooltip, Checkbox, Modal, Badge } from '@mantine/core';
import { IconEdit, IconLayersOff, IconCheck } from '@tabler/icons-react';
import { useListEditDrawer } from '../contexts/ListEditDrawerContext';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import { getPackingList, updatePackingList, deletePackingListItem, getTemplates, addItemToPackingList, getCurrentUserProfile } from '../api';
import { showNotification } from '@mantine/notifications';
import ItemEditDrawer from './ItemEditDrawer';
import AddItemsDrawer from './AddItemsDrawer';

export default function GlobalListEditDrawer() {
  const { isOpen, listId, listName, close, renderFn, openForList } = useListEditDrawer();
  const { pendingOpenEditId, clearPendingOpenEdit } = useActivePackingList();

  const [loading, setLoading] = useState(false);
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [editAssignedTemplates, setEditAssignedTemplates] = useState<string[]>([]);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [savingMembers, setSavingMembers] = useState(false);
  const [membersSaved, setMembersSaved] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const debounceTimer = useRef<number | null>(null);

  const [showAddPane, setShowAddPane] = useState(false);
  const [addPaneFamilyId, setAddPaneFamilyId] = useState<string | null>(null);
  const [showEditItemDrawer, setShowEditItemDrawer] = useState(false);
  const [editTargetItem, setEditTargetItem] = useState<any | null>(null);
  const [removalConfirmOpen, setRemovalConfirmOpen] = useState(false);
  const [removalLoading, setRemovalLoading] = useState(false);
  const [pendingRemovalTemplateIds, setPendingRemovalTemplateIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!isOpen || !listId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await getPackingList(listId);
        if (!res.response.ok) {
          setCurrentName(listName || null);
          setEditItems([]);
          setEditAssignedTemplates([]);
          return;
        }
        setCurrentName(res.data.name || listName || null);
        setEditItems((res.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off, whole_family: !!it.whole_family })));
        setEditAssignedTemplates(Array.isArray(res.data.template_ids) ? res.data.template_ids : []);
        const memberIds = Array.isArray(res.data.list?.member_ids) ? res.data.list.member_ids : (Array.isArray(res.data.member_ids) ? res.data.member_ids : []);
        setSelectedMemberIds(memberIds || []);

        try {
          const profile = await getCurrentUserProfile();
          const fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
          if (fid) {
            const tRes = await getTemplates(fid);
            if (tRes.response.ok) setTemplates(tRes.data.templates || []);
            if (profile.response.ok && profile.data.family && Array.isArray(profile.data.family.members)) setFamilyMembers(profile.data.family.members || []);
          }
        } catch (e) {
          // ignore
        }
      } catch (err) {
        console.error('Failed to load list for edit drawer', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, listId]);

  useEffect(() => {
    if (pendingOpenEditId) {
      openForList && openForList(pendingOpenEditId, undefined);
      clearPendingOpenEdit && clearPendingOpenEdit();
    }
  }, [pendingOpenEditId]);

  const handleRemoveItem = async (pliId: string) => {
    if (!listId) return;
    if (!confirm('Remove this item from the packing list?')) return;
    setLoading(true);
    try {
      const res = await deletePackingListItem(listId, pliId);
      if (res.response.ok) {
        showNotification({ title: 'Removed', message: 'Item removed from list', color: 'green' });
        const r = await getPackingList(listId);
        if (r.response.ok) setEditItems((r.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off, whole_family: !!it.whole_family })));
      } else {
        showNotification({ title: 'Error', message: 'Failed to remove item', color: 'red' });
      }
    } catch (err) {
      console.error('Failed to remove item', err);
      showNotification({ title: 'Error', message: 'Failed to remove item', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const openAddItemsPane = async () => {
    try {
      const profile = await getCurrentUserProfile();
      const fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
      if (!fid) return;
      setAddPaneFamilyId(fid);
      setShowAddPane(true);
    } catch (err) {
      console.error('Failed to open Add Items pane', err);
    }
  };

  async function handleAddItemsFromDrawer(ids: string[], keepOpen?: boolean) {
    if (!listId || !ids || ids.length === 0) {
      if (!keepOpen) setShowAddPane(false);
      return;
    }
    try {
      await Promise.all(ids.map(id => addItemToPackingList(listId, id)));
      showNotification({ title: 'Added', message: 'Items added to list', color: 'green' });
      const r = await getPackingList(listId);
      if (r.response.ok) setEditItems((r.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off, whole_family: !!it.whole_family })));
      if (!keepOpen) setShowAddPane(false);
    } catch (err) {
      console.error('Failed to add items from AddItemsDrawer', err);
      showNotification({ title: 'Error', message: String(err), color: 'red' });
      if (!keepOpen) setShowAddPane(false);
    }
  }

  const saveMemberSelection = (next: string[]) => {
    if (!listId) return;
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    setMembersSaved(false);
    setSavingMembers(true);
    debounceTimer.current = window.setTimeout(async () => {
      try {
        const res = await updatePackingList(listId || '', { memberIds: next });
        if (res.response && res.response.ok) {
          setMembersSaved(true);
          if (saveTimer.current) window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => setMembersSaved(false), 2500);
        } else {
          showNotification({ title: 'Failed', message: 'Could not save members', color: 'red' });
        }
      } catch (err) {
        console.error('Failed to save members', err);
        showNotification({ title: 'Failed', message: 'Could not save members', color: 'red' });
      } finally {
        setSavingMembers(false);
      }
    }, 500);
  };

  if (renderFn) return <>{isOpen ? renderFn() : null}</>;

  return (
    <>
      <Drawer opened={isOpen} onClose={close} title={`Edit Packing List`} position="right" size={720} padding="md">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Group style={{ marginBottom: 8, gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text fw={700} style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentName || ''}</Text>
              <ActionIcon onClick={() => {}} size="md"><IconEdit size={16} /></ActionIcon>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <Button size="xs" onClick={() => openAddItemsPane()}>Add Items</Button>
            </div>
          </Group>

          <div style={{ paddingTop: 12, flex: 1, overflow: 'auto' }}>
            {editItems.length === 0 ? (
              <Text c="dimmed">No items in this list</Text>
            ) : (
              (() => {
                const groups: Record<string, any[]> = {};
                for (const it of editItems) {
                  const catName = it.category && it.category.name ? it.category.name : 'Uncategorized';
                  const isOneOff = !!(it.master_is_one_off || it.oneOff || it.added_during_packing || it.addedDuringPacking);
                  const cat = isOneOff ? 'One-off' : catName;
                  if (!groups[cat]) groups[cat] = [];
                  groups[cat].push(it);
                }
                return Object.keys(groups).slice().sort((a, b) => (a || '').localeCompare(b || '')).map(cat => (
                  <div key={cat} style={{ marginBottom: 8 }}>
                    <Text fw={700} size="sm" style={{ margin: '8px 0' }}>{cat}</Text>
                    <div>
                      {(groups[cat] || []).slice().sort((x: any, y: any) => ((x.name || '')).localeCompare((y.name || ''))).map((it: any) => (
                        <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                              <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}
                                <Text component="span" size="xs" c="dimmed">{` - ${it.whole_family ? 'Whole Family' : (it.members && it.members.length ? it.members.map((m: any) => m.name || m.username).join(', ') : 'Unassigned')}`}</Text>
                              </Text>
                            </div>
                            {it.oneOff ? <Badge color="gray" size="xs">One-off</Badge> : null}
                            {Array.isArray(it.template_ids) && it.template_ids.length > 0 ? (
                              <Badge color="blue" size="xs" variant="light">
                                {it.template_ids.map((tid: string) => templates.find((t: any) => t.id === tid)?.name || 'Item group').join(', ')}
                              </Badge>
                            ) : null}
                          </div>
                          <div style={{ flex: '0 0 auto', marginLeft: 12 }}>
                            <Group>
                              <Button size="xs" variant="subtle" onClick={() => { setEditTargetItem(it); setShowEditItemDrawer(true); }}>Edit</Button>
                              <Button size="xs" color="red" variant="subtle" onClick={() => handleRemoveItem(it.id)}>Remove</Button>
                            </Group>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: 12, marginTop: 12 }}>
            <div>
              <Text fw={700} size="sm">Auto-add items from the following groups</Text>
              <div style={{ marginTop: 8 }}>
                {templates.length === 0 ? (
                  <Text size="sm" c="dimmed">No item groups available</Text>
                ) : (
                  <div>
                    {templates.map(t => {
                      const checked = editAssignedTemplates.includes(t.id);
                      return (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                          <Checkbox checked={checked} onChange={async (e) => {
                            const on = e.currentTarget.checked;
                            const newTemplateIds = on ? Array.from(new Set([...(editAssignedTemplates || []), t.id])) : (editAssignedTemplates || []).filter(x => x !== t.id);
                            
                            if (!on) {
                              // User is unchecking - ask about item removal
                              setPendingRemovalTemplateIds(newTemplateIds);
                              setEditAssignedTemplates(newTemplateIds); // Optimistic update
                              setRemovalConfirmOpen(true);
                              return;
                            }
                            
                            // User is checking - add template immediately
                            setEditAssignedTemplates(newTemplateIds); // Optimistic update
                            try {
                              const payload: any = { templateIds: newTemplateIds };
                              const res = await updatePackingList(listId || '', payload);
                              if (res.response.ok) {
                                showNotification({ title: 'Saved', message: 'Item group assignments updated', color: 'green' });
                                const r = await getPackingList(listId || '');
                                if (r.response.ok) setEditItems((r.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off, whole_family: !!it.whole_family })));
                              } else {
                                showNotification({ title: 'Failed', message: 'Could not update assignments', color: 'red' });
                                // Revert on failure
                                setEditAssignedTemplates(prev => prev.filter(x => x !== t.id));
                              }
                            } catch (err) {
                              console.error('Failed to update template assignment', err);
                              showNotification({ title: 'Failed', message: 'Could not update assignments', color: 'red' });
                              // Revert on failure
                              setEditAssignedTemplates(prev => prev.filter(x => x !== t.id));
                            }
                          }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Text>{t.name}</Text>
                            <Text size="xs" c="dimmed">{t.description || ''}</Text>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text fw={700} size="sm">List Members</Text>
                <div style={{ marginLeft: 'auto' }}>
                  {savingMembers ? <Text size="xs" c="dimmed">Saving…</Text> : null}
                  {membersSaved ? <IconCheck size={16} color="green" /> : null}
                </div>
              </div>
              <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid rgba(0,0,0,0.04)', borderRadius: 6, padding: 8 }}>
                {familyMembers.length === 0 ? (
                  <Text c="dimmed" size="sm">No family members</Text>
                ) : (
                  familyMembers.map(m => {
                    const checked = selectedMemberIds.includes(m.id);
                    return (
                      <div key={m.id} style={{ padding: '6px 4px', borderBottom: '1px solid rgba(0,0,0,0.02)' }}>
                        <Checkbox
                          checked={checked}
                          onChange={(e) => {
                            const on = (e.currentTarget as HTMLInputElement).checked;
                            const next = on ? Array.from(new Set([...(selectedMemberIds || []), m.id])) : (selectedMemberIds || []).filter(id => id !== m.id);
                            setSelectedMemberIds(next);
                            saveMemberSelection(next);
                          }}
                          label={m.name || m.username}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </Drawer>

      <AddItemsDrawer
        opened={showAddPane}
        onClose={() => { setShowAddPane(false); setAddPaneFamilyId(null); }}
        familyId={addPaneFamilyId}
        excludedItemIds={editItems.map(e => e.itemId).filter(Boolean)}
        onApply={async (ids: string[], keepOpen?: boolean) => {
          await handleAddItemsFromDrawer(ids, keepOpen);
        }}
        title="Add Items"
        showIsOneOffCheckbox={true}
        initialMembers={undefined}
        initialWhole={false}
        targetCategoryId={undefined}
        promoteContext={listId ? { listId: listId, packingListItemId: undefined } : null}
      />

      <ItemEditDrawer
        opened={showEditItemDrawer}
        onClose={() => { setShowEditItemDrawer(false); setEditTargetItem(null); }}
        masterItemId={editTargetItem?.itemId}
        initialName={editTargetItem?.name}
        familyId={undefined}
        defaultAssignedMemberId={undefined}
        zIndex={3000}
        initialCategoryId={editTargetItem && editTargetItem.category ? editTargetItem.category.id : undefined}
        initialMembers={editTargetItem && Array.isArray(editTargetItem.members) ? editTargetItem.members.map((m: any) => m.id) : undefined}
        initialWhole={!!(editTargetItem && editTargetItem.whole_family)}
        onSaved={async (payload) => {
          try {
            if (payload && (payload as any).id && showAddPane && listId) {
              try {
                await handleAddItemsFromDrawer([(payload as any).id], true);
                showNotification({ title: 'Added', message: 'New item added to the packing list', color: 'green' });
              } catch (addErr) { console.error('Failed to auto-add created item', addErr); }
            }
            if (listId) {
              const r = await getPackingList(listId);
              if (r.response.ok) setEditItems((r.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off, whole_family: !!it.whole_family })));
            }
          } catch (e) {}
        }}
        showIsOneOffCheckbox={true}
        promoteContext={editTargetItem && !editTargetItem.itemId ? { listId: listId || '', packingListItemId: editTargetItem.id } : null}
      />

      <Modal opened={removalConfirmOpen} onClose={() => {
        // User closed without choosing - revert template removal
        setRemovalConfirmOpen(false);
        setEditAssignedTemplates(prev => {
          if (!listId) return prev;
          // Revert to server state
          return prev; // Keep current state since we don't have easy access to server state here
        });
        setPendingRemovalTemplateIds(null);
      }} title={'Remove items?'}>
        <div>
          <Text size="sm">Do you also want to remove items that were added solely because of this item group?</Text>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Button variant="default" onClick={async () => {
              // Keep items - just update template assignment
              setRemovalLoading(true);
              try {
                const payload: any = { templateIds: pendingRemovalTemplateIds || [] };
                const res = await updatePackingList(listId || '', payload);
                if (res.response.ok) {
                  showNotification({ title: 'Saved', message: 'Item group removed, items kept', color: 'green' });
                  const r = await getPackingList(listId || '');
                  if (r.response.ok) {
                    setEditItems((r.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off, whole_family: !!it.whole_family })));
                    setEditAssignedTemplates(Array.isArray(r.data.template_ids) ? r.data.template_ids : []);
                  }
                } else {
                  showNotification({ title: 'Failed', message: 'Could not update assignments', color: 'red' });
                }
              } catch (err) {
                console.error('Failed to update template assignment', err);
                showNotification({ title: 'Failed', message: 'Could not update assignments', color: 'red' });
              } finally {
                setRemovalLoading(false);
                setRemovalConfirmOpen(false);
                setPendingRemovalTemplateIds(null);
              }
            }} disabled={removalLoading}>Keep Items</Button>
            <Button color="red" onClick={async () => {
              // Remove items - update template assignment with removeItemsForRemovedTemplates flag
              setRemovalLoading(true);
              try {
                const payload: any = { 
                  templateIds: pendingRemovalTemplateIds || [],
                  removeItemsForRemovedTemplates: true
                };
                const res = await updatePackingList(listId || '', payload);
                if (res.response.ok) {
                  showNotification({ title: 'Saved', message: 'Item group and associated items removed', color: 'green' });
                  const r = await getPackingList(listId || '');
                  if (r.response.ok) {
                    setEditItems((r.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off, whole_family: !!it.whole_family })));
                    setEditAssignedTemplates(Array.isArray(r.data.template_ids) ? r.data.template_ids : []);
                  }
                } else {
                  showNotification({ title: 'Failed', message: 'Could not update assignments', color: 'red' });
                }
              } catch (err) {
                console.error('Failed to update template assignment', err);
                showNotification({ title: 'Failed', message: 'Could not update assignments', color: 'red' });
              } finally {
                setRemovalLoading(false);
                setRemovalConfirmOpen(false);
                setPendingRemovalTemplateIds(null);
              }
            }} loading={removalLoading}>Remove Items</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
