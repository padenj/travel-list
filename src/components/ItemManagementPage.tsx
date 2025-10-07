import React, { useEffect, useState } from 'react';
import { getItems, createItem, updateItem, deleteItem, getCategories, getCategoriesForItem, assignItemToCategory, removeItemFromCategory } from '../api';
import { getMembersForItem, isAssignedToWholeFamily, assignToMember, removeFromMember, assignToWholeFamily, removeFromWholeFamily } from '../api';
import { Card, Title, Stack, Group, Button, TextInput, Loader, ActionIcon, Text, Checkbox, Drawer } from '@mantine/core';
import { IconTrash, IconEdit, IconPlus } from '@tabler/icons-react';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { useRefresh } from '../contexts/RefreshContext';
import ItemEditDrawer from './ItemEditDrawer';

export default function ItemManagementPage(): React.ReactElement {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState('');
  // Drawer edit state (replaces inline editing)
  const [showItemDrawer, setShowItemDrawer] = useState(false);
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);
  const [drawerName, setDrawerName] = useState('');
  const [drawerSelectedCategories, setDrawerSelectedCategories] = useState<{ [key: string]: string[] }>({});
  const [drawerSelectedMembers, setDrawerSelectedMembers] = useState<{ [key: string]: string[] }>({});
  const [drawerSelectedWhole, setDrawerSelectedWhole] = useState<{ [key: string]: boolean }>({});
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [itemCategories, setItemCategories] = useState<{ [key: string]: string[] }>({});
    const [itemMembers, setItemMembers] = useState<{ [key: string]: string[] }>({});
    const [wholeFamilyAssignments, setWholeFamilyAssignments] = useState<{ [key: string]: boolean }>({});
    const [familyMembers, setFamilyMembers] = useState<{ id: string; name: string }[]>([]);

  const { impersonatingFamilyId } = useImpersonation();
  const { bumpRefresh } = useRefresh();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // prefer impersonation family id over current profile
      let fid = impersonatingFamilyId;
      if (!fid) {
        const profileRes = await import('../api').then(m => m.getCurrentUserProfile());
        if (profileRes.response.ok && profileRes.data.family) {
          fid = profileRes.data.family.id;
        }
      }
      let profileRes: any = null;
      if (!impersonatingFamilyId) {
        profileRes = await import('../api').then(m => m.getCurrentUserProfile());
      }
      if (fid) {
        setFamilyId(fid);
        const [itemRes, catRes] = await Promise.all([
          getItems(fid),
          getCategories(fid)
        ]);
        if (itemRes.response.ok) setItems(itemRes.data.items || []);
        if (catRes.response.ok) setCategories(catRes.data.categories || []);
        // Fetch assigned categories for each item
        if (itemRes.response.ok && itemRes.data.items) {
          const catMap: Record<string, string[]> = {};
            const memberMap: Record<string, string[]> = {};
            const wholeFamilyMap: Record<string, boolean> = {};
          await Promise.all(itemRes.data.items.map(async (item: { id: string }) => {
            try {
              const res = await getCategoriesForItem(item.id);
              if (res.response.ok) {
                catMap[item.id] = (res.data.categories || []).map((c: { id: string }) => c.id);
              } else {
                catMap[item.id] = [];
              }
                // Members: API sometimes returns { members: [...] } or the array directly.
                const memRes = await getMembersForItem(item.id);
                if (memRes.response.ok) {
                  let membersArr: any[] = [];
                  if (Array.isArray(memRes.data)) {
                    membersArr = memRes.data;
                  } else if (memRes.data && Array.isArray((memRes.data as any).members)) {
                    membersArr = (memRes.data as any).members;
                  }
                  memberMap[item.id] = membersArr.map((m: { id: string }) => m.id);
                } else {
                  memberMap[item.id] = [];
                }
                // Whole family: API may return boolean or an object; normalize to boolean
                const wfRes = await isAssignedToWholeFamily(item.id);
                let wfAssigned = false;
                if (wfRes.response.ok) {
                  if (typeof wfRes.data === 'boolean') wfAssigned = wfRes.data;
                  else if (wfRes.data && (wfRes.data as any).assigned === true) wfAssigned = true;
                }
                wholeFamilyMap[item.id] = wfAssigned;
            } catch {
              catMap[item.id] = [];
                memberMap[item.id] = [];
                wholeFamilyMap[item.id] = false;
            }
          }));
          setItemCategories(catMap);
            setItemMembers(memberMap);
            setWholeFamilyAssignments(wholeFamilyMap);
        }
          // Load family members (only available from profile response)
          if (profileRes && profileRes.response.ok && profileRes.data.family) {
            setFamilyMembers(profileRes.data.family.members || []);
          } else {
            setFamilyMembers([]);
          }
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  // Remove unused effect

  const handleAdd = async () => {
    if (!familyId || !newItem.trim()) return;
    const res = await createItem(familyId, newItem.trim());
    if (res.response.ok) {
      setItems([...items, res.data.item]);
      setNewItem('');
      bumpRefresh();
    }
  };

  const openItemDrawer = (id: string) => {
    const item = items.find(it => it.id === id);
    setDrawerItemId(id);
    setDrawerName(item ? item.name : '');
    setShowItemDrawer(true);
  };

  const closeItemDrawer = () => {
    setShowItemDrawer(false);
    setDrawerItemId(null);
    setDrawerName('');
  };

  const handleItemSaved = async (payload?: { name?: string }) => {
    if (!drawerItemId) return;
    try {
      const id = drawerItemId;
      // update local name if returned
      if (payload?.name) {
        setItems(prev => prev.map(it => it.id === id ? { ...it, name: payload.name as string } : it));
      }
      // refresh maps by triggering a data reload
      bumpRefresh();
    } finally {
      closeItemDrawer();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteItem(id);
    if (res.response.ok) {
      setItems(items.filter(item => item.id !== id));
      bumpRefresh();
    }
  };

  // category changes are handled through the drawer save flow now

  if (loading) return <Loader />;

  return (
    <Card withBorder>
      <Title order={3} mb="md">Manage Items</Title>
      <Stack>
        <Group>
          <TextInput
            placeholder="Add new item"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
          />
          <Button leftSection={<IconPlus size={16} />} onClick={handleAdd} disabled={!newItem.trim()}>
            Add
          </Button>
        </Group>
        {items.length === 0 ? (
          <Text c="dimmed">No items yet.</Text>
        ) : (
          items.map(item => (
            <Group key={item.id}>
              <Text style={{ flex: '1 1 auto' }}>{item.name}</Text>
              <ActionIcon color="blue" variant="light" onClick={() => openItemDrawer(item.id)}>
                <IconEdit size={16} />
              </ActionIcon>
              <ActionIcon color="red" variant="light" onClick={() => handleDelete(item.id)}>
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))
        )}
      </Stack>
      <ItemEditDrawer
        opened={showItemDrawer}
        onClose={closeItemDrawer}
        masterItemId={drawerItemId}
        initialName={drawerName}
        familyId={familyId}
        showNameField={true}
        onSaved={handleItemSaved}
      />
    </Card>
  );
}
