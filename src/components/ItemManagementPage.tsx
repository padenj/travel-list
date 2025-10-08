import React, { useEffect, useState } from 'react';
import { getItems, deleteItem } from '../api';
import { Card, Title, Stack, Group, Button, Loader, ActionIcon, Text, Modal } from '@mantine/core';
import { IconTrash, IconEdit, IconPlus } from '@tabler/icons-react';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { useRefresh } from '../contexts/RefreshContext';
import ItemEditDrawer from './ItemEditDrawer';

export default function ItemManagementPage(): React.ReactElement {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState<string | null>(null);
  // Drawer edit state (replaces inline editing)
  const [showItemDrawer, setShowItemDrawer] = useState(false);
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);
  const [drawerName, setDrawerName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { impersonatingFamilyId } = useImpersonation();
  const { bumpRefresh } = useRefresh();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // prefer impersonation family id over current profile
      let fid = impersonatingFamilyId;
      if (!fid) {
        const profileRes = await import('../api').then(m => m.getCurrentUserProfile());
        if (profileRes.response.ok && profileRes.data.family) {
          fid = profileRes.data.family.id;
        }
      }
      if (fid) {
        setFamilyId(fid);
        const itemRes = await getItems(fid);
        if (itemRes.response.ok) setItems(itemRes.data.items || []);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  // Remove unused effect

  const handleAdd = async () => {
    // Open the item edit drawer to create a new item via the drawer flow
    setDrawerItemId(null);
    setDrawerName('');
    setShowItemDrawer(true);
  };

  const openItemDrawer = (id: string) => {
    const item = items.find(it => it.id === id);
    setDrawerItemId(id);
    setDrawerName(item ? item.name : '');
    setShowItemDrawer(true);
  };

  const closeItemDrawer = () => {
    setShowItemDrawer(false);
    setDrawerItemId(null);
    setDrawerName('');
  };

  const handleItemSaved = async (payload?: { id?: string; name?: string }) => {
    try {
      // If a new item was created, payload.id will be present
      if (payload?.id) {
        setItems(prev => [...prev, { id: payload.id as string, name: payload.name || 'New Item' }]);
      } else if (drawerItemId && payload?.name) {
        // existing item updated
        setItems(prev => prev.map(it => it.id === drawerItemId ? { ...it, name: payload.name as string } : it));
      }
      // refresh maps by triggering a data reload
      bumpRefresh();
    } finally {
      closeItemDrawer();
    }
  };

  const handleDeleteConfirmed = async (id: string) => {
    const res = await deleteItem(id);
    if (res.response.ok) {
      setItems(items.filter(item => item.id !== id));
      bumpRefresh();
    } else {
      // show error notification via window alert fallback
      alert('Failed to delete item');
    }
    setConfirmOpen(false);
    setConfirmDeleteId(null);
  };

  const promptDelete = (id: string) => {
    setConfirmDeleteId(id);
    setConfirmOpen(true);
  };

  // category changes are handled through the drawer save flow now

  if (loading) return <Loader />;

  return (
    <Card withBorder>
      <Title order={3} mb="md">Manage Items</Title>
      <Stack>
        <Group>
          <Button leftSection={<IconPlus size={16} />} onClick={handleAdd}>
            Add
          </Button>
        </Group>
        {items.length === 0 ? (
          <Text c="dimmed">No items yet.</Text>
        ) : (
          items.map(item => (
            <Group key={item.id}>
              <Text style={{ flex: '1 1 auto' }}>{item.name}</Text>
              <ActionIcon color="blue" variant="light" onClick={() => openItemDrawer(item.id)}>
                <IconEdit size={16} />
              </ActionIcon>
              <ActionIcon color="red" variant="light" onClick={() => promptDelete(item.id)}>
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))
        )}
      </Stack>
      <Modal opened={confirmOpen} onClose={() => setConfirmOpen(false)} title="Delete item from master list" centered>
        <div>
          <Text mb="md">Deleting this item will remove it from all packing lists. This cannot be undone. Are you sure you want to continue?</Text>
          <Group style={{ justifyContent: 'flex-end' }}>
            <Button variant="default" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button color="red" onClick={() => confirmDeleteId && handleDeleteConfirmed(confirmDeleteId)}>Delete</Button>
          </Group>
        </div>
      </Modal>
      <ItemEditDrawer
        opened={showItemDrawer}
        onClose={closeItemDrawer}
        masterItemId={drawerItemId}
        initialName={drawerName}
        familyId={familyId}
        showNameField={true}
        onSaved={handleItemSaved}
      />
    </Card>
  );
}
