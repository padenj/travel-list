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
} from '@mantine/core';
import AddItemsDrawer from './AddItemsDrawer';
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
  const [itemsInAllCategories, setItemsInAllCategories] = useState<Set<string>>(new Set());
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  // no local addItemLoading state needed when using AddItemsDrawer
  const [showAddPaneForCategory, setShowAddPaneForCategory] = useState<{ open: boolean; categoryId?: string }>({ open: false });

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
      // compute items that appear in every category (treat these as virtual 'All' items)
      const counts: Record<string, number> = {};
      const categoryCount = categories.length;
      for (const catId of Object.keys(result)) {
        for (const item of result[catId] || []) {
          counts[item.id] = (counts[item.id] || 0) + 1;
        }
      }
      const allSet = new Set<string>();
      for (const id of Object.keys(counts)) {
        if (counts[id] === categoryCount && categoryCount > 0) allSet.add(id);
      }
      setItemsInAllCategories(allSet);
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
    // Prevent removing items that are effectively in 'All' (present in every category)
    if (itemsInAllCategories.has(itemId)) {
      // Inform user that this item is assigned to all categories and cannot be removed individually.
      // Use a notification so the user understands why the remove action is disabled.
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { showNotification } = require('@mantine/notifications');
        showNotification({ title: 'Cannot remove', message: 'This item is assigned to all categories and cannot be removed individually.', color: 'blue' });
      } catch (e) {
        // fallback: no-op
      }
      return;
    }
    await removeItemFromCategory(itemId, categoryId);
    setCategoryItems(prev => ({
      ...prev,
      [categoryId]: prev[categoryId].filter(item => item.id !== itemId),
    }));
  };

  // AddItemsDrawer onApply handler
  const handleAddItemsToCategory = async (selectedItemIds: string[]) => {
    if (!showAddPaneForCategory.categoryId) return;
    const categoryId = showAddPaneForCategory.categoryId;
    for (const id of selectedItemIds) {
      await assignItemToCategory(id, categoryId);
      // find item name
      const it = items.find(i => i.id === id);
      if (it) {
        setCategoryItems(prev => ({
          ...prev,
          [categoryId]: [...(prev[categoryId] || []), it],
        }));
      }
    }
    bumpRefresh();
    setShowAddPaneForCategory({ open: false });
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
          <>
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
                              {itemsInAllCategories.has(item.id) ? (
                                // show disabled remove icon (non-interactive) for 'All' items
                                <ActionIcon color="gray" variant="light" title="Item in All categories; cannot remove individually" disabled>
                                  <IconX size={16} />
                                </ActionIcon>
                              ) : (
                                <ActionIcon color="red" variant="light" onClick={() => handleRemoveItem(item.id, cat.id)}>
                                  <IconX size={16} />
                                </ActionIcon>
                              )}
                            </Group>
                          </List.Item>
                        ))
                      ) : (
                        <List.Item><Text c="dimmed">No items in this category</Text></List.Item>
                      )}
                    </List>
                    <Group>
                      <Button leftSection={<IconPlus size={16} />} onClick={() => {
                        // open AddItemsDrawer for this category
                        setSelectedTab(cat.id);
                        // use a small modal approach: open AddItemsDrawer by toggling a per-category state
                        // reuse existing addItemValue flow by delegating to AddItemsDrawer below
                        setShowAddPaneForCategory({ open: true, categoryId: cat.id });
                      }}>Add Item</Button>
                    </Group>
                  </Card>
                </Tabs.Panel>
              ))}
            </Tabs>
            <AddItemsDrawer
              opened={showAddPaneForCategory.open}
              onClose={() => setShowAddPaneForCategory({ open: false })}
              familyId={familyId}
              excludedItemIds={(showAddPaneForCategory.categoryId && categoryItems[showAddPaneForCategory.categoryId] ? categoryItems[showAddPaneForCategory.categoryId].map(i => i.id) : [])}
              onApply={handleAddItemsToCategory}
              showIsOneOffCheckbox={false}
              title="Add items to category"
            />
          </>
        )}
      </Stack>
    </Card>
  );
}
