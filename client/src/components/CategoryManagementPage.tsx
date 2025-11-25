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
  deleteItem,
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
  Checkbox,
} from '@mantine/core';
import AddItemsDrawer from './AddItemsDrawer';
import ItemEditDrawer from './ItemEditDrawer';
import ConfirmDelete from './ConfirmDelete';
import BulkEditDrawer from './BulkEditDrawer';
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
  const changeSelectedTab = (tab: string | null) => {
    setSelectedTab(tab);
    // Clear selections when the user (or code) switches category
    setSelectedItems(new Set());
  };
  // no local addItemLoading state needed when using AddItemsDrawer
  const [showAddPaneForCategory, setShowAddPaneForCategory] = useState<{ open: boolean; categoryId?: string }>({ open: false });

  const { impersonatingFamilyId } = useImpersonation();
  const { bumpRefresh } = useRefresh();

    const [showEditDrawer, setShowEditDrawer] = useState(false);
    const [editMasterItemId, setEditMasterItemId] = useState<string | null>(null);
    const [lastSelectedMembers, setLastSelectedMembers] = useState<string[]>([]);
    const [lastSelectedWhole, setLastSelectedWhole] = useState<boolean>(false);
    const [sortMode, setSortMode] = useState(false);
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // prefer impersonation family id (set by SystemAdmin) otherwise load from profile
      let fid: string | null = null;
      if (impersonatingFamilyId) {
        fid = impersonatingFamilyId;
      } else {
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
            changeSelectedTab(initial);
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
  changeSelectedTab(res.data.category.id);
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
        changeSelectedTab(categories[0].id);
      }
      bumpRefresh();
    }
  };

  const handleRemoveItem = async (itemId: string, categoryId: string) => {
    // Always allow removing an item from a category.
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
            <Tabs value={selectedTab} onChange={changeSelectedTab} keepMounted={false}>
              <Tabs.List>
                {categories.map(cat => (
                  <Tabs.Tab key={cat.id} value={cat.id}>{cat.name}</Tabs.Tab>
                ))}
              </Tabs.List>
              {categories.map(cat => (
                <Tabs.Panel key={cat.id} value={cat.id}>
                  <Card withBorder mt="md">
                    <Group mb="md" align="center" style={{ justifyContent: 'space-between' }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Title order={4} style={{ margin: 0 }}>{cat.name}</Title>
                          <ActionIcon color="blue" variant="light" onClick={() => handleEdit(cat.id, cat.name)} title="Edit category name">
                            <IconEdit size={16} />
                          </ActionIcon>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                        <div>
                          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => {
                            // Open ItemEditDrawer in create mode with category pre-selected
                            changeSelectedTab(cat.id);
                            setShowAddPaneForCategory({ open: true, categoryId: cat.id });
                            setEditMasterItemId(null);
                            // ensure the name field is cleared when opening for create
                            setShowEditDrawer(true);
                          }}>Add</Button>
                        </div>
                        <div>
                          <Checkbox label="Select multiple" checked={multiSelectMode} onChange={(e) => { setMultiSelectMode(e.currentTarget.checked); if (!e.currentTarget.checked) setSelectedItems(new Set()); }} />
                        </div>
                        {multiSelectMode && (
                          <div>
                            <Group>
                              <Text size="sm">{selectedItems.size} selected</Text>
                              <Button size="xs" onClick={() => setShowBulkEdit(true)} disabled={selectedItems.size === 0}>Bulk Edit</Button>
                            </Group>
                          </div>
                        )}
                      </div>
                    </Group>
                    <Title order={5} mb="sm">Items in this category</Title>
                    {categoryItems[cat.id]?.length > 0 ? (
                      <div>
                        <style>{`
                          .tl-category-grid {
                            display: grid;
                            gap: 8px;
                            grid-template-columns: repeat(1, 1fr);
                          }
                          @media (min-width: 640px) {
                            .tl-category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                          }
                          @media (min-width: 1024px) {
                            .tl-category-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
                          }
                          @media (min-width: 1280px) {
                            .tl-category-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
                          }
                          .tl-category-item {
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            padding: 8px 10px;
                            border-radius: 6px;
                            border: 1px solid rgba(0,0,0,0.04);
                            background: #fff;
                          }
                          .tl-category-item .tl-item-left { flex: 1 1 auto; margin-right: 12px; }
                          .tl-category-item .tl-item-right { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
                        `}</style>
                        <div className="tl-category-grid">
                          {categoryItems[cat.id].slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((item) => (
                            <div key={item.id} className="tl-category-item">
                              <div className="tl-item-left" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {multiSelectMode && (
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${item.name}`}
                                    checked={selectedItems.has(item.id)}
                                    onChange={(e) => {
                                      const checked = (e.currentTarget as HTMLInputElement).checked;
                                      setSelectedItems(prev => {
                                        const copy = new Set(prev);
                                        if (checked) copy.add(item.id); else copy.delete(item.id);
                                        return copy;
                                      });
                                    }}
                                  />
                                )}
                                <div>
                                  <Text>{item.name}</Text>
                                  {itemMembers[item.id] && itemMembers[item.id].length > 0 && (
                                    <Text c="dimmed" size="sm">{itemMembers[item.id].map((m: any) => m.name).join(', ')}</Text>
                                  )}
                                </div>
                              </div>
                              <div className="tl-item-right">
                                <ActionIcon color="blue" variant="light" onClick={() => { setEditMasterItemId(item.id); setShowEditDrawer(true); }} title="Edit item">
                                  <IconEdit size={16} />
                                </ActionIcon>
                                <ConfirmDelete
                                  title="Delete item"
                                  confirmText="Delete item?"
                                  onConfirm={async () => {
                                    const res = await deleteItem(item.id);
                                    if (res.response.ok) {
                                      setCategoryItems(prev => ({
                                        ...prev,
                                        [cat.id]: (prev[cat.id] || []).filter(i => i.id !== item.id),
                                      }));
                                      setItems(prev => prev.filter(i => i.id !== item.id));
                                      bumpRefresh();
                                    } else {
                                      // basic error feedback; project uses notifications elsewhere
                                      alert('Failed to delete item: ' + (res.data?.error || res.response.statusText));
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <Text c="dimmed">No items in this category</Text>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 16 }}>
                      <ConfirmDelete onConfirm={() => handleDelete(cat.id)} title="Delete category" />
                    </div>
                  </Card>
                </Tabs.Panel>
              ))}
            </Tabs>
            {/* AddItemsDrawer removed: Add now opens ItemEditDrawer in create mode with category pre-selected */}
            <BulkEditDrawer
              opened={showBulkEdit}
              onClose={() => setShowBulkEdit(false)}
              itemIds={Array.from(selectedItems)}
              familyId={familyId}
              initialCategoryId={selectedTab || undefined}
              onApplied={async () => {
                await fetchCategoryItems();
                setSelectedItems(new Set());
                setShowBulkEdit(false);
                bumpRefresh();
              }}
            />

            <ItemEditDrawer
              opened={showEditDrawer}
              onClose={() => { setShowEditDrawer(false); setEditMasterItemId(null); }}
              masterItemId={editMasterItemId || undefined}
              // When creating, pass explicit empty initialName so the textbox is cleared
              initialName={editMasterItemId ? (items.find(i => i.id === editMasterItemId)?.name) : ''}
              familyId={familyId}
              initialCategoryId={showAddPaneForCategory.open ? showAddPaneForCategory.categoryId : undefined}
              initialMembers={lastSelectedMembers}
              initialWhole={lastSelectedWhole}
              onSaved={async (payload) => {
                // When an item is created, payload may include members/whole to persist
                if (payload && (payload as any).members) {
                  setLastSelectedMembers((payload as any).members || []);
                }
                if (payload && typeof (payload as any).whole !== 'undefined') {
                  setLastSelectedWhole(!!(payload as any).whole);
                }
                await fetchCategoryItems();
                // keep the drawer open for additional creations; do not close here
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
