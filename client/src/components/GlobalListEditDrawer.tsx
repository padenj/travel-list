import React, { useEffect, useState } from 'react';
import { Drawer, Group, Text, ActionIcon, TextInput, Button, Stack, Badge, Tooltip, Checkbox, Modal } from '@mantine/core';
import { IconEdit, IconX, IconLayersOff } from '@tabler/icons-react';
import { useListEditDrawer } from '../contexts/ListEditDrawerContext';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import { getPackingList, updatePackingList, deletePackingListItem, getItems, getTemplates, addItemToPackingList, getCurrentUserProfile } from '../api';
import { showNotification } from '@mantine/notifications';
import ItemEditDrawer from './ItemEditDrawer';
import AddItemsDrawer from './AddItemsDrawer';

export default function GlobalListEditDrawer() {
  const { isOpen, listId, listName, close, renderFn, openForList } = useListEditDrawer();
  const { pendingOpenEditId, clearPendingOpenEdit } = useActivePackingList();
  const [loading, setLoading] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editAssignedTemplates, setEditAssignedTemplates] = useState<string[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [removalConfirm, setRemovalConfirm] = useState<{ open: boolean; templateId?: string; templateName?: string; newTemplateIds?: string[] }>(() => ({ open: false }));
  const [removalLoading, setRemovalLoading] = useState(false);
  const [showAddPane, setShowAddPane] = useState(false);
  const [addPaneFamilyId, setAddPaneFamilyId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [showEditItemDrawer, setShowEditItemDrawer] = useState(false);
  const [editTargetItem, setEditTargetItem] = useState<any | null>(null);
  const [itemDrawerDefaultMember, setItemDrawerDefaultMember] = useState<string | null | undefined>(undefined);

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
        // getPackingList may not include the packing list `name`; if it's missing,
        // fetch family packing lists to locate the human-friendly name.
        const candidateName = res.data.name || listName || null;
        if (candidateName) {
          setCurrentName(candidateName);
        } else {
          // try to look up from family lists
          try {
            const profile = await (await import('../api')).getCurrentUserProfile();
            const fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
            if (fid) {
              const fl = await (await import('../api')).getFamilyPackingLists(fid);
              if (fl.response.ok && Array.isArray(fl.data.lists)) {
                const found = fl.data.lists.find((l: any) => l.id === listId);
                if (found) setCurrentName(found.name || null);
                else setCurrentName(null);
              } else {
                setCurrentName(null);
              }
            } else {
              setCurrentName(null);
            }
          } catch (err) {
            setCurrentName(null);
          }
        }
        const listItems = res.data.items || [];
        const normalized = (listItems || []).map((it: any) => ({
          ...it,
          itemId: it.item_id,
          oneOff: !!it.master_is_one_off,
        }));
        setEditItems(normalized);
        const assigned = Array.isArray(res.data.template_ids) ? res.data.template_ids : (Array.isArray(res.data.templates) ? res.data.templates.map((t: any) => t.id) : []);
        setEditAssignedTemplates(assigned || []);
        try {
          const profile = await getCurrentUserProfile();
          const fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
          if (fid) {
            const tRes = await getTemplates(fid);
            if (tRes.response.ok) setTemplates(tRes.data.templates || []);
          }
        } catch (e) {
          // ignore
        }
      } catch (err) {
        console.error('Failed to load list for edit drawer', err);
        setCurrentName(listName || null);
        setEditItems([]);
        setEditAssignedTemplates([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, listId]);

  useEffect(() => {
    if (pendingOpenEditId) {
      try {
        // open via drawer context
        (async () => {
          openForList && openForList(pendingOpenEditId, undefined);
          clearPendingOpenEdit && clearPendingOpenEdit();
        })();
      } catch (e) {}
    }
  }, [pendingOpenEditId]);

  const doRename = async () => {
    if (!listId || !nameDraft) return;
    setLoading(true);
    try {
      const res = await updatePackingList(listId, { name: nameDraft });
      if (res.response.ok) {
        showNotification({ title: 'Renamed', message: 'List renamed', color: 'green' });
        setCurrentName(nameDraft);
        setNameDraft('');
        // reload items to reflect server canonical state
        try {
          const r = await getPackingList(listId);
          if (r.response.ok) setEditItems((r.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off })));
        } catch (e) {}
      } else {
        showNotification({ title: 'Error', message: 'Failed to rename list', color: 'red' });
      }
    } catch (err) {
      showNotification({ title: 'Error', message: String(err), color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (pliId: string) => {
    if (!listId) return;
    if (!confirm('Remove this item from the packing list?')) return;
    setLoading(true);
    try {
      const res = await deletePackingListItem(listId, pliId);
      if (res.response.ok) {
        showNotification({ title: 'Removed', message: 'Item removed from list', color: 'green' });
        // refresh
        const r = await getPackingList(listId);
        if (r.response.ok) setEditItems((r.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off })));
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

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 600);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const handleAddItemsFromDrawer = async (ids: string[], keepOpen?: boolean) => {
    if (!listId || !ids || ids.length === 0) {
      if (!keepOpen) setShowAddPane(false);
      return;
    }
    try {
      // add each item to the packing list
      await Promise.all(ids.map(id => addItemToPackingList(listId, id)));
      showNotification({ title: 'Added', message: 'Items added to list', color: 'green' });
      // refresh canonical list from server
      const r = await getPackingList(listId);
      if (r.response.ok) setEditItems((r.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off })));
      if (!keepOpen) {
        setShowAddPane(false);
      }
    } catch (err) {
      console.error('Failed to add items from AddItemsDrawer', err);
      showNotification({ title: 'Error', message: String(err), color: 'red' });
      if (!keepOpen) setShowAddPane(false);
    }
  };

  const openEditItemDrawerFor = (it: any) => {
    setEditTargetItem(it);
    setShowEditItemDrawer(true);
  };


  if (renderFn) {
    return <>{isOpen ? renderFn() : null}</>;
  }

  return (
    <>
    <Drawer opened={isOpen} onClose={close} title={`Edit Packing List`} position="right" size={720} padding="md">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Group style={{ marginBottom: 8, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text fw={700} style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentName || ''}</Text>
            <ActionIcon onClick={() => { setNameDraft(currentName || ''); }} size="md">
              <IconEdit size={16} />
            </ActionIcon>
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
                    {(groups[cat] || []).slice().sort((x: any, y: any) => ((x.name || '')).localeCompare((y.name || ''))).map((it: any) => {
                      const assignmentText = it.whole_family ? 'Whole Family' : (it.members && it.members.length > 0 ? it.members.map((m: any) => m.name || m.username).join(', ') : 'Unassigned');
                      const isFromTemplate = Array.isArray(it.template_ids) && it.template_ids.length > 0;
                      return (
                        <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                              <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}
                                <Text component="span" size="xs" c="dimmed">{` - ${assignmentText}`}</Text>
                                {Array.isArray(it.template_ids) && it.template_ids.length > 0 ? (
                                  <Text component="span" size="xs" c="dimmed">{` · Added by ${it.template_ids.map((tid: string) => (templates.find(tt => tt.id === tid) || { name: tid }).name).join(', ')}`}</Text>
                                ) : null}
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
                              <Button size="xs" color="red" variant="subtle" onClick={() => handleRemoveItem(it.id)}>Remove</Button>
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

        
        {/* Auto-add item groups section */}
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: 12, marginTop: 12 }}>
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
                        // optimistic update
                        setEditAssignedTemplates(prev => on ? [...prev, t.id] : prev.filter(x => x !== t.id));
                        try {
                          const newTemplateIds = on ? Array.from(new Set([...(editAssignedTemplates || []), t.id])) : (editAssignedTemplates || []).filter(x => x !== t.id);
                          const payload: any = { templateIds: newTemplateIds };
                          if (!on) {
                            // open modal confirmation instead of using browser confirm
                            setRemovalConfirm({ open: true, templateId: t.id, templateName: t.name, newTemplateIds });
                            return;
                          }
                          const res = await updatePackingList(listId || '', payload);
                          if (res.response.ok) {
                            showNotification({ title: 'Saved', message: 'Item group assignments updated', color: 'green' });
                            const r = await getPackingList(listId || '');
                            if (r.response.ok) setEditItems((r.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off })));
                          } else {
                            showNotification({ title: 'Failed', message: 'Could not update assignments', color: 'red' });
                          }
                        } catch (err) {
                          console.error('Failed to update template assignment', err);
                          showNotification({ title: 'Failed', message: 'Could not update assignments', color: 'red' });
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
      </div>
    </Drawer>
    {/* Template assignments are now shown inline below as a checklist. */}

    {/* Use shared AddItemsDrawer for adding items to this list */}
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
      onClose={() => { setShowEditItemDrawer(false); setEditTargetItem(null); setItemDrawerDefaultMember(undefined); }}
      masterItemId={editTargetItem?.itemId}
      initialName={editTargetItem?.name}
      familyId={undefined}
      defaultAssignedMemberId={itemDrawerDefaultMember}
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
          // refresh main list items
          if (listId) {
            const r = await getPackingList(listId);
            if (r.response.ok) setEditItems((r.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off })));
          }
        } catch (e) {}
      }}
      showIsOneOffCheckbox={true}
      promoteContext={editTargetItem && !editTargetItem.itemId ? { listId: listId || '', packingListItemId: editTargetItem.id } : null}
    />
    <Modal opened={removalConfirm.open} onClose={() => setRemovalConfirm({ open: false })} title={removalConfirm.templateName ? `Remove items added by ${removalConfirm.templateName}?` : 'Remove items?'}>
      <div>
        <Text size="sm">Do you also want to remove items that were added solely because of this item group?</Text>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button variant="default" onClick={() => setRemovalConfirm({ open: false })} disabled={removalLoading}>Keep Items</Button>
          <Button color="red" onClick={async () => {
            if (!listId) return;
            setRemovalLoading(true);
            try {
              const payload: any = { templateIds: removalConfirm.newTemplateIds || (editAssignedTemplates || []).filter(x => x !== (removalConfirm.templateId || '')) , removeItemsForRemovedTemplates: true };
              const res = await updatePackingList(listId || '', payload);
              if (res.response.ok) {
                showNotification({ title: 'Removed', message: 'Items removed', color: 'green' });
                const r = await getPackingList(listId || '');
                if (r.response.ok) setEditItems((r.data.items || []).map((it: any) => ({ ...it, itemId: it.item_id, oneOff: !!it.master_is_one_off })));
                setEditAssignedTemplates(payload.templateIds || []);
                setRemovalConfirm({ open: false });
              } else {
                showNotification({ title: 'Failed', message: 'Could not remove items', color: 'red' });
              }
            } catch (err) {
              console.error('Failed to remove items for template', err);
              showNotification({ title: 'Failed', message: 'Could not remove items', color: 'red' });
            } finally {
              setRemovalLoading(false);
            }
          }} loading={removalLoading}>Remove Items</Button>
        </div>
      </div>
    </Modal>
    </>
  );
}
