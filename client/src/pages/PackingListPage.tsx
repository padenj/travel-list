import React, { useState } from 'react';
import { Container, Title, Group, Button, Modal, TextInput } from '@mantine/core';
import ManagePackingLists from '../components/ManagePackingLists';
import { getCurrentUserProfile, createPackingList, getFamily } from '../api';
import { showNotification } from '@mantine/notifications';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import { useImpersonation } from '../contexts/ImpersonationContext';

export default function PackingListPage(): React.ReactElement {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const { refreshLists, requestOpenEdit } = useActivePackingList();
  const { impersonatingFamilyId } = useImpersonation();

  const createNewList = async () => {
    setCreating(true);
    try {
      let fid: string | null = impersonatingFamilyId;
      if (!fid) {
        const profile = await getCurrentUserProfile();
        fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
      }
      if (!fid) throw new Error('No family');
      if (!newListName) return;
      const result = await createPackingList(fid, newListName, undefined, selectedMemberIds && selectedMemberIds.length > 0 ? selectedMemberIds : undefined);
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

  // Load family members for the new-list modal
  const openCreateModal = async () => {
    setShowCreateModal(true);
    try {
      const fid = impersonatingFamilyId;
      if (fid) {
        const familyRes = await getFamily(fid);
        if (familyRes.response.ok && Array.isArray(familyRes.data.family?.members)) {
          const members = familyRes.data.family.members;
          setFamilyMembers(members);
          setSelectedMemberIds(members.map((m: any) => m.id));
        }
      } else {
        const profile = await getCurrentUserProfile();
        if (profile.response.ok && profile.data.family && Array.isArray(profile.data.family.members)) {
          setFamilyMembers(profile.data.family.members || []);
          setSelectedMemberIds((profile.data.family.members || []).map((m: any) => m.id));
        }
      }
    } catch (e) {
      setFamilyMembers([]);
      setSelectedMemberIds([]);
    }
  };

  return (
    <Container size="lg">
      <Title order={2} mb="lg">Packing Lists</Title>
      <Group mb="md" style={{ justifyContent: 'space-between' }}>
        <div />
        <Button onClick={openCreateModal}>New List</Button>
      </Group>

      <ManagePackingLists />

      <Modal opened={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Packing List">
        <TextInput placeholder="List name" value={newListName} onChange={(e) => setNewListName(e.currentTarget.value)} />
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 6 }}>Select members for this list</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {familyMembers.length === 0 ? <div style={{ color: 'rgba(0,0,0,0.45)' }}>No family members</div> : familyMembers.map(m => (
              <label key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={selectedMemberIds.includes(m.id)} onChange={(e) => {
                  const next = e.currentTarget.checked ? [...selectedMemberIds, m.id] : selectedMemberIds.filter(id => id !== m.id);
                  setSelectedMemberIds(next);
                }} />
                <span>{m.name || m.username}</span>
              </label>
            ))}
          </div>
        </div>
        <Group justify="right" mt="md">
          <Button variant="default" onClick={() => setShowCreateModal(false)} disabled={creating}>Cancel</Button>
          <Button onClick={createNewList} loading={creating}>Create</Button>
        </Group>
      </Modal>
    </Container>
  );
}
