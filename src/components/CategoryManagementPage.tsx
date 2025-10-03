import React, { useEffect, useState } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../api';
import { Card, Title, Stack, Group, Button, TextInput, Loader, ActionIcon, Text } from '@mantine/core';
import { IconTrash, IconEdit, IconPlus } from '@tabler/icons-react';

export default function CategoryManagementPage(): React.ReactElement {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    async function fetchCategories() {
      setLoading(true);
      // For demo, get familyId from localStorage or API
      const profileRes = await import('../api').then(m => m.getCurrentUserProfile());
      if (profileRes.response.ok && profileRes.data.family) {
        setFamilyId(profileRes.data.family.id);
        const catRes = await getCategories(profileRes.data.family.id);
        if (catRes.response.ok) setCategories(catRes.data.categories || []);
      }
      setLoading(false);
    }
    fetchCategories();
  }, []);

  const handleAdd = async () => {
    if (!familyId || !newCategory.trim()) return;
    const res = await createCategory(familyId, newCategory.trim());
    if (res.response.ok) {
      setCategories([...categories, res.data.category]);
      setNewCategory('');
    }
  };

  const handleEdit = (id: string, name: string) => {
    setEditId(id);
    setEditName(name);
  };

  const handleUpdate = async () => {
    if (!editId || !editName.trim()) return;
    const res = await updateCategory(editId, editName.trim());
    if (res.response.ok) {
      setCategories(categories.map(cat => cat.id === editId ? { ...cat, name: editName.trim() } : cat));
      setEditId(null);
      setEditName('');
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteCategory(id);
    if (res.response.ok) {
      setCategories(categories.filter(cat => cat.id !== id));
    }
  };

  if (loading) return <Loader />;

  return (
    <Card withBorder>
      <Title order={3} mb="md">Manage Categories</Title>
      <Stack>
        <Group>
          <TextInput
            placeholder="Add new category"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
          />
          <Button leftSection={<IconPlus size={16} />} onClick={handleAdd} disabled={!newCategory.trim()}>
            Add
          </Button>
        </Group>
        {categories.length === 0 ? (
          <Text c="dimmed">No categories yet.</Text>
        ) : (
          categories.map(cat => (
            <Group key={cat.id}>
              {editId === cat.id ? (
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
                  <Text>{cat.name}</Text>
                  <ActionIcon color="blue" variant="light" onClick={() => handleEdit(cat.id, cat.name)}>
                    <IconEdit size={16} />
                  </ActionIcon>
                  <ActionIcon color="red" variant="light" onClick={() => handleDelete(cat.id)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </>
              )}
            </Group>
          ))
        )}
      </Stack>
    </Card>
  );
}
