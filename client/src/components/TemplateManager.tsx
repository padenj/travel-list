import { useEffect, useState } from 'react';
import { Button, TextInput, Textarea, Group, Modal, Checkbox, Stack, Select, Card, Title, Text, List, ActionIcon } from '@mantine/core';
import {
  getItemGroups,
  createItemGroup,
  updateItemGroup,
  deleteItemGroup,
  assignItemToItemGroup,
  getCategories,
  getItemsForItemGroup,
  removeItemFromItemGroup,
  addCategoryItemsToItemGroup,
} from '../api';
import { getMembersForItem } from '../api';
import { getCurrentUserProfile } from '../api';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { useRefresh } from '../contexts/RefreshContext';
import { IconEdit, IconTrash, IconPlus, IconX } from '@tabler/icons-react';
import AddItemsDrawer from './AddItemsDrawer';
import ItemEditDrawer from './ItemEditDrawer';

type Group = { id: string; name: string; description?: string };
type Category = { id: string; name: string };
type Item = { id: string; name: string; categoryId?: string; categoryName?: string };

const sortByName = <T extends { name?: string }>(a: T, b: T) =>
  (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });

export default function TemplateManager() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; description: string }>({ name: '', description: '' });
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [groupItems, setGroupItems] = useState<{ [groupId: string]: Item[] }>({});
  const [itemMembers, setItemMembers] = useState<{ [itemId: string]: { id: string; name: string }[] }>({});
  const [showAddItemsDrawer, setShowAddItemsDrawer] = useState<{ open: boolean; groupId?: string }>({ open: false });
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [editMasterItemId, setEditMasterItemId] = useState<string | null>(null);
  const [editingNameDraft, setEditingNameDraft] = useState<string>('');
  const [editingName, setEditingName] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [addCategorySelections, setAddCategorySelections] = useState<string[]>([]);

  const { impersonatingFamilyId } = useImpersonation();
  const { refreshKey } = useRefresh();

  useEffect(() => {
    async function fetchData() {
      let fid: string | null = null;
      if (impersonatingFamilyId) {
        fid = impersonatingFamilyId;
      } else {
        const profileRes = await getCurrentUserProfile();
        if (profileRes.response.ok && profileRes.data.family) fid = profileRes.data.family.id;
      }
      if (!fid) return;
      setFamilyId(fid);
      const groupsRes = await getItemGroups(fid);
      const loaded: Group[] = (groupsRes.data?.itemGroups || groupsRes.data?.templates || [])
        .slice()
        .sort(sortByName);
      setGroups(loaded);
      setSelectedGroupId(prev => (prev && loaded.some(g => g.id === prev) ? prev : (loaded[0]?.id ?? null)));
      getCategories(fid).then(res => setCategories((res.data?.categories || []).slice().sort(sortByName)));
      await loadAllGroupItems(loaded);
    }
    fetchData();
  }, [impersonatingFamilyId, refreshKey]);

  const loadGroupItems = async (groupId: string): Promise<Item[]> => {
    const res = await getItemsForItemGroup(groupId);
    const items: Item[] = res.response.ok && res.data ? (res.data.items || []) : [];
    return items.slice().sort(sortByName);
  };

  const loadAllGroupItems = async (groupList: Group[]) => {
    const map: { [groupId: string]: Item[] } = {};
    for (const g of groupList) {
      try {
        map[g.id] = await loadGroupItems(g.id);
      } catch {
        map[g.id] = [];
      }
    }
    setGroupItems(map);
    await fetchMembersForItems(map);
  };

  const fetchMembersForItems = async (map: { [groupId: string]: Item[] }) => {
    const ids = new Set<string>();
    Object.values(map).forEach(list => list.forEach(i => ids.add(i.id)));
    const result: { [itemId: string]: { id: string; name: string }[] } = {};
    await Promise.all(Array.from(ids).map(async itemId => {
      try {
        const res = await getMembersForItem(itemId);
        if (res.response.ok) result[itemId] = Array.isArray(res.data) ? res.data : (res.data?.members || []);
        else result[itemId] = [];
      } catch {
        result[itemId] = [];
      }
    }));
    setItemMembers(result);
  };

  const refreshGroupItems = async (groupId: string) => {
    const items = await loadGroupItems(groupId);
    setGroupItems(prev => ({ ...prev, [groupId]: items }));
    await fetchMembersForItems({ [groupId]: items });
  };

  const openCreateModal = () => {
    setForm({ name: '', description: '' });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !familyId) return;
    const createRes = await createItemGroup(familyId, form.name, form.description);
    const newId = createRes.data?.itemGroup?.id || createRes.data?.template?.id;
    setModalOpen(false);
    const groupsRes = await getItemGroups(familyId);
    const loaded: Group[] = (groupsRes.data?.itemGroups || groupsRes.data?.templates || [])
      .slice()
      .sort(sortByName);
    setGroups(loaded);
    if (newId) setSelectedGroupId(newId);
    await loadAllGroupItems(loaded);
  };

  const handleDelete = async (id: string) => {
    await deleteItemGroup(id);
    if (!familyId) return;
    const groupsRes = await getItemGroups(familyId);
    const loaded: Group[] = (groupsRes.data?.itemGroups || groupsRes.data?.templates || [])
      .slice()
      .sort(sortByName);
    setGroups(loaded);
    setSelectedGroupId(loaded[0]?.id ?? null);
    await loadAllGroupItems(loaded);
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId) || null;
  const currentItems = selectedGroupId ? (groupItems[selectedGroupId] || []) : [];
  const excludedItemIds = currentItems.map(i => i.id);
  const groupedItems = currentItems.reduce((map, item) => {
    const key = item.categoryName?.trim() || '';
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
    return map;
  }, new Map<string, Item[]>());
  const sortedCategoryKeys = Array.from(groupedItems.keys())
    .filter(key => key !== '')
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  if (groupedItems.has('')) {
    sortedCategoryKeys.push('');
  }

  const renderGroupItem = (item: Item) => (
    <List.Item key={item.id}>
      <Group justify="space-between">
        <Text>{item.name}</Text>
        <Group>
          <Text c="dimmed" size="sm">{(itemMembers[item.id] || []).map(m => m.name).join(', ')}</Text>
          <ActionIcon color="blue" variant="light" onClick={() => { setEditMasterItemId(item.id); setShowEditDrawer(true); }}>
            <IconEdit size={16} />
          </ActionIcon>
          <ActionIcon color="red" variant="light" onClick={async () => {
            if (!selectedGroup) return;
            await removeItemFromItemGroup(selectedGroup.id, item.id);
            setGroupItems(prev => ({ ...prev, [selectedGroup.id]: (prev[selectedGroup.id] || []).filter(i => i.id !== item.id) }));
          }}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>
    </List.Item>
  );

  return (
    <div>
      <Group justify="space-between" mb="md">
        <Title order={2}>Item Groups</Title>
        <Button onClick={openCreateModal}>New Item Group</Button>
      </Group>

      {groups.length === 0 ? (
        <Text c="dimmed">No item groups yet. Create your first item group!</Text>
      ) : (
        <>
          <Select
            mb="md"
            searchable
            placeholder="Select an item group"
            nothingFoundMessage="No groups found"
            data={groups.map(g => ({ value: g.id, label: g.name }))}
            value={selectedGroupId}
            onChange={setSelectedGroupId}
            aria-label="Select item group"
          />

          {selectedGroup && (
            <Card withBorder style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 240px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 12px)' }}>
              <Group justify="space-between" mb="md">
                {editingName ? (
                  <Group>
                    <TextInput value={editingNameDraft} onChange={e => setEditingNameDraft(e.target.value)} size="sm" />
                    <ActionIcon color="green" variant="light" onClick={async () => {
                      const newName = editingNameDraft.trim();
                      if (!newName) return;
                      await updateItemGroup(selectedGroup.id, { name: newName });
                      setGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, name: newName } : g).slice().sort(sortByName));
                      setEditingName(false);
                    }}>
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon color="gray" variant="light" onClick={() => setEditingName(false)}>
                      <IconX size={16} />
                    </ActionIcon>
                  </Group>
                ) : (
                  <Group>
                    <Title order={3}>{selectedGroup.name}</Title>
                    {selectedGroup.description && <Text c="dimmed">{selectedGroup.description}</Text>}
                    <ActionIcon color="blue" variant="light" onClick={() => { setEditingName(true); setEditingNameDraft(selectedGroup.name || ''); }}>
                      <IconEdit size={16} />
                    </ActionIcon>
                  </Group>
                )}
                <ActionIcon color="red" variant="light" onClick={() => handleDelete(selectedGroup.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>

              <Group style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Title order={4} mb="sm">Items</Title>
                <Group>
                  <Button size="xs" variant="light" leftSection={<IconPlus size={16} />} onClick={() => { setAddCategorySelections([]); setShowAddCategoryModal(true); }}>Add from categories</Button>
                  <Button size="xs" leftSection={<IconPlus size={16} />} onClick={() => setShowAddItemsDrawer({ open: true, groupId: selectedGroup.id })}>Add Item</Button>
                </Group>
              </Group>

              {currentItems.length === 0 ? (
                <Text c="dimmed" mb="md">No items in this group yet.</Text>
              ) : (
                sortedCategoryKeys.map(key => (
                  <div key={key || 'uncategorized'}>
                    <Text fw={700} mt="xs" mb="xs">{key || 'Uncategorized'}</Text>
                    <List mb="sm">
                      {groupedItems.get(key)?.map(renderGroupItem)}
                    </List>
                  </div>
                ))
              )}
            </Card>
          )}
        </>
      )}

      <Modal opened={showAddCategoryModal} onClose={() => setShowAddCategoryModal(false)} title="Add all items from categories">
        <Text mb="sm">Select categories. Their current items will be added individually (duplicates are skipped):</Text>
        <Stack>
          {categories.map(c => (
            <Checkbox key={c.id} label={c.name} checked={addCategorySelections.includes(c.id)} onChange={e => {
              const checked = e.target.checked;
              setAddCategorySelections(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id));
            }} />
          ))}
        </Stack>
        <Group mt="md">
          <Button disabled={addCategorySelections.length === 0} onClick={async () => {
            if (!selectedGroupId) return;
            await addCategoryItemsToItemGroup(selectedGroupId, addCategorySelections);
            await refreshGroupItems(selectedGroupId);
            setAddCategorySelections([]);
            setShowAddCategoryModal(false);
          }}>Add</Button>
          <Button variant="outline" onClick={() => { setAddCategorySelections([]); setShowAddCategoryModal(false); }}>Cancel</Button>
        </Group>
      </Modal>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="New Item Group">
        <TextInput label="Item Group Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <Textarea label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <Group mt="md">
          <Button onClick={handleCreate}>Create</Button>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
        </Group>
      </Modal>

      <AddItemsDrawer
        opened={showAddItemsDrawer.open}
        onClose={() => setShowAddItemsDrawer({ open: false })}
        familyId={familyId}
        excludedItemIds={excludedItemIds}
        showIsOneOffCheckbox={false}
        autoApplyOnCreate={true}
        onApply={async (ids: string[]) => {
          const gid = showAddItemsDrawer.groupId;
          if (!gid) return;
          for (const id of ids) {
            await assignItemToItemGroup(gid, id);
          }
          await refreshGroupItems(gid);
        }}
      />

      {showEditDrawer && editMasterItemId && (
        <ItemEditDrawer
          opened={showEditDrawer}
          onClose={() => { setShowEditDrawer(false); setEditMasterItemId(null); }}
          masterItemId={editMasterItemId || undefined}
          familyId={familyId}
          onSaved={async () => {
            if (selectedGroupId) {
              await refreshGroupItems(selectedGroupId);
            }
            setShowEditDrawer(false);
            setEditMasterItemId(null);
          }}
          showIsOneOffCheckbox={false}
          hideAddActionWhenNoList={true}
        />
      )}
    </div>
  );
}
