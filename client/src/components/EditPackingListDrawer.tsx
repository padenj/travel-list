import React, { useEffect, useState } from 'react';
import { Drawer, Group, Button, Text, Stack, ActionIcon, TextInput, Badge } from '@mantine/core';
import { IconEdit, IconX, IconLayersOff } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import ItemEditDrawer from './ItemEditDrawer';
import AddItemsDrawer from './AddItemsDrawer';
import { getPackingList, deletePackingListItem, addItemToPackingList, getTemplates, updatePackingList } from '../api';

interface Props {
  opened: boolean;
  onClose: () => void;
  listId: string | null;
  initialName?: string;
  familyId?: string | null;
  onRefresh?: () => void;
}

export default function EditPackingListDrawer({ opened, onClose, listId, initialName, familyId, onRefresh }: Props) {
  const [editListId, setEditListId] = useState<string | null>(listId);
  const [editListName, setEditListName] = useState<string>(initialName || '');
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [showTemplateAssignDrawer, setShowTemplateAssignDrawer] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [editAssignedTemplates, setEditAssignedTemplates] = useState<string[]>([]);

  // Item edit drawer state
  const [showEditItemDrawer, setShowEditItemDrawer] = useState(false);
  const [editTargetItem, setEditTargetItem] = useState<any | null>(null);
  const [itemDrawerDefaultMember, setItemDrawerDefaultMember] = useState<string | null | undefined>(undefined);

  // Add items pane
  const [showAddPane, setShowAddPane] = useState(false);

  useEffect(() => {
    setEditListId(listId);
    setEditListName(initialName || '');
  }, [listId, initialName]);

  useEffect(() => {
    (async () => {
      if (!editListId) return;
      setEditLoading(true);
      try {
        const res = await getPackingList(editListId);
        if (!res.response.ok) {
          setEditItems([]);
          return;
        }
        const listItems = res.data.items || [];
        const normalized = (listItems || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off }));
        setEditItems(normalized);
        const assigned = Array.isArray(res.data.template_ids) ? res.data.template_ids : (Array.isArray(res.data.templates) ? res.data.templates.map((t: any) => t.id) : []);
        setEditAssignedTemplates(assigned || []);
      } catch (err) {
        console.error(err);
        setEditItems([]);
      } finally {
        setEditLoading(false);
      }
    })();
  }, [editListId]);

  useEffect(() => {
    (async () => {
      if (!familyId) return;
      try {
        const tRes = await getTemplates(familyId);
        if (tRes.response && tRes.response.ok) setTemplates(tRes.data?.templates || []);
      } catch (e) {
        setTemplates([]);
      }
    })();
  }, [familyId]);

  const openEditFor = async (id?: string) => {
    if (!id) return;
    setEditListId(id);
  };

  const openEditItemDrawerFor = (it: any) => {
    setEditTargetItem(it);
    setShowEditItemDrawer(true);
  };

  const handleItemSaved = async (payload?: { name?: string }) => {
    try {
      if (editListId) {
        await openEditFor(editListId);
      }
      if (onRefresh) onRefresh();
      if (payload?.name && editTargetItem) setEditTargetItem({ ...editTargetItem, name: payload.name });
    } catch (err) {
      // ignore
    }
  };

  const handleAddItems = async (ids: string[], keepOpen?: boolean) => {
    if (!editListId) return;
    try {
      const ops = ids.map(id => addItemToPackingList(editListId!, id));
      const results = await Promise.all(ops);
      const failed = results.filter(r => !(r && r.response && r.response.ok));
      if (failed.length > 0) {
        showNotification({ title: 'Partial failure', message: `${failed.length} of ${results.length} items failed to add`, color: 'yellow' });
      } else {
        showNotification({ title: 'Added', message: `${results.length} items added`, color: 'green' });
      }
      if (editListId) {
        const res = await getPackingList(editListId);
        if (res.response.ok) {
          const listItems = res.data.items || [];
          const normalized = (listItems || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off }));
          setEditItems(normalized);
          try {
            // Notify other UI that the packing list changed
            window.dispatchEvent(new CustomEvent('server-event', { detail: { type: 'packing_list_changed', listId: editListId } }));
          } catch (e) { /* ignore */ }
        }
      }
      if (onRefresh) onRefresh();
      // Close the AddItemsDrawer unless the caller requested it to remain open
      if (!keepOpen) setShowAddPane(false);
            window.dispatchEvent(new CustomEvent('server-event', { detail: { type: 'packing_list_changed', listId: editListId } }));
          } catch (e) { /* ignore */ }
        }
      }
      if (onRefresh) onRefresh();

  // Listen for server-event messages while this drawer is open so we can refresh
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const event = ev.detail || ev;
        if (!event || event.type !== 'packing_list_changed') return;
        if (!editListId) return;
        if (event.listId === editListId) {
          // re-fetch the current list items
          (async () => {
            try {
              const r = await getPackingList(editListId);
              if (r.response && r.response.ok) {
                const listItems = r.data.items || [];
                const normalized = (listItems || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off }));
                setEditItems(normalized);
              }
            } catch (e) { /* ignore */ }
          })();
        }
      } catch (e) {}
    };
    window.addEventListener('server-event', handler as EventListener);
    return () => window.removeEventListener('server-event', handler as EventListener);
  }, [editListId]);
      setShowAddPane(false);
    } catch (err) {
      console.error('Failed to add items from EditPackingListDrawer', err);
      showNotification({ title: 'Error', message: 'Failed to add items', color: 'red' });
    }
  };

  const removeItem = async (pliId: string) => {
    if (!editListId) return;
    try {
      // Optimistically remove from local UI so the user sees immediate feedback.
      // Match across several possible id fields in case the item object uses a different id key.
      setEditItems(prev => {
        const next = prev.filter(i => {
          const candidates = [i.id, (i as any).itemId, (i as any).item_id, (i as any).master_id, (i as any).masterId];
          return !candidates.some(c => c === pliId || String(c) === String(pliId));
        });
        
        return next;
      });

      const res = await deletePackingListItem(editListId, pliId);
      if (res.response && res.response.ok) {
        showNotification({ title: 'Removed', message: 'Item removed from list', color: 'green' });
        // Re-fetch canonical list to ensure we are in sync with the server
        try {
          const r = await getPackingList(editListId);
          if (r.response && r.response.ok) {
            const listItems = r.data.items || [];
            const normalized = (listItems || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off }));
            setEditItems(normalized);
            
          }
        } catch (e) {
          // ignore fetch errors — we've already optimistically removed the item
        }
        if (onRefresh) onRefresh();
      } else {
        // deletion failed server-side; re-fetch to restore UI
        showNotification({ title: 'Error', message: 'Failed to remove item', color: 'red' });
        try {
          const r = await getPackingList(editListId);
          if (r.response && r.response.ok) setEditItems(r.data.items || []);
        } catch (e) {
          // swallow
        }
      }
    } catch (err) {
      console.error('Failed to remove item', err);
      showNotification({ title: 'Error', message: 'Failed to remove item', color: 'red' });
      // attempt to re-sync
      try {
        const r = await getPackingList(editListId);
        if (r.response && r.response.ok) setEditItems(r.data.items || []);
      } catch (e) {
        // swallow
      }
    }
  };

  return (
    <Drawer opened={opened} onClose={onClose} title={`Edit Packing List`} position="right" size="720" padding="md">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Group style={{ marginBottom: 8, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text fw={700} style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{editListName}</Text>
            <ActionIcon onClick={() => { setEditListName(editListName); }} size="md">
              <IconEdit size={16} />
            </ActionIcon>
          </div>
        </Group>

        <div style={{ width: '100%', background: '#f5f5f7', padding: 12, borderRadius: 6, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
            <Button onClick={() => { setEditAssignedTemplates(editAssignedTemplates ? [...editAssignedTemplates] : []); setShowTemplateAssignDrawer(true); }} size="xs">Manage Item Group Assignments</Button>
            <Button onClick={() => setShowAddPane(true)} disabled={editLoading} size="xs">Add Items</Button>
          </div>
          <div />
        </div>

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
                const isOneOff = (() => {
                  if (typeof it.master_is_one_off !== 'undefined') return !!it.master_is_one_off;
                  if (typeof it.masterIsOneOff !== 'undefined') return !!it.masterIsOneOff;
                  if (typeof it.oneOff !== 'undefined') return !!it.oneOff;
                  if (typeof it.added_during_packing !== 'undefined') return !!it.added_during_packing;
                  if (typeof it.addedDuringPacking !== 'undefined') return !!it.addedDuringPacking;
                  const mid = it.item_id || it.master_id || it.itemId || it.masterId;
                  return !mid;
                })();
                const cat = isOneOff ? 'One-off' : catName;
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(it);
              }
              return Object.keys(groups).slice().sort((a, b) => (a || '').localeCompare(b || '')).map(cat => (
                <div key={cat} style={{ marginBottom: 8 }}>
                  <Text fw={700} size="sm" style={{ margin: '8px 0' }}>{cat}</Text>
                  <div>
                    {( (groups[cat] || []).slice().sort((x: any, y: any) => ((x.name || '')).localeCompare((y.name || ''))) ).map((it: any) => (
                      <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                            <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {it.name}
                              <Text component="span" size="xs" c="dimmed">{` - ${it.whole_family ? 'Whole Family' : (it.members && it.members.length > 0 ? it.members.map((m: any) => m.name || m.username).join(', ') : 'Unassigned')}`}</Text>
                            </Text>
                          </div>
                          {it.oneOff ? <Badge color="gray" size="xs">One-off</Badge> : null}
                          {Array.isArray(it.template_ids) && it.template_ids.length > 0 ? (
                            <ActionIcon size="xs" variant="transparent"><IconLayersOff size={14} /></ActionIcon>
                          ) : null}
                        </div>
                        <div style={{ flex: '0 0 auto', marginLeft: 12 }}>
                          <Group>
                            <Button size="xs" variant="subtle" onClick={() => openEditItemDrawerFor(it)}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconEdit size={14} />Edit</span>
                            </Button>
                            <Button size="xs" color="red" variant="subtle" onClick={async () => {
                              if (!confirm('Remove this item from the packing list?')) return;
                              if (!editListId) return;
                              await removeItem(it.id);
                            }}>Remove</Button>
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

      </div>

      {/* Nested Drawer for managing template assignments */}
      <Drawer opened={showTemplateAssignDrawer} onClose={() => setShowTemplateAssignDrawer(false)} title="Manage Item Group Assignments" position="right" size={420} padding="md" zIndex={2200}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ marginBottom: 8 }}>
            <Text mb="xs">Assigned item groups</Text>
            <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid rgba(0,0,0,0.04)', borderRadius: 6, padding: 8 }}>
              {templates.length === 0 ? (
                <Text c="dimmed" size="sm">No item groups</Text>
              ) : (
                templates.map(t => {
                  const checked = editAssignedTemplates.includes(t.id);
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid rgba(0,0,0,0.02)' }}>
                    <input type="checkbox" checked={checked} onChange={(e) => {
                      const next = e.currentTarget.checked ? [...editAssignedTemplates, t.id] : editAssignedTemplates.filter(id => id !== t.id);
                      setEditAssignedTemplates(next);
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
                const removed = serverTemplateIds.filter(tid => !editAssignedTemplates.includes(tid));
                let removeItemsForRemovedTemplates = false;
                if (removed.length > 0) {
                  removeItemsForRemovedTemplates = confirm('You removed one or more item groups. Remove items that were added solely because of those item groups?');
                }
                if (removed.length > 0) {
                  const keepGoing = removeItemsForRemovedTemplates;
                  if (!keepGoing) {
                    setEditAssignedTemplates(Array.isArray(serverTemplateIds) ? [...serverTemplateIds] : []);
                    showNotification({ title: 'Cancelled', message: 'No changes were saved', color: 'gray' });
                    setEditLoading(false);
                    return;
                  }
                }

                const payload: any = { templateIds: editAssignedTemplates };
                if (removeItemsForRemovedTemplates) payload.removeItemsForRemovedTemplates = true;
                const res = await updatePackingList(editListId, payload);
                if (res.response.ok) {
                  showNotification({ title: 'Saved', message: 'Item group assignments saved', color: 'green' });
                  if (onRefresh) onRefresh();
                  if (editListId) {
                    const r = await getPackingList(editListId);
                    if (r.response.ok) setEditItems(r.data.items || []);
                  }
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

      {/* Add Items Drawer for this edit modal */}
      <AddItemsDrawer
        opened={showAddPane}
        onClose={() => setShowAddPane(false)}
        familyId={familyId}
        // Exclude items already on the current packing list
        excludedItemIds={(editItems || []).map(i => i.itemId).filter(Boolean)}
        onApply={handleAddItems}
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
        defaultAssignedMemberId={itemDrawerDefaultMember}
        zIndex={3000}
        initialCategoryId={editTargetItem && editTargetItem.category ? editTargetItem.category.id : undefined}
        initialMembers={editTargetItem && Array.isArray(editTargetItem.members) ? editTargetItem.members.map((m: any) => m.id) : undefined}
        initialWhole={!!(editTargetItem && editTargetItem.whole_family)}
        onSaved={async (payload) => {
          try {
            if (editListId) await openEditFor(editListId);
          } catch (e) {}
          if (handleItemSaved) await handleItemSaved(payload as any);
        }}
        showIsOneOffCheckbox={true}
        promoteContext={editTargetItem && !editTargetItem.itemId ? { listId: editListId || '', packingListItemId: editTargetItem.id } : null}
      />
    </Drawer>
  );
}