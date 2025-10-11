import React, { useEffect, useState } from 'react';
import { Container, Group, Stack } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import ActivePackingListSelector from './ActivePackingListSelector';
import { PackingListsSideBySide } from './PackingListsSideBySide';
import ItemEditDrawer from './ItemEditDrawer';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import { getCurrentUserProfile, getItems, getPackingList, togglePackingListItemCheck, addItemToPackingList } from '../api';

export default function Dashboard(): React.ReactElement {
  const { activeListId } = useActivePackingList();
  const [userLists, setUserLists] = useState<any[]>([]);
  const [wholeFamilyItems, setWholeFamilyItems] = useState<any[]>([]);
  // local UI state: items marked as 'not needed' (not persisted)
  const [notNeededByUser, setNotNeededByUser] = useState<Record<string, string[]>>({});
  const [notNeededWhole, setNotNeededWhole] = useState<string[]>([]);
  const [listSelectionCount, setListSelectionCount] = useState(0);
  const [familyId, setFamilyId] = useState<string | null>(null);
  // familyMembers not needed in dashboard now that one-off drawer was removed
  const [showItemDrawer, setShowItemDrawer] = useState(false);
  const [itemDrawerDefaultMember, setItemDrawerDefaultMember] = useState<string | null>(null);

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

  // members info not stored locally here; add-drawer will load members when opened

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
    setFamilyId(fid);
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

  const toggleNotNeeded = (userId: string | null, itemId: string) => {
    if (userId) {
      setNotNeededByUser(prev => {
        const copy: Record<string, string[]> = { ...prev };
        const setForUser = new Set(prev[userId] || []);
        if (setForUser.has(itemId)) setForUser.delete(itemId);
        else setForUser.add(itemId);
        copy[userId] = Array.from(setForUser);
        return copy;
      });
    } else {
      setNotNeededWhole(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
    }
  };

  const openAddDrawerFor = (userId: string | null) => {
    setItemDrawerDefaultMember(userId);
    setShowItemDrawer(true);
  };

  const handleItemDrawerSaved = async (payload?: { id?: string; name?: string }) => {
    // If the drawer created a new master item, add it to the active packing list
    try {
      if (!activeListId) return;
      if (payload?.id) {
        // add the created master item to the packing list and respect any member assignment
        const res = await addItemToPackingList(activeListId, payload.id);
        if (!res.response.ok) {
          showNotification({ title: 'Failed', message: 'Failed to add item to packing list', color: 'red' });
        } else {
          const newItem = res.data.item;
          // if a default member was set, add to that member's column in the UI
          const assignedMemberId = itemDrawerDefaultMember;
          if (assignedMemberId) {
            setUserLists(prev => prev.map(ul => ul.userId === assignedMemberId ? { ...ul, items: [{ id: newItem.id, name: newItem.display_name || newItem.name || payload.name || 'Item', checked: false, masterId: newItem.item_id || null }, ...ul.items] } : ul));
          }
        }
      }
    } catch (err) {
      console.error('Failed to add created item to packing list', err);
    } finally {
      setShowItemDrawer(false);
      setItemDrawerDefaultMember(null);
    }
  };
  // Family setup wizard removed: families are created via System Administration
  

  return (
    <Container size="lg">
      {/* Global impersonation banner is displayed in Layout; no local banner needed here */}
      <Group justify="space-between" mb="xl">
        {/* System Administration button removed per request */}
      </Group>
      
      {/* Active Packing List selector is the top element on the dashboard */}

      <div style={{ marginTop: 16 }}>
        <Stack>
          <ActivePackingListSelector onChange={(_id) => { /* optionally notify parent */ }} />
          <PackingListsSideBySide
            userLists={userLists}
            wholeFamilyItems={wholeFamilyItems}
            onCheckItem={handleCheckItem}
            notNeededByUser={notNeededByUser}
            notNeededWhole={notNeededWhole}
            onToggleNotNeeded={toggleNotNeeded}
            onOpenAddDrawer={openAddDrawerFor}
          />
          <ItemEditDrawer opened={showItemDrawer} onClose={() => { setShowItemDrawer(false); setItemDrawerDefaultMember(null); }} masterItemId={null} initialName={undefined} familyId={familyId} showNameField={true} defaultAssignedMemberId={itemDrawerDefaultMember} onSaved={handleItemDrawerSaved} showIsOneOffCheckbox={true} />
        </Stack>
      </div>

      {/* ManagePackingLists moved to the Packing Lists page */}

      {/* FamilySetupWizard removed. Family creation is handled via System Administration. */}

      {/* Impersonation handled by global banner in Layout; dashboard focuses on core content */}
    </Container>
  );
}