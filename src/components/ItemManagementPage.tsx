import React, { useEffect, useState } from 'react';
import { getItems, createItem, updateItem, deleteItem, getCategories, getCategoriesForItem, assignItemToCategory, removeItemFromCategory } from '../api';
import { Card, Title, Stack, Group, Button, TextInput, Loader, ActionIcon, Text, Checkbox } from '@mantine/core';
import { IconTrash, IconEdit, IconPlus } from '@tabler/icons-react';

export default function ItemManagementPage(): React.ReactElement {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [itemCategories, setItemCategories] = useState<{ [key: string]: string[] }>({});

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const profileRes = await import('../api').then(m => m.getCurrentUserProfile());
      if (profileRes.response.ok && profileRes.data.family) {
        setFamilyId(profileRes.data.family.id);
        const [itemRes, catRes] = await Promise.all([
          getItems(profileRes.data.family.id),
          getCategories(profileRes.data.family.id)
        ]);
        if (itemRes.response.ok) setItems(itemRes.data.items || []);
        if (catRes.response.ok) setCategories(catRes.data.categories || []);
        // Fetch assigned categories for each item
        if (itemRes.response.ok && itemRes.data.items) {
          const catMap: Record<string, string[]> = {};
          await Promise.all(itemRes.data.items.map(async (item: { id: string }) => {
            try {
              const res = await getCategoriesForItem(item.id);
              if (res.response.ok) {
                catMap[item.id] = (res.data.categories || []).map((c: { id: string }) => c.id);
              } else {
                catMap[item.id] = [];
              }
            } catch {
              catMap[item.id] = [];
            }
          }));
          setItemCategories(catMap);
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
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteItem(id);
    if (res.response.ok) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const handleCategoryChange = async (itemId: string, categoryId: string, checked: boolean) => {
    setLoading(true);
    if (checked) {
      await assignItemToCategory(itemId, categoryId);
      setItemCategories(prev => ({ ...prev, [itemId]: [...(prev[itemId] || []), categoryId] }));
    } else {
      await removeItemFromCategory(itemId, categoryId);
      setItemCategories(prev => ({ ...prev, [itemId]: (prev[itemId] || []).filter(id => id !== categoryId) }));
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
