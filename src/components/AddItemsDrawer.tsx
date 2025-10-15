import { useEffect, useState } from 'react';
import { Drawer, Button, Group, Text, Checkbox, Loader } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import ItemEditDrawer from './ItemEditDrawer';
import { getItems } from '../api';
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
}

export default function AddItemsDrawer({ opened, onClose, familyId, excludedItemIds = [], onApply, title = 'Add Items', showIsOneOffCheckbox = true, autoApplyOnCreate = false }: Props) {
  const [allItems, setAllItems] = useState<any[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEditItemDrawer, setShowEditItemDrawer] = useState(false);
  const [editTargetItem, setEditTargetItem] = useState<any | null>(null);

  const loadItems = async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const res = await getItems(familyId);
      if (res.response.ok) {
        const items = res.data.items || [];
        const filtered = items.filter((it: any) => !excludedItemIds.includes(it.id));
        setAllItems(filtered);
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
                {allItems.length === 0 ? (
                  <Text c="dimmed">No available items</Text>
                ) : (
                  allItems.map(it => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Checkbox checked={selectedToAdd.includes(it.id)} onChange={(e) => {
                          const checked = e.currentTarget.checked;
                          setSelectedToAdd(prev => checked ? [...prev, it.id] : prev.filter(x => x !== it.id));
                        }} />
                        <div>
                          <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</Text>
                        </div>
                      </div>
                      <div />
                    </div>
                  ))
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
        showNameField={true}
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
