import React, { useState } from 'react';
import { Container, Title, Group, Button, Modal, TextInput } from '@mantine/core';
import ManagePackingLists from './ManagePackingLists';
import { getCurrentUserProfile, createPackingList } from '../api';
import { showNotification } from '@mantine/notifications';
import { useActivePackingList } from '../contexts/ActivePackingListContext';

export default function PackingListPage(): React.ReactElement {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);
  const { refreshLists, requestOpenEdit } = useActivePackingList();

  const createNewList = async () => {
    setCreating(true);
    try {
      const profile = await getCurrentUserProfile();
      const fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
      if (!fid) throw new Error('No family');
      if (!newListName) return;
      const result = await createPackingList(fid, newListName);
      if (result.response.ok && result.data.list) {
        const createdList = result.data.list;
        showNotification({ title: 'Created', message: 'Packing list created', color: 'green' });
        setShowCreateModal(false);
        setNewListName('');
        try { await refreshLists(); } catch {}
        if (createdList && requestOpenEdit) requestOpenEdit(createdList.id);
      }
    } catch (err) {
      showNotification({ title: 'Error', message: String(err), color: 'red' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Container size="lg">
      <Title order={2} mb="lg">Packing Lists</Title>
      <Group mb="md" style={{ justifyContent: 'space-between' }}>
        <div />
        <Button onClick={() => setShowCreateModal(true)}>New List</Button>
      </Group>

      <ManagePackingLists />

      <Modal opened={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Packing List">
        <TextInput placeholder="List name" value={newListName} onChange={(e) => setNewListName(e.currentTarget.value)} />
        <Group justify="right" mt="md">
          <Button variant="default" onClick={() => setShowCreateModal(false)} disabled={creating}>Cancel</Button>
          <Button onClick={createNewList} loading={creating}>Create</Button>
        </Group>
      </Modal>
    </Container>
  );
}
