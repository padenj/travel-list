import { useEffect, useState } from 'react';
import { Button, TextInput, Textarea, Group, Modal, Checkbox, Stack, Tabs, Card, Title, Text, List, ActionIcon } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  assignCategoryToTemplate,
  assignItemToTemplate,
  getCategories,
  getItems,
  getCategoriesForTemplate,
  getItemsForTemplate,
  getItemsForCategory,
  removeItemFromTemplate,
  removeCategoryFromTemplate
} from '../api';
import { getMembersForItem } from '../api';
import { getCurrentUserProfile } from '../api';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { useRefresh } from '../contexts/RefreshContext';
import { IconEdit, IconTrash, IconPlus, IconX } from '@tabler/icons-react';
import AddItemsDrawer from './AddItemsDrawer';
import ItemEditDrawer from './ItemEditDrawer';

type Template = {
  id: string;
  name: string;
  description?: string;
};
type Category = { id: string; name: string };
type Item = { id: string; name: string };

export default function TemplateManager() {

  const navigate = useNavigate();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; description: string; categories: string[]; items: string[] }>({ name: '', description: '', categories: [], items: [] });
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [templateDetails, setTemplateDetails] = useState<{ [templateId: string]: { categories: Category[]; items: Item[]; categoryItems: { [categoryId: string]: Item[] } } }>({});
  // addItemValue removed; AddItemsDrawer will handle creating/selecting items
  const [showAddItemsDrawer, setShowAddItemsDrawer] = useState<{ open: boolean; templateId?: string }>({ open: false });
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [editMasterItemId, setEditMasterItemId] = useState<string | null>(null);
  const [itemMembers, setItemMembers] = useState<{ [itemId: string]: { id: string; name: string }[] }>({});
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateNameDraft, setEditingTemplateNameDraft] = useState<string>('');
  const [showAddCategoryModal, setShowAddCategoryModal] = useState<{ open: boolean; templateId?: string }>({ open: false });
  const [addCategorySelections, setAddCategorySelections] = useState<string[]>([]);

  const { impersonatingFamilyId } = useImpersonation();
  const { refreshKey } = useRefresh();

  useEffect(() => {
    async function fetchFamilyIdAndData() {
      // prefer impersonation id if present
      let fid = impersonatingFamilyId;
      if (!fid) {
        const profileRes = await getCurrentUserProfile();
        if (profileRes.response.ok && profileRes.data.family) {
          fid = profileRes.data.family.id;
        }
      }
      if (fid) {
        setFamilyId(fid);
        const templatesRes = await getTemplates(fid);
        const templates = templatesRes.data?.templates || [];
  setTemplates(templates);
  getCategories(fid).then(res => setCategories((res.data?.categories || []).slice().sort((a: Category, b: Category) => (a.name || '').localeCompare(b.name || ''))));
        getItems(fid).then(res => setItems(res.data?.items || []));
        const details = await loadTemplateDetails(templates);
        await fetchMembersForDetails(details);
      }
    }
    fetchFamilyIdAndData();
  }, [impersonatingFamilyId, refreshKey]);

  const loadTemplateDetails = async (templateList: Template[]) => {
    const details: { [templateId: string]: { categories: Category[]; items: Item[]; categoryItems: { [categoryId: string]: Item[] } } } = {};
    for (const template of templateList) {
      try {
        const [catRes, itemRes] = await Promise.all([
          getCategoriesForTemplate(template.id),
          getItemsForTemplate(template.id)
        ]);
  const templateCategories = catRes.response.ok && catRes.data ? catRes.data.categories : [];
  // sort categories alphabetically
  const sortedTemplateCategories = (templateCategories || []).slice().sort((a: Category, b: Category) => (a.name || '').localeCompare(b.name || ''));
        const templateItems = itemRes.response.ok && itemRes.data ? itemRes.data.items : [];
        // Get items for each category
        const categoryItems: { [categoryId: string]: Item[] } = {};
        for (const category of templateCategories) {
          try {
            const categoryItemsRes = await getItemsForCategory(category.id);
            if (categoryItemsRes.response.ok && categoryItemsRes.data && categoryItemsRes.data.items) {
              // sort category items alphabetically by name
              categoryItems[category.id] = (categoryItemsRes.data.items || []).slice().sort((a: Item, b: Item) => (a.name || '').localeCompare(b.name || ''));
            } else {
              categoryItems[category.id] = [];
            }
          } catch (e) {
            categoryItems[category.id] = [];
          }
        }
        // sort template-level items alphabetically as well
        const sortedTemplateItems = (templateItems || []).slice().sort((a: Item, b: Item) => (a.name || '').localeCompare(b.name || ''));
        details[template.id] = {
          categories: sortedTemplateCategories,
          items: sortedTemplateItems,
          categoryItems
        };
      } catch (e) {
        details[template.id] = { categories: [], items: [], categoryItems: {} };
      }
    }
    setTemplateDetails(details);
    return details;
  };

  const fetchMembersForDetails = async (detailsParam?: { [templateId: string]: { categories: Category[]; items: Item[]; categoryItems: { [categoryId: string]: Item[] } } }) => {
    const details = detailsParam || templateDetails;
    const ids = new Set<string>();
    for (const tid of Object.keys(details || {})) {
      const d = details[tid];
      (d.items || []).forEach(i => ids.add(i.id));
      for (const cid of Object.keys(d.categoryItems || {})) {
        (d.categoryItems[cid] || []).forEach(i => ids.add(i.id));
      }
    }
    const map: { [itemId: string]: { id: string; name: string }[] } = {};
    await Promise.all(Array.from(ids).map(async (itemId) => {
      try {
        const res = await getMembersForItem(itemId);
        if (res.response.ok) map[itemId] = Array.isArray(res.data) ? res.data : (res.data?.members || []);
        else map[itemId] = [];
      } catch (e) {
        map[itemId] = [];
      }
    }));
    setItemMembers(map);
  };


  const openCreateModal = () => {
    setForm({ name: '', description: '', categories: [], items: [] });
    setSelectedTemplate(null);
    setModalOpen(true);
  };

  // editing via inline controls; the full modal is still used for creating new templates


  const handleSave = async () => {
    if (!form.name.trim() || !familyId) return;
    let templateId: string;
    if (selectedTemplate) {
      await updateTemplate(selectedTemplate.id, {
        name: form.name,
        description: form.description,
      });
      templateId = selectedTemplate.id;
    } else {
      const createRes = await createTemplate(familyId, form.name, form.description);
      templateId = createRes.data?.template?.id;
    }
    // Assign categories/items
    for (const catId of form.categories) {
      await assignCategoryToTemplate(templateId, catId);
    }
    for (const itemId of form.items) {
      await assignItemToTemplate(templateId, itemId);
    }
    setModalOpen(false);
    if (familyId) {
      const templatesRes = await getTemplates(familyId);
      const updatedTemplates = templatesRes.data?.templates || [];
      setTemplates(updatedTemplates);
      await loadTemplateDetails(updatedTemplates);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteTemplate(id);
    if (familyId) {
      const templatesRes = await getTemplates(familyId);
      const updatedTemplates = templatesRes.data?.templates || [];
      setTemplates(updatedTemplates);
      await loadTemplateDetails(updatedTemplates);
    }
  };

  // Add individual item to template (existing or new)
  async function handleAddIndividualItem(templateId: string) {
    // open AddItemsDrawer for this template
    setShowAddItemsDrawer({ open: true, templateId });
  }

  // Prepare excluded item ids for the AddItemsDrawer in a clear, typed local variable
  const excludedItemIdsForDrawer: string[] = (() => {
    if (!showAddItemsDrawer.open || !showAddItemsDrawer.templateId) return [];
    const tid = showAddItemsDrawer.templateId;
    const details = templateDetails[tid] || { categories: [], items: [], categoryItems: {} };
    const itemIds = (details.items || []).map(i => i.id);
    const categoryItemIds = (details.categories || []).flatMap(c => (details.categoryItems[c.id] || []).map(i => i.id));
    // dedupe just in case
    return Array.from(new Set([...itemIds, ...categoryItemIds]));
  })();

  return (
    <div>
      <Group justify="space-between" mb="xl">
        <Title order={2}>Item Groups</Title>
        <Button onClick={openCreateModal}>New Item Group</Button>
      </Group>
      
      {templates.length === 0 ? (
        <Text c="dimmed">No item groups yet. Create your first item group!</Text>
      ) : (
        <Tabs defaultValue={templates[0]?.id}>
          <Tabs.List>
            {templates.map(t => (
              <Tabs.Tab key={t.id} value={t.id}>{t.name}</Tabs.Tab>
            ))}
          </Tabs.List>
          {templates.map(template => (
            <Tabs.Panel key={template.id} value={template.id}>
              <Card withBorder mt="md" style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 220px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 12px)' }}>
                {(() => {
                  const details = templateDetails[template.id] || { categories: [], items: [], categoryItems: {} };
                  return (
                <>
                <Group justify="space-between" mb="md">
                  <div>
                    {editingTemplateId === template.id ? (
                      <Group>
                        <TextInput value={editingTemplateNameDraft} onChange={e => setEditingTemplateNameDraft(e.target.value)} size="sm" />
                        <ActionIcon color="green" variant="light" onClick={async () => {
                          if (!editingTemplateId) return;
                          const newName = editingTemplateNameDraft.trim();
                          if (!newName) return;
                          await updateTemplate(editingTemplateId, { name: newName });
                          // refresh templates list and details
                          if (familyId) {
                            const templatesRes = await getTemplates(familyId);
                            const updatedTemplates = templatesRes.data?.templates || [];
                            setTemplates(updatedTemplates);
                            await loadTemplateDetails(updatedTemplates);
                          }
                          setEditingTemplateId(null);
                          setEditingTemplateNameDraft('');
                        }}>
                          <IconEdit size={16} />
                        </ActionIcon>
                        <ActionIcon color="gray" variant="light" onClick={() => { setEditingTemplateId(null); setEditingTemplateNameDraft(''); }}>
                          <IconX size={16} />
                        </ActionIcon>
                      </Group>
                    ) : (
                      <Group>
                        <Title order={3}>{template.name}</Title>
                        {template.description && <Text c="dimmed">{template.description}</Text>}
                        <ActionIcon color="blue" variant="light" onClick={() => { setEditingTemplateId(template.id); setEditingTemplateNameDraft(template.name || ''); }}>
                          <IconEdit size={16} />
                        </ActionIcon>
                      </Group>
                    )}
                  </div>
                  <div />
                </Group>
                      <Stack style={{ flex: 1, overflow: 'auto' }}>
                        <div>
                            <Group style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <Title order={4} mb="sm">Categories & Items</Title>
                            <Button size="xs" variant="outline" onClick={() => setShowAddCategoryModal({ open: true, templateId: template.id })}>Add category</Button>
                          </Group>
                          {details.categories.length > 0 ? (
                            details.categories.map(category => (
                              <Card key={category.id} withBorder mb="sm">
                                <Group style={{ justifyContent: 'space-between', alignItems: 'center' }} mb="xs">
                                  <Text fw={500}>{category.name}</Text>
                                  <Group>
                                    <ActionIcon color="blue" variant="light" onClick={() => navigate(`/categories?open=${category.id}`)}>
                                      <IconEdit size={16} />
                                    </ActionIcon>
                                    <ActionIcon color="red" variant="light" onClick={async () => {
                                      // remove category from template
                                      try {
                                        await removeCategoryFromTemplate(template.id, category.id);
                                      } catch (e) {
                                        // ignore
                                      }
                                      setTemplateDetails(prev => ({
                                        ...prev,
                                        [template.id]: {
                                          ...prev[template.id],
                                          categories: prev[template.id].categories.filter(c => c.id !== category.id),
                                          categoryItems: Object.fromEntries(Object.entries(prev[template.id].categoryItems).filter(([k]) => k !== category.id))
                                        }
                                      }));
                                    }}>
                                      <IconTrash size={16} />
                                    </ActionIcon>
                                  </Group>
                                </Group>
                                <List size="sm">
                                  {details.categoryItems[category.id]?.map(item => (
                                    <List.Item key={item.id}>
                                      <Group justify="space-between">
                                        <Text>{item.name}</Text>
                                        <Text c="dimmed" size="sm">{(itemMembers[item.id] || []).map(m => m.name).join(', ')}</Text>
                                      </Group>
                                    </List.Item>
                                  )) || <List.Item><Text c="dimmed">No items in this category</Text></List.Item>}
                                </List>
                              </Card>
                            ))
                          ) : (
                            <Text c="dimmed">No categories on this template</Text>
                          )}
                        </div>
                        <div>
                          <Group style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <Title order={4} mb="sm">Individual Items</Title>
                            <Button size="xs" leftSection={<IconPlus size={16} />} onClick={() => handleAddIndividualItem(template.id)}>Add Item</Button>
                          </Group>
                          <List mb="md">
                                  {details.items && details.items.length > 0 ? (
                              details.items.map(item => (
                                <List.Item key={item.id}>
                                  <Group justify="space-between">
                                    <Text>{item.name}</Text>
                                    <Group>
                                      <Text c="dimmed" size="sm">{(itemMembers[item.id] || []).map(m => m.name).join(', ')}</Text>
                                      <ActionIcon color="blue" variant="light" onClick={() => { setEditMasterItemId(item.id); setShowEditDrawer(true); }}>
                                        <IconEdit size={16} />
                                      </ActionIcon>
                                      <ActionIcon color="red" variant="light" onClick={async () => {
                                        await removeItemFromTemplate(template.id, item.id);
                                        setTemplateDetails(prev => ({
                                          ...prev,
                                          [template.id]: {
                                            ...prev[template.id],
                                            items: prev[template.id].items.filter(i => i.id !== item.id)
                                          }
                                        }));
                                      }}>
                                        <IconTrash size={16} />
                                      </ActionIcon>
                                    </Group>
                                  </Group>
                                </List.Item>
                              ))
                            ) : (
                              <List.Item><Text c="dimmed">No individual items</Text></List.Item>
                            )}
                          </List>
                          {/* moved Add Item button to header */}
                        </div>
                        {(details.categories.length === 0 && (!details.items || details.items.length === 0)) && (
                    <Text c="dimmed">This item group has no categories or items assigned yet.</Text>
                        )}
            </Stack>
        </>
          );
        })()}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <ActionIcon color="red" variant="light" onClick={() => handleDelete(template.id)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </div>
                </Card>

                <Modal opened={showAddCategoryModal.open && showAddCategoryModal.templateId === template.id} onClose={() => setShowAddCategoryModal({ open: false })} title="Add category to item group">
                  <div>
                      <Text mb="sm">Select categories to add to this item group:</Text>
                    <Stack>
                      {categories.map(c => (
                        <Checkbox key={c.id} label={c.name} checked={addCategorySelections.includes(c.id)} onChange={e => {
                          const checked = e.target.checked;
                          setAddCategorySelections(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id));
                        }} />
                      ))}
                    </Stack>
                    <Group mt="md">
                      <Button onClick={async () => {
                        const tid = showAddCategoryModal.templateId;
                        if (!tid) return;
                        for (const cid of addCategorySelections) {
                          await assignCategoryToTemplate(tid, cid);
                        }
                        // reload template details
                        if (familyId) {
                          const templatesRes = await getTemplates(familyId);
                          const updatedTemplates = templatesRes.data?.templates || [];
                          setTemplates(updatedTemplates);
                          await loadTemplateDetails(updatedTemplates);
                          await fetchMembersForDetails();
                        }
                        setAddCategorySelections([]);
                setShowAddCategoryModal({ open: false });
                      }}>Add</Button>
                      <Button variant="outline" onClick={() => { setAddCategorySelections([]); setShowAddCategoryModal({ open: false }); }}>Cancel</Button>
                    </Group>
                  </div>
                </Modal>
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={selectedTemplate ? 'Edit Item Group' : 'New Item Group'}>
        <TextInput
          label="Item Group Name"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />
        <Textarea
          label="Description"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
        <Stack>
          <div>
            <b>Categories</b>
            <Group>
              {categories.map(c => (
                <Checkbox
                  key={c.id}
                  label={c.name}
                  checked={form.categories ? form.categories.includes(c.id) : false}
                  onChange={e => {
                    const checked = e.target.checked;
                    setForm(f => ({
                      ...f,
                      categories: checked
                        ? [...(f.categories || []), c.id]
                        : (f.categories || []).filter(id => id !== c.id)
                    }));
                  }}
                />
              ))}
            </Group>
          </div>
          <div>
            <b>Items</b>
            <Group>
              {items.map(i => (
                <Checkbox
                  key={i.id}
                  label={i.name}
                  checked={form.items ? form.items.includes(i.id) : false}
                  onChange={e => {
                    const checked = e.target.checked;
                    setForm(f => ({
                      ...f,
                      items: checked
                        ? [...(f.items || []), i.id]
                        : (f.items || []).filter(id => id !== i.id)
                    }));
                  }}
                />
              ))}
            </Group>
          </div>
        </Stack>
        <Group mt="md">
          <Button onClick={handleSave}>{selectedTemplate ? 'Update' : 'Create'}</Button>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
        </Group>
      </Modal>
      <AddItemsDrawer
        opened={showAddItemsDrawer.open}
        onClose={() => setShowAddItemsDrawer({ open: false })}
        familyId={familyId}
        excludedItemIds={excludedItemIdsForDrawer}
        showIsOneOffCheckbox={false}
        autoApplyOnCreate={true}
        onApply={async (ids: string[]) => {
          const tid = showAddItemsDrawer.templateId;
          if (!tid) return;
          // assign items to template on the server
          for (const id of ids) {
            await assignItemToTemplate(tid, id);
          }
          // reload template items from server to ensure we have up-to-date metadata
          try {
            const itemRes = await getItemsForTemplate(tid);
            if (itemRes.response.ok && itemRes.data && itemRes.data.items) {
              // sort items alphabetically before setting
              const sorted = (itemRes.data.items || []).slice().sort((a: Item, b: Item) => (a.name || '').localeCompare(b.name || ''));
              setTemplateDetails(prev => ({
                ...prev,
                [tid]: {
                  ...prev[tid],
                  items: sorted
                }
              }));
            }
          } catch (e) {
            // fallback: try to append by id lookup in master items list
            for (const id of ids) {
              const it = items.find(i => i.id === id);
              if (it) {
                setTemplateDetails(prev => {
                  const merged = [...(prev[tid].items || []), it].slice().sort((a: Item, b: Item) => (a.name || '').localeCompare(b.name || ''));
                  return ({
                    ...prev,
                    [tid]: {
                      ...prev[tid],
                      items: merged
                    }
                  });
                });
              }
            }
          }
          setShowAddItemsDrawer({ open: false });
        }}
        title="Add items to template"
      />
      <ItemEditDrawer
        opened={showEditDrawer}
        onClose={() => { setShowEditDrawer(false); setEditMasterItemId(null); }}
        masterItemId={editMasterItemId || undefined}
        familyId={familyId}
        
        onSaved={async () => {
          try {
            await loadTemplateDetails(templates);
          } catch (e) {
            // ignore
          }
          setShowEditDrawer(false);
          setEditMasterItemId(null);
        }}
        showIsOneOffCheckbox={false}
      />
    </div>
  );
}
