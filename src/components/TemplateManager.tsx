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
  removeItemFromTemplate
} from '../api';
import { getCurrentUserProfile } from '../api';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { useRefresh } from '../contexts/RefreshContext';
import { IconEdit, IconTrash, IconPlus, IconX } from '@tabler/icons-react';
import AddItemsDrawer from './AddItemsDrawer';

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
        getCategories(fid).then(res => setCategories(res.data?.categories || []));
        getItems(fid).then(res => setItems(res.data?.items || []));
        await loadTemplateDetails(templates);
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
        const templateItems = itemRes.response.ok && itemRes.data ? itemRes.data.items : [];
        // Get items for each category
        const categoryItems: { [categoryId: string]: Item[] } = {};
        for (const category of templateCategories) {
          try {
            const categoryItemsRes = await getItemsForCategory(category.id);
            if (categoryItemsRes.response.ok && categoryItemsRes.data && categoryItemsRes.data.items) {
              categoryItems[category.id] = categoryItemsRes.data.items;
            } else {
              categoryItems[category.id] = [];
            }
          } catch (e) {
            categoryItems[category.id] = [];
          }
        }
        details[template.id] = {
          categories: templateCategories,
          items: templateItems,
          categoryItems
        };
      } catch (e) {
        details[template.id] = { categories: [], items: [], categoryItems: {} };
      }
    }
    setTemplateDetails(details);
  };


  const openCreateModal = () => {
    setForm({ name: '', description: '', categories: [], items: [] });
    setSelectedTemplate(null);
    setModalOpen(true);
  };

  const openEditModal = async (template: Template) => {
    // Reset form first to prevent stale data
    setForm({ name: template.name, description: template.description || '', categories: [], items: [] });
    setSelectedTemplate(template);
    setModalOpen(true);
    
    // Then fetch assigned data asynchronously
    let assignedCategories: string[] = [];
    let assignedItems: string[] = [];
    if (template.id) {
      try {
        const catRes = await getCategoriesForTemplate(template.id);
        if (catRes.response.ok && catRes.data && catRes.data.categories) {
          assignedCategories = catRes.data.categories.map((c: { id: string }) => c.id);
        }
      } catch (e) {
        console.warn('Failed to fetch template categories:', e);
        assignedCategories = [];
      }
      try {
        const itemRes = await getItemsForTemplate(template.id);
        if (itemRes.response.ok && itemRes.data && itemRes.data.items) {
          assignedItems = itemRes.data.items.map((i: { id: string }) => i.id);
        }
      } catch (e) {
        console.warn('Failed to fetch template items:', e);
        assignedItems = [];
      }
      
      // Update form with fetched data
      setForm(prevForm => ({
        ...prevForm,
        categories: assignedCategories,
        items: assignedItems,
      }));
    }
  };


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
        <Title order={2}>Templates</Title>
        <Button onClick={openCreateModal}>New Template</Button>
      </Group>
      
      {templates.length === 0 ? (
        <Text c="dimmed">No templates yet. Create your first template!</Text>
      ) : (
        <Tabs defaultValue={templates[0]?.id}>
          <Tabs.List>
            {templates.map(t => (
              <Tabs.Tab key={t.id} value={t.id}>{t.name}</Tabs.Tab>
            ))}
          </Tabs.List>
          {templates.map(template => (
            <Tabs.Panel key={template.id} value={template.id}>
              <Card withBorder mt="md">
                {(() => {
                  const details = templateDetails[template.id] || { categories: [], items: [], categoryItems: {} };
                  return (
                <>
                <Group justify="space-between" mb="md">
                  <div>
                    <Title order={3}>{template.name}</Title>
                    {template.description && <Text c="dimmed">{template.description}</Text>}
                  </div>
                  <Group>
                    <ActionIcon color="blue" variant="light" onClick={() => openEditModal(template)}>
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon color="red" variant="light" onClick={() => handleDelete(template.id)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
                      <Stack>
                        {details.categories.length > 0 && (
                          <div>
                            <Title order={4} mb="sm">Categories & Items</Title>
                            {details.categories.map(category => (
                              <Card key={category.id} withBorder mb="sm">
                                <Group justify="space-between" mb="xs">
                                  <Text fw={500}>{category.name}</Text>
                                  <Button size="xs" variant="light" onClick={() => navigate(`/categories?open=${category.id}`)}>
                                    Edit Category
                                  </Button>
                                </Group>
                                <List size="sm">
                                  {details.categoryItems[category.id]?.map(item => (
                                    <List.Item key={item.id}>{item.name}</List.Item>
                                  )) || <List.Item><Text c="dimmed">No items in this category</Text></List.Item>}
                                </List>
                              </Card>
                            ))}
                          </div>
                        )}
                        <div>
                          <Title order={4} mb="sm">Individual Items</Title>
                          <List mb="md">
                            {details.items && details.items.length > 0 ? (
                              details.items.map(item => (
                                <List.Item key={item.id}>
                                  <Group justify="space-between">
                                    <Text>{item.name}</Text>
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
                                      <IconX size={16} />
                                    </ActionIcon>
                                  </Group>
                                </List.Item>
                              ))
                            ) : (
                              <List.Item><Text c="dimmed">No individual items</Text></List.Item>
                            )}
                          </List>
                          <Group>
                            <Button leftSection={<IconPlus size={16} />} onClick={() => handleAddIndividualItem(template.id)}>
                              Add Item
                            </Button>
                          </Group>
                        </div>
                        {(details.categories.length === 0 && (!details.items || details.items.length === 0)) && (
                          <Text c="dimmed">This template has no categories or items assigned yet.</Text>
                        )}
            </Stack>
        </>
          );
        })()}
              </Card>
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={selectedTemplate ? 'Edit Template' : 'New Template'}>
        <TextInput
          label="Template Name"
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
              setTemplateDetails(prev => ({
                ...prev,
                [tid]: {
                  ...prev[tid],
                  items: itemRes.data.items
                }
              }));
            }
          } catch (e) {
            // fallback: try to append by id lookup in master items list
            for (const id of ids) {
              const it = items.find(i => i.id === id);
              if (it) {
                setTemplateDetails(prev => ({
                  ...prev,
                  [tid]: {
                    ...prev[tid],
                    items: [...(prev[tid].items || []), it]
                  }
                }));
              }
            }
          }
          setShowAddItemsDrawer({ open: false });
        }}
        title="Add items to template"
      />
    </div>
  );
}
