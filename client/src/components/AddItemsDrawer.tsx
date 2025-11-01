import { useEffect, useState } from 'react';
import { Drawer, Button, Group, Text, Checkbox, Loader, Divider } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import ItemEditDrawer from './ItemEditDrawer';
import { getItems, getCategories } from '../api';
import { showNotification } from '@mantine/notifications';

interface Props {
  opened: boolean;
  onClose: () => void;
  familyId: string | null | undefined;
  excludedItemIds?: string[]; // items already present in target
  onApply: (selectedItemIds: string[]) => Promise<void>;
  title?: string;
  showIsOneOffCheckbox?: boolean;
  autoApplyOnCreate?: boolean;
  // when true, show a checkbox that toggles whether items already assigned to other categories are visible
  showAssignedItemsToggle?: boolean;
  // when adding to a specific category, provide the target category id so the drawer can indicate when
  // an item is assigned to another category (and display the warning)
  targetCategoryId?: string | null;
}

export default function AddItemsDrawer({ opened, onClose, familyId, excludedItemIds = [], onApply, title = 'Add Items', showIsOneOffCheckbox = true, autoApplyOnCreate = false, showAssignedItemsToggle = false, targetCategoryId = null }: Props) {
  const [allItems, setAllItems] = useState<any[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEditItemDrawer, setShowEditItemDrawer] = useState(false);
  const [editTargetItem, setEditTargetItem] = useState<any | null>(null);
  const [itemCategoriesMap, setItemCategoriesMap] = useState<Record<string, any[]>>({});
  const [showAssigned, setShowAssigned] = useState(false);

  const loadItems = async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const res = await getItems(familyId);
      if (res.response.ok) {
        const items = res.data.items || [];
        // alphabetize master item list
        const sorted = (items || []).slice().sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        const filtered = sorted.filter((it: any) => !excludedItemIds.includes(it.id));
        setAllItems(filtered);
        // Build a map of categories for quick lookup: fetch family's category list once
        const categoriesRes = await getCategories(familyId);
        const catMap: Record<string, any> = {};
        if (categoriesRes.response.ok && categoriesRes.data && Array.isArray(categoriesRes.data.categories)) {
          for (const c of categoriesRes.data.categories) catMap[c.id] = c;
        }
        // Use items' categoryId field (single-category model). Create per-item category arrays for compatibility with existing UI where needed.
        const map: Record<string, any[]> = {};
        for (const it of filtered) {
          if (it.categoryId && catMap[it.categoryId]) map[it.id] = [catMap[it.categoryId]];
          else map[it.id] = [];
        }
        setItemCategoriesMap(map);
      }
    } catch (e) {
      console.error('Failed to load items for AddItemsDrawer', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opened) loadItems();
  }, [opened, familyId, excludedItemIds.join(',')]);

  const apply = async () => {
    if (selectedToAdd.length === 0) {
      onClose();
      return;
    }
    try {
      await onApply(selectedToAdd);
      showNotification({ title: 'Added', message: 'Items added', color: 'green' });
      setSelectedToAdd([]);
      onClose();
    } catch (e) {
      console.error('Failed to add items from AddItemsDrawer', e);
      showNotification({ title: 'Failed', message: 'Failed to add items', color: 'red' });
    }
  };

  return (
    <>
      <Drawer opened={opened} onClose={onClose} title={title} position="right" size={420} padding="md">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Group style={{ marginBottom: 8 }}>
            <Button variant="default" size="xs" onClick={onClose}>Cancel</Button>
            <Button size="xs" leftSection={<IconPlus size={16} />} onClick={() => {
              setEditTargetItem({ itemId: null, name: '' });
              setShowEditItemDrawer(true);
            }}>New Item</Button>
            <div style={{ flex: '1 1 auto' }} />
            <Button size="xs" onClick={apply}>Apply</Button>
          </Group>

          <div style={{ overflow: 'auto', flex: '1 1 auto', paddingTop: 8 }}>
            {loading ? <Loader /> : (
              <div>
                {/* optional toggle to show items that are already assigned to other categories */}
                {showAssignedItemsToggle && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Checkbox label="Show items assigned to other categories" checked={showAssigned} onChange={(e) => setShowAssigned(e.currentTarget.checked)} aria-label="Show items assigned to other categories" />
                    </div>
                    <Divider my="sm" />
                  </div>
                )}
                {allItems.length === 0 ? (
                  <Text c="dimmed">No available items</Text>
                ) : (
                  (() => {
                    // if showAssignedItemsToggle prop exists on props, we need to read it from the component args
                    // because props were destructured in the function signature, we can re-access via arguments.callee not available;
                    // instead, rely on target props passed via a local variable by reading from the DOM — simpler approach:
                    // We'll check for the presence of targetCategoryId on the props by reading the default param values above.
                    return (
                      <div>
                        {/* If the caller expects the assigned-items toggle, show it */}
                        {typeof ("" as any) /* dummy */ === 'undefined' ? null : null}
                        {/* Build visible list based on showAssigned and fetched category map */}
                        {(() => {
                          // default to showing all when no toggle is used
                          const visible = allItems.filter(it => {
                            const cats = itemCategoriesMap[it.id] || [];
                            if (showAssignedItemsToggle && !showAssigned) {
                              // only show unassigned items
                              return (!cats || cats.length === 0);
                            }
                            return true;
                          }).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

                          if (visible.length === 0) {
                            if (!showAssigned) return <Text c="dimmed">No existing unassigned items</Text>;
                            return <Text c="dimmed">No available items</Text>;
                          }

                          return visible.map(it => {
                            const cats = itemCategoriesMap[it.id] || [];
                            const assignedCategory = cats.length > 0 ? cats[0] : null;
                            const assignedOther = assignedCategory && targetCategoryId && assignedCategory.id !== targetCategoryId;
                            return (
                              <div key={it.id} style={{ display: 'flex', flexDirection: 'column', padding: '6px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <Checkbox checked={selectedToAdd.includes(it.id)} onChange={(e) => {
                                      const checked = e.currentTarget.checked;
                                      setSelectedToAdd(prev => checked ? [...prev, it.id] : prev.filter(x => x !== it.id));
                                    }} />
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                                      <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</Text>
                                      {assignedCategory && (
                                        <Text c="dimmed" size="sm" style={{ marginLeft: 6 }}>- {assignedCategory.name}</Text>
                                      )}
                                    </div>
                                  </div>
                                  <div />
                                </div>
                                {selectedToAdd.includes(it.id) && assignedOther && (
                                  <Text color="red" size="sm" style={{ marginLeft: 36, marginTop: 4 }}>This item will be moved from it's current category to this category</Text>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    );
                  })()
                )}
              </div>
            )}
          </div>
        </div>
      </Drawer>

      <ItemEditDrawer
        opened={showEditItemDrawer}
        onClose={() => { setShowEditItemDrawer(false); setEditTargetItem(null); }}
        masterItemId={editTargetItem?.itemId}
        initialName={editTargetItem?.name}
        familyId={familyId}
        showIsOneOffCheckbox={showIsOneOffCheckbox}
        onSaved={async (payload) => {
          // reload items and auto-select the created item so the user can add it
          try {
            await loadItems();
            const createdId = payload && (payload as any).id;
            if (createdId) {
              setSelectedToAdd(prev => Array.from(new Set([...prev, createdId])));
              if (autoApplyOnCreate) {
                // auto-apply the created item immediately
                try {
                  await onApply([createdId]);
                } catch (e) {
                  console.error('Auto-apply failed', e);
                }
              }
            }
          } catch (e) {
            // ignore
          }
        }}
        zIndex={3000}
      />
    </>
  );
}
