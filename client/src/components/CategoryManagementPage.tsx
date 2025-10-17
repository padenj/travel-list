import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getItems,
  getItemsForCategory,
  getMembersForItem,
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
  Modal,
} from '@mantine/core';
import AddItemsDrawer from './AddItemsDrawer';
import ItemEditDrawer from './ItemEditDrawer';
import ConfirmDelete from './ConfirmDelete';
import { IconTrash, IconEdit, IconPlus, IconX } from '@tabler/icons-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { updateCategoryOrder } from '../api';

function SortableCategoryRow({ id, name }: { id: string; name: string }) {
  // useSortable provides attributes/listeners for the whole item; we'll attach the listeners to a handle element
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 120ms',
    padding: 8,
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: 6,
    background: isDragging ? '#f7fbff' : '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: isDragging ? '0 6px 18px rgba(79, 84, 162, 0.12)' : undefined,
  } as React.CSSProperties;

  // Drag handle styled to match FamilyAdminPage drag handle
  const handleStyle: React.CSSProperties = {
    cursor: 'grab',
    padding: '4px 8px',
    borderRadius: 4,
    userSelect: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    transition: 'transform 120ms',
    color: 'rgba(0,0,0,0.45)'
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div {...listeners} aria-label={`Drag handle for ${name}`} style={handleStyle} title="Drag to reorder">≡</div>
        <div>{name}</div>
      </div>
      <div style={{ color: 'rgba(0,0,0,0.45)' }}>drag</div>
    </div>
  );
}


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
  const [itemMembers, setItemMembers] = useState<{ [itemId: string]: { id: string; name: string }[] }>({});
  const [itemsInAllCategories, setItemsInAllCategories] = useState<Set<string>>(new Set());
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  // no local addItemLoading state needed when using AddItemsDrawer
  const [showAddPaneForCategory, setShowAddPaneForCategory] = useState<{ open: boolean; categoryId?: string }>({ open: false });

  const { impersonatingFamilyId } = useImpersonation();
  const { bumpRefresh } = useRefresh();

    const [showEditDrawer, setShowEditDrawer] = useState(false);
    const [editMasterItemId, setEditMasterItemId] = useState<string | null>(null);
    const [sortMode, setSortMode] = useState(false);
    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );
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

  const fetchCategoryItems = async () => {
    if (!categories.length) return;
    const result: { [categoryId: string]: { id: string; name: string }[] } = {};
    for (const cat of categories) {
      const res = await getItemsForCategory(cat.id);
      result[cat.id] = res.response.ok ? res.data.items || [] : [];
    }
    setCategoryItems(result);
    // fetch members for all items found across categories
    const ids = new Set<string>();
    for (const catId of Object.keys(result)) {
      for (const item of result[catId] || []) ids.add(item.id);
    }
    const membersMap: { [itemId: string]: { id: string; name: string }[] } = {};
    await Promise.all(Array.from(ids).map(async (itemId) => {
      try {
        const mres = await getMembersForItem(itemId);
        if (mres.response.ok) membersMap[itemId] = Array.isArray(mres.data) ? mres.data : [];
        else membersMap[itemId] = [];
      } catch (e) {
        membersMap[itemId] = [];
      }
    }));
    setItemMembers(membersMap);
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
  };

  useEffect(() => {
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

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!active || !over) return;
    if (active.id !== over.id) {
      const oldIndex = categories.findIndex(c => c.id === active.id);
      const newIndex = categories.findIndex(c => c.id === over.id);
      const newCats = arrayMove(categories, oldIndex, newIndex);
      setCategories(newCats);
    }
  };

  const saveCategoryOrder = async () => {
    if (!familyId) return;
    const ids = categories.map(c => c.id);
    const res = await updateCategoryOrder(familyId, ids);
    if (res.response.ok) {
      setSortMode(false);
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
      <Group align="center" mb="md" style={{ width: '100%' }} justify="space-between">
        <Title order={3} style={{ margin: 0 }}>Manage Categories</Title>
        <div>
          <Button size="xs" onClick={() => setSortMode(true)}>Sort categories</Button>
        </div>
      </Group>
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
            {/* header button moved inline with title */}
            <Modal opened={sortMode} onClose={() => setSortMode(false)} title="Sort Categories" size="lg">
              <div style={{ marginTop: 6 }}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {categories.map(cat => (
                        <SortableCategoryRow key={cat.id} id={cat.id} name={cat.name} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <Button variant="default" onClick={() => setSortMode(false)}>Cancel</Button>
                  <Button onClick={saveCategoryOrder}>Save Order</Button>
                </div>
              </div>
            </Modal>
            <Tabs value={selectedTab} onChange={setSelectedTab} keepMounted={false}>
              <Tabs.List>
                {categories.map(cat => (
                  <Tabs.Tab key={cat.id} value={cat.id}>{cat.name}</Tabs.Tab>
                ))}
              </Tabs.List>
              {categories.map(cat => (
                <Tabs.Panel key={cat.id} value={cat.id}>
                  <Card withBorder mt="md">
                    <Group mb="md">
                      {editId === cat.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                          <TextInput
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                            style={{ flex: '1 1 auto' }}
                          />
                          <ActionIcon color="green" onClick={handleUpdate} title="Save">
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon color="gray" onClick={() => { setEditId(null); setEditName(''); }} title="Cancel">
                            <IconX size={16} />
                          </ActionIcon>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                          <Title order={4} style={{ margin: 0 }}>{cat.name}</Title>
                          <ActionIcon color="blue" variant="light" onClick={() => handleEdit(cat.id, cat.name)} title="Edit category name">
                            <IconEdit size={16} />
                          </ActionIcon>
                        </div>
                      )}
                    </Group>
                    <Group mb="sm" align="center">
                      <Button size="sm" leftSection={<IconPlus size={14} />} onClick={() => {
                        setSelectedTab(cat.id);
                        setShowAddPaneForCategory({ open: true, categoryId: cat.id });
                      }}>Add Item</Button>
                      <Title order={5} style={{ margin: 0 }}>Items in this category</Title>
                    </Group>
                    <List mb="md">
                      {categoryItems[cat.id]?.length > 0 ? (
                        categoryItems[cat.id].map(item => (
                          <List.Item key={item.id}>
                            <Group justify="space-between" align="center">
                              <div>
                                <Text>{item.name}</Text>
                                {itemMembers[item.id] && itemMembers[item.id].length > 0 && (
                                  <Text c="dimmed" size="sm">{itemMembers[item.id].map(m => m.name).join(', ')}</Text>
                                )}
                              </div>
                              <Group>
                                <ActionIcon color="blue" variant="light" onClick={() => { setEditMasterItemId(item.id); setShowEditDrawer(true); }} title="Edit item">
                                  <IconEdit size={16} />
                                </ActionIcon>
                                {/* Removed per-item delete action - items are managed via the Add Item flow or global item editor. */}
                                {itemsInAllCategories.has(item.id) ? (
                                  // show disabled trash icon for 'All' items to indicate non-removable status
                                  <ActionIcon color="gray" variant="light" title="Item in All categories; cannot remove individually" disabled>
                                    <IconTrash size={16} />
                                  </ActionIcon>
                                ) : null}
                              </Group>
                            </Group>
                          </List.Item>
                        ))
                      ) : (
                        <List.Item><Text c="dimmed">No items in this category</Text></List.Item>
                      )}
                    </List>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <ConfirmDelete onConfirm={() => handleDelete(cat.id)} title="Delete category" />
                    </div>
                  </Card>
                </Tabs.Panel>
              ))}
            </Tabs>
            <AddItemsDrawer
              opened={showAddPaneForCategory.open}
              onClose={() => setShowAddPaneForCategory({ open: false })}
              familyId={familyId}
              excludedItemIds={(showAddPaneForCategory.categoryId && categoryItems[showAddPaneForCategory.categoryId] ? categoryItems[showAddPaneForCategory.categoryId].map(i => i.id) : [])}
              showAssignedItemsToggle={true}
              targetCategoryId={showAddPaneForCategory.categoryId}
              onApply={handleAddItemsToCategory}
              showIsOneOffCheckbox={false}
              title="Add items to category"
            />
            <ItemEditDrawer
              opened={showEditDrawer}
              onClose={() => { setShowEditDrawer(false); setEditMasterItemId(null); }}
              masterItemId={editMasterItemId || undefined}
              initialName={editMasterItemId ? (items.find(i => i.id === editMasterItemId)?.name) : undefined}
              familyId={familyId}
              showNameField={true}
              onSaved={async () => {
                await fetchCategoryItems();
                setShowEditDrawer(false);
                setEditMasterItemId(null);
                bumpRefresh();
              }}
              showIsOneOffCheckbox={false}
            />
          </>
        )}
      </Stack>
    </Card>
  );
}
