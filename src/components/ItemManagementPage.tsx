import React, { useEffect, useState } from 'react';
import { getItems, createItem, updateItem, deleteItem, getCategories, getCategoriesForItem, assignItemToCategory, removeItemFromCategory } from '../api';
import { getMembersForItem, isAssignedToWholeFamily, assignToMember, removeFromMember, assignToWholeFamily, removeFromWholeFamily } from '../api';
import { Card, Title, Stack, Group, Button, TextInput, Loader, ActionIcon, Text, Checkbox, Divider } from '@mantine/core';
import { IconTrash, IconEdit, IconPlus } from '@tabler/icons-react';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { useRefresh } from '../contexts/RefreshContext';

export default function ItemManagementPage(): React.ReactElement {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
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
                // Members
                const memRes = await getMembersForItem(item.id);
                if (memRes.response.ok) {
                  memberMap[item.id] = (memRes.data.members || []).map((m: { id: string }) => m.id);
                } else {
                  memberMap[item.id] = [];
                }
                // Whole family
                const wfRes = await isAssignedToWholeFamily(item.id);
                wholeFamilyMap[item.id] = wfRes.response.ok && wfRes.data.assigned === true;
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

  const handleEdit = (id: string, name: string) => {
    setEditId(id);
    setEditName(name);
  };

  const handleUpdate = async () => {
    if (!editId || !editName.trim()) return;
    const res = await updateItem(editId, editName.trim());
    if (res.response.ok) {
      setItems(items.map(item => item.id === editId ? { ...item, name: editName.trim() } : item));
      setEditId(null);
      setEditName('');
      bumpRefresh();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteItem(id);
    if (res.response.ok) {
      setItems(items.filter(item => item.id !== id));
      bumpRefresh();
    }
  };

  const handleCategoryChange = async (itemId: string, categoryId: string, checked: boolean) => {
    setLoading(true);
    if (checked) {
      await assignItemToCategory(itemId, categoryId);
      setItemCategories(prev => ({ ...prev, [itemId]: [...(prev[itemId] || []), categoryId] }));
      bumpRefresh();
    } else {
      await removeItemFromCategory(itemId, categoryId);
      setItemCategories(prev => ({ ...prev, [itemId]: (prev[itemId] || []).filter(id => id !== categoryId) }));
      bumpRefresh();
    }
    setLoading(false);
  };

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
              {editId === item.id ? (
                <>
                  <TextInput
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                  />
                  <Button size="xs" onClick={handleUpdate}>Save</Button>
                  <Button size="xs" variant="light" onClick={() => { setEditId(null); setEditName(''); }}>Cancel</Button>
                </>
              ) : (
                <>
                  <Text>{item.name}</Text>
                  <ActionIcon color="blue" variant="light" onClick={() => handleEdit(item.id, item.name)}>
                    <IconEdit size={16} />
                  </ActionIcon>
                  <ActionIcon color="red" variant="light" onClick={() => handleDelete(item.id)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                  <Group>
                    {categories.map(cat => (
                      <Checkbox
                        key={cat.id}
                        label={cat.name}
                        checked={itemCategories[item.id]?.includes(cat.id) || false}
                        onChange={e => handleCategoryChange(item.id, cat.id, e.currentTarget.checked)}
                      />
                    ))}
                    <Divider orientation="vertical" mx={8} />
                    <Text size="sm">Assign to:</Text>
                    <Checkbox
                      label="Whole Family"
                      checked={wholeFamilyAssignments[item.id] || false}
                      onChange={async e => {
                        setLoading(true);
                        if (e.currentTarget.checked) {
                          await assignToWholeFamily(item.id, familyId!);
                          setWholeFamilyAssignments(prev => ({ ...prev, [item.id]: true }));
                          bumpRefresh();
                        } else {
                          await removeFromWholeFamily(item.id);
                          setWholeFamilyAssignments(prev => ({ ...prev, [item.id]: false }));
                          bumpRefresh();
                        }
                        setLoading(false);
                      }}
                    />
                    {familyMembers.map(member => (
                      <Checkbox
                        key={member.id}
                        label={member.name}
                        checked={itemMembers[item.id]?.includes(member.id) || false}
                        onChange={async e => {
                          setLoading(true);
                          if (e.currentTarget.checked) {
                            await assignToMember(item.id, member.id);
                            setItemMembers(prev => ({ ...prev, [item.id]: [...(prev[item.id] || []), member.id] }));
                            bumpRefresh();
                          } else {
                            await removeFromMember(item.id, member.id);
                            setItemMembers(prev => ({ ...prev, [item.id]: (prev[item.id] || []).filter(id => id !== member.id) }));
                            bumpRefresh();
                          }
                          setLoading(false);
                        }}
                      />
                    ))}
                  </Group>
                </>
              )}
            </Group>
          ))
        )}
      </Stack>
    </Card>
  );
}
