import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getItems,
  getItemsForCategory,
  assignItemToCategory,
  removeItemFromCategory,
  createItem,
} from '../api';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { useRefresh } from '../contexts/RefreshContext';
import {
  Card,
  Title,
  Stack,
  Group,
  Button,
  TextInput,
  Loader,
  ActionIcon,
  Text,
  Tabs,
  List,
  Autocomplete,
} from '@mantine/core';
import { IconTrash, IconEdit, IconPlus, IconX } from '@tabler/icons-react';


export default function CategoryManagementPage(): React.ReactElement {
  const location = useLocation();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [categoryItems, setCategoryItems] = useState<{ [categoryId: string]: { id: string; name: string }[] }>({});
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const [addItemValue, setAddItemValue] = useState('');
  const [addItemLoading, setAddItemLoading] = useState(false);

  const { impersonatingFamilyId } = useImpersonation();
  const { bumpRefresh } = useRefresh();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // prefer impersonation family id (set by SystemAdmin) otherwise load from profile
      let fid = impersonatingFamilyId;
      if (!fid) {
        const profileRes = await import('../api').then(m => m.getCurrentUserProfile());
        if (profileRes.response.ok && profileRes.data.family) {
          fid = profileRes.data.family.id;
        }
      }
      if (fid) {
        setFamilyId(fid);
        const catRes = await getCategories(fid);
        if (catRes.response.ok) {
          setCategories(catRes.data.categories || []);
          if (catRes.data.categories?.length > 0) {
            // default selected tab is first; allow query param to override
            let initial = catRes.data.categories[0].id;
            try {
              const params = new URLSearchParams(location.search);
              const open = params.get('open');
              if (open) initial = open;
            } catch (e) {
              // ignore
            }
            setSelectedTab(initial);
          }
        }
        const itemsRes = await getItems(fid);
        if (itemsRes.response.ok) setItems(itemsRes.data.items || []);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  useEffect(() => {
    async function fetchCategoryItems() {
      if (!categories.length) return;
      const result: { [categoryId: string]: { id: string; name: string }[] } = {};
      for (const cat of categories) {
        const res = await getItemsForCategory(cat.id);
        result[cat.id] = res.response.ok ? res.data.items || [] : [];
      }
      setCategoryItems(result);
    }
    fetchCategoryItems();
  }, [categories]);

  const handleAddCategory = async () => {
    if (!familyId || !newCategory.trim()) return;
    const res = await createCategory(familyId, newCategory.trim());
    if (res.response.ok) {
      setCategories([...categories, res.data.category]);
      setNewCategory('');
      setSelectedTab(res.data.category.id);
      bumpRefresh();
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
      bumpRefresh();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteCategory(id);
    if (res.response.ok) {
      setCategories(categories.filter(cat => cat.id !== id));
      if (selectedTab === id && categories.length > 1) {
        setSelectedTab(categories[0].id);
      }
      bumpRefresh();
    }
  };

  const handleRemoveItem = async (itemId: string, categoryId: string) => {
    await removeItemFromCategory(itemId, categoryId);
    setCategoryItems(prev => ({
      ...prev,
      [categoryId]: prev[categoryId].filter(item => item.id !== itemId),
    }));
  };

  const handleAddItem = async (categoryId: string) => {
    setAddItemLoading(true);
    let itemToAdd = items.find(i => i.name.toLowerCase() === addItemValue.trim().toLowerCase());
    let newItem;
    if (!itemToAdd && familyId) {
      // Create new item
      const res = await createItem(familyId, addItemValue.trim());
      if (res.response.ok) {
        newItem = res.data.item;
        setItems([...items, newItem]);
        itemToAdd = newItem;
      }
    }
    if (itemToAdd) {
      await assignItemToCategory(itemToAdd.id, categoryId);
      setCategoryItems(prev => ({
        ...prev,
        [categoryId]: [...prev[categoryId], itemToAdd!],
      }));
      bumpRefresh();
    }
    setAddItemValue('');
    setAddItemLoading(false);
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
          <Button leftSection={<IconPlus size={16} />} onClick={handleAddCategory} disabled={!newCategory.trim()}>
            Add
          </Button>
        </Group>
        {categories.length === 0 ? (
          <Text c="dimmed">No categories yet.</Text>
        ) : (
          <Tabs value={selectedTab} onChange={setSelectedTab} keepMounted={false}>
            <Tabs.List>
              {categories.map(cat => (
                <Tabs.Tab key={cat.id} value={cat.id}>{cat.name}</Tabs.Tab>
              ))}
            </Tabs.List>
            {categories.map(cat => (
              <Tabs.Panel key={cat.id} value={cat.id}>
                <Card withBorder mt="md">
                  <Group justify="space-between" mb="md">
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
                        <Title order={4}>{cat.name}</Title>
                        <Group>
                          <ActionIcon color="blue" variant="light" onClick={() => handleEdit(cat.id, cat.name)}>
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon color="red" variant="light" onClick={() => handleDelete(cat.id)}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </>
                    )}
                  </Group>
                  <Title order={5} mb="sm">Items in this category</Title>
                  <List mb="md">
                    {categoryItems[cat.id]?.length > 0 ? (
                      categoryItems[cat.id].map(item => (
                        <List.Item key={item.id}>
                          <Group justify="space-between">
                            <Text>{item.name}</Text>
                            <ActionIcon color="red" variant="light" onClick={() => handleRemoveItem(item.id, cat.id)}>
                              <IconX size={16} />
                            </ActionIcon>
                          </Group>
                        </List.Item>
                      ))
                    ) : (
                      <List.Item><Text c="dimmed">No items in this category</Text></List.Item>
                    )}
                  </List>
                  <Group>
                    <Autocomplete
                      data={items.filter(i => !categoryItems[cat.id]?.some(ci => ci.id === i.id)).map(i => i.name)}
                      value={addItemValue}
                      onChange={setAddItemValue}
                      placeholder="Add item to category"
                      disabled={addItemLoading}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && addItemValue.trim()) {
                          handleAddItem(cat.id);
                        }
                      }}
                    />
                    <Button
                      leftSection={<IconPlus size={16} />}
                      onClick={() => handleAddItem(cat.id)}
                      disabled={!addItemValue.trim() || addItemLoading}
                    >
                      Add Item
                    </Button>
                  </Group>
                </Card>
              </Tabs.Panel>
            ))}
          </Tabs>
        )}
      </Stack>
    </Card>
  );
}
