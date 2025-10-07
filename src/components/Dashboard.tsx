import React, { useEffect, useState } from 'react';
import { Title, Container, Card, Group, Stack } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import ActivePackingListSelector from './ActivePackingListSelector';
import { PackingListsSideBySide } from './PackingListsSideBySide';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import { getCurrentUserProfile, getItems, getPackingList, togglePackingListItemCheck } from '../api';

export default function Dashboard(): React.ReactElement {
  const { activeListId } = useActivePackingList();
  const [userLists, setUserLists] = useState<any[]>([]);
  const [wholeFamilyItems, setWholeFamilyItems] = useState<any[]>([]);
  const [listSelectionCount, setListSelectionCount] = useState(0);

  // Increment counter whenever activeListId changes to force refresh
  useEffect(() => {
    if (activeListId) {
      setListSelectionCount(prev => prev + 1);
    }
  }, [activeListId]);

  useEffect(() => {
    
    (async () => {
      try {
        const profile = await getCurrentUserProfile();
  const fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
  const membersFromProfile = profile.response.ok && profile.data.family ? profile.data.family.members || [] : [];
  const currentUserId = profile.response.ok && profile.data.user ? profile.data.user.id : null;
        if (!activeListId || !fid) {
          setUserLists([]);
          setWholeFamilyItems([]);
          return;
        }
        
        // fetch master items for name lookup
        const itemsRes = await getItems(fid);
        const items = itemsRes.response.ok ? itemsRes.data.items || [] : [];
        const listRes = await getPackingList(activeListId);
        if (!listRes.response.ok) {
          setUserLists([]);
          setWholeFamilyItems([]);
          return;
        }
        const listItems = listRes.data.items || [];
        const checks = listRes.data.checks || [];

        const userListsData: any[] = [];
        for (const member of membersFromProfile) {
          const memberItems: any[] = [];
          for (const pli of listItems) {
            // if master item and assigned to this member
            const assignedIds = (pli.members || []).map((m: any) => m.id);
            if (assignedIds.includes(member.id)) {
              const master = pli.item_id ? items.find((it: any) => it.id === pli.item_id) : null;
              const name = pli.display_name || (master ? master.name : '') || 'Item';
              const checkRow = checks.find((c: any) => c.packing_list_item_id === pli.id && c.member_id === member.id);
              // use the packing-list-item id (pli.id) for toggling checks so the API can locate the row
              memberItems.push({ id: pli.id, name, checked: !!checkRow?.checked, masterId: pli.item_id || null });
            }
          }
          userListsData.push({ userId: member.id, userName: member.name || member.username, items: memberItems });
        }

        const wholeItems: any[] = [];
        for (const pli of listItems) {
          if (pli.whole_family) {
            const master = pli.item_id ? items.find((it: any) => it.id === pli.item_id) : null;
            const name = pli.display_name || (master ? master.name : '') || 'Item';
            // For whole-family items, checks may be stored per-user (member_id) or
            // as a null-member_id to indicate a family-level check. Prefer the
            // current user's check when available so the UI reflects what the
            // current user actually checked.
            const checkRow = checks.find((c: any) => c.packing_list_item_id === pli.id && (c.member_id === currentUserId || !c.member_id));
            // use packing-list-item id for whole-family items as well
            wholeItems.push({ id: pli.id, name, checked: !!checkRow?.checked, masterId: pli.item_id || null });
          }
        }

        setUserLists(userListsData);
        setWholeFamilyItems(wholeItems);
      } catch (err) {
        console.error('Failed to load dashboard packing lists', err);
        setUserLists([]);
        setWholeFamilyItems([]);
      } finally {
        // no loading state maintained on dashboard
      }
    })();
  }, [activeListId, listSelectionCount]);

  const handleCheckItem = (userId: string | null, itemId: string, checked: boolean) => {
    if (!activeListId) return;

    // capture previous state to allow reverting on failure
    const prevUserLists = userLists;
    const prevWholeFamily = wholeFamilyItems;

    // optimistic update immediately
    if (userId) {
      setUserLists(lists => lists.map(list => list.userId === userId ? { ...list, items: list.items.map((it: any) => it.id === itemId ? { ...it, checked } : it) } : list));
    } else {
      setWholeFamilyItems(items => items.map(it => it.id === itemId ? { ...it, checked } : it));
    }

    // call the API in background; revert and notify on failure
    togglePackingListItemCheck(activeListId, itemId, userId, checked)
      .then(res => {
        if (!res.response.ok) {
          // revert
          setUserLists(prevUserLists);
          setWholeFamilyItems(prevWholeFamily);
          showNotification({ title: 'Failed', message: 'Could not update item check (server error)', color: 'red' });
        }
      })
      .catch(err => {
        console.error('Failed to toggle check', err);
        setUserLists(prevUserLists);
        setWholeFamilyItems(prevWholeFamily);
        showNotification({ title: 'Network Error', message: 'Failed to update item check', color: 'red' });
      });
  };
  // Family setup wizard removed: families are created via System Administration
  

  return (
    <Container size="lg">
      {/* Global impersonation banner is displayed in Layout; no local banner needed here */}
      <Group justify="space-between" mb="xl">
        <Title order={1}>Dashboard</Title>
        {/* System Administration button removed per request */}
      </Group>
      
      {/* Active Packing List selector is the top element on the dashboard */}

      <Card shadow="sm" padding="lg" radius="md" withBorder mt="md">
        <Stack>
          <ActivePackingListSelector onChange={(_id) => { /* optionally notify parent */ }} />
          <PackingListsSideBySide userLists={userLists} wholeFamilyItems={wholeFamilyItems} onCheckItem={handleCheckItem} />
        </Stack>
      </Card>

      {/* ManagePackingLists moved to the Packing Lists page */}

      {/* FamilySetupWizard removed. Family creation is handled via System Administration. */}

      {/* Impersonation handled by global banner in Layout; dashboard focuses on core content */}
    </Container>
  );
}