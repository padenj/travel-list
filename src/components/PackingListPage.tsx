import React, { useEffect, useState } from 'react';
import { PackingListsSideBySide } from './PackingListsSideBySide';
import { getCurrentUserProfile, getItems, getMembersForItem, isAssignedToWholeFamily, setChecked, getFamily, getTemplates, syncTemplateItems } from '../api';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { Loader, Container, Title, Group, Button, Select, Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';

export default function PackingListPage(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [_familyId, setFamilyId] = useState<string | null>(null);
  const [_members, setMembers] = useState<any[]>([]);
  const [userLists, setUserLists] = useState<any[]>([]);
  const [wholeFamilyItems, setWholeFamilyItems] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { impersonatingFamilyId } = useImpersonation();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // Prefer impersonation family id when present
      let fid = impersonatingFamilyId;
      let membersFromProfile: any[] = [];
      if (!fid) {
        const profile = await getCurrentUserProfile();
        if (profile.response.ok && profile.data.family) {
          fid = profile.data.family.id;
          membersFromProfile = profile.data.family.members || [];
        }
      }
      if (fid) {
        setFamilyId(fid);
        // If impersonating, try fetching members from the family API (server returns members)
        if (impersonatingFamilyId) {
          try {
            const famRes = await getFamily(impersonatingFamilyId);
            if (famRes.response.ok && famRes.data.family) {
              setMembers(famRes.data.family.members || []);
            } else {
              setMembers(membersFromProfile);
            }
          } catch {
            setMembers(membersFromProfile);
          }
        } else {
          setMembers(membersFromProfile);
        }
        // Fetch items for this family
        const itemsRes = await getItems(fid);
        if (itemsRes.response.ok) {
          const items = itemsRes.data.items || [];
          // Fetch assignments for each item
          const userListsData: any[] = [];
          // Use the members we set above
          for (const member of (_members.length ? _members : membersFromProfile) || membersFromProfile) {
            const memberItems: any[] = [];
            for (const item of items) {
              const assignedMembersRes = await getMembersForItem(item.id);
              if (assignedMembersRes.response.ok && assignedMembersRes.data) {
                const assignedMemberIds = assignedMembersRes.data.map((m: any) => m.id);
                if (assignedMemberIds.includes(member.id)) {
                  memberItems.push({ ...item, checked: !!item.checked });
                }
              }
            }
            userListsData.push({
              userId: member.id,
              userName: member.name || member.username,
              items: memberItems
            });
          }
          // Whole family items
          const wholeFamilyItems: any[] = [];
          for (const item of items) {
            const isWholeFamilyRes = await isAssignedToWholeFamily(item.id);
            if (isWholeFamilyRes.response.ok && isWholeFamilyRes.data === true) {
              wholeFamilyItems.push({ ...item, checked: !!item.checked });
            }
          }
          setUserLists(userListsData);
          setWholeFamilyItems(wholeFamilyItems);
            // fetch templates for this family
            try {
              const tRes = await getTemplates(fid);
              if (tRes.response.ok) {
                setTemplates(tRes.data.templates || []);
              }
            } catch (e) {
              // ignore
            }
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [impersonatingFamilyId]);

  const handleCheckItem = async (userId: string | null, itemId: string, checked: boolean) => {
    await setChecked(itemId, checked);
    if (userId) {
      setUserLists(lists =>
        lists.map(list =>
          list.userId === userId
            ? { ...list, items: list.items.map((item: any) => item.id === itemId ? { ...item, checked } : item) }
            : list
        )
      );
    } else {
      setWholeFamilyItems(items =>
        items.map(item => item.id === itemId ? { ...item, checked } : item)
      );
    }
  };

  const handleUpdateTemplate = async () => {
    if (!selectedTemplate) return;
    setShowConfirmModal(true);
  };

  const doSyncTemplate = async () => {
    if (!selectedTemplate) return;
    // Collect current item IDs from whole family and user lists
    const ids = new Set<string>();
    wholeFamilyItems.forEach(i => ids.add(i.id));
    userLists.forEach(list => list.items.forEach((it: any) => ids.add(it.id)));
    const itemIds = Array.from(ids);
    setSyncing(true);
    try {
      const res = await syncTemplateItems(selectedTemplate, itemIds);
      if (res.response.ok) {
        showNotification({ title: 'Template updated', message: 'Template items were synced successfully', color: 'green' });
        // refresh templates list
        const tRes = await getTemplates(_familyId || '');
        if (tRes.response.ok) setTemplates(tRes.data.templates || []);
      } else {
        showNotification({ title: 'Sync failed', message: res.data?.error || 'Failed to sync template', color: 'red' });
        console.error('Failed to sync template', res.data);
      }
    } catch (err) {
      showNotification({ title: 'Sync error', message: String(err), color: 'red' });
      console.error('Error syncing template', err);
    } finally {
      setSyncing(false);
      setShowConfirmModal(false);
    }
  };

  if (loading) {
    return (
      <Container size="md">
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      </Container>
    );
  }

  return (
    <Container size="lg">
      <Title order={2} mb="lg">Packing Lists</Title>
    <Group justify="apart" mb="md">
          <div style={{ minWidth: 240 }}>
            <Select
              data={[{ value: '', label: '-- select template --' }, ...templates.map(t => ({ value: t.id, label: t.name }))].filter(x => x.value !== undefined)}
              value={selectedTemplate || ''}
              onChange={(val) => setSelectedTemplate(val || null)}
              placeholder="Select template"
            />
          </div>
          <div>
            <Button onClick={handleUpdateTemplate} disabled={!selectedTemplate || syncing} loading={syncing}>
              Update Template
            </Button>
          </div>
        </Group>

        <Modal opened={showConfirmModal} onClose={() => setShowConfirmModal(false)} title="Update template?">
          <div>
            <p>Are you sure you want to update the selected template to match the current packing list items? This will add and remove items on the template.</p>
            <Group justify="right" mt="md">
              <Button variant="default" onClick={() => setShowConfirmModal(false)} disabled={syncing}>Cancel</Button>
              <Button color="red" onClick={() => doSyncTemplate()} loading={syncing}>Confirm Update</Button>
            </Group>
          </div>
        </Modal>
        <PackingListsSideBySide
        userLists={userLists}
        wholeFamilyItems={wholeFamilyItems}
        onCheckItem={handleCheckItem}
      />
    </Container>
  );
}
