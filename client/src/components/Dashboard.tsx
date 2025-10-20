import React, { useEffect, useState } from 'react';
import { Container, Group, Stack, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import ActivePackingListSelector from './ActivePackingListSelector';
import { PackingListsSideBySide } from './PackingListsSideBySide';
import ItemEditDrawer from './ItemEditDrawer';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { getCurrentUserProfile, getItems, getPackingList, togglePackingListItemCheck, addItemToPackingList, setPackingListItemNotNeeded, setPackingListItemNotNeededForMember } from '../api';

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

  // Listen for server-sent events forwarded by service worker and refresh when current list changes
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const event = ev.detail || ev;
        if (!event || event.type !== 'packing_list_changed') return;
        if (!activeListId) return;
        if (event.listId === activeListId) {
          console.log('[Dashboard] Received server event for active list, refreshing');
          setListSelectionCount(prev => prev + 1);
        }
      } catch (e) {}
    };
    window.addEventListener('server-event', handler as EventListener);
    return () => window.removeEventListener('server-event', handler as EventListener);
  }, [activeListId]);

  const { impersonatingFamilyId } = useImpersonation();

  useEffect(() => {
    
    (async () => {
      try {
        // prefer impersonation when present
        let fid = impersonatingFamilyId || null;
        let membersFromProfile: any[] = [];
        let currentUserId: string | null = null;
        if (!fid) {
          const profile = await getCurrentUserProfile();
          fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
          membersFromProfile = profile.response.ok && profile.data.family ? profile.data.family.members || [] : [];
          currentUserId = profile.response.ok && profile.data.user ? profile.data.user.id : null;
        } else {
          // If impersonating, fetch the family so we have its members for user columns
          try {
            const famRes = await import('../api').then(m => m.getFamily(impersonatingFamilyId!));
            if (famRes.response.ok && famRes.data.family) {
              membersFromProfile = famRes.data.family.members || [];
            }
          } catch (e) {
            membersFromProfile = [];
          }
        }
        if (!fid) {
          setUserLists([]);
          setWholeFamilyItems([]);
          return;
        }
        // If no active list is selected, show a placeholder message rather than auto-loading
        if (!activeListId) {
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

        // If we couldn't obtain members via the profile/family fetch (possible race or missing data
        // when impersonating), derive a member list from the packing-list rows themselves so
        // the member columns can still render. This makes the dashboard resilient to cases
        // where the global impersonation state isn't fully reflected in the profile call.
        let effectiveMembers = membersFromProfile || [];
        if ((!effectiveMembers || effectiveMembers.length === 0) && Array.isArray(listItems) && listItems.length > 0) {
          const found = new Map<string, any>();
          for (const pli of listItems) {
            for (const m of (pli.members || [])) {
              if (m && m.id) found.set(m.id, m);
            }
          }
          effectiveMembers = Array.from(found.values());
        }

        // Debug: log member data and list items when impersonating to trace missing member assignments
        if (impersonatingFamilyId) {
          try {
            console.debug('[Dashboard][Impersonation] membersFromProfile:', membersFromProfile);
            console.debug('[Dashboard][Impersonation] fetched listItems:', listItems);
            console.debug('[Dashboard][Impersonation] checks:', checks);
          } catch (e) { /* ignore */ }
        }

  const userListsData: any[] = [];
        for (const member of effectiveMembers) {
          const memberItems: any[] = [];
          for (const pli of listItems) {
            // if master item and assigned to this member
            const assignedIds = (pli.members || []).map((m: any) => m.id);
            if (assignedIds.includes(member.id)) {
              const master = pli.item_id ? items.find((it: any) => it.id === pli.item_id) : null;
              // Prefer the master_name returned alongside the packing-list row (covers one-off masters
              // that are not present in the master items list), then fall back to the master lookup.
              const name = pli.display_name || pli.master_name || (master ? master.name : '') || 'Item';
              const checkRow = checks.find((c: any) => c.packing_list_item_id === pli.id && c.member_id === member.id);
              
              // Prefer server-provided check state; no local offline backup used
              const checked = !!checkRow?.checked;
              
              // use the packing-list-item id (pli.id) for toggling checks so the API can locate the row
              memberItems.push({
                id: pli.id,
                name,
                checked,
                masterId: pli.item_id || null,
                added_during_packing: !!pli.added_during_packing,
                display_name: pli.display_name || null,
                masterIsOneOff: !!pli.master_is_one_off,
                // include packing-list-specific metadata so parent views can seed edit drawers
                category: pli.category || null,
                members: pli.members || [],
                whole_family: !!pli.whole_family,
              });
            }
          }
          userListsData.push({ userId: member.id, userName: member.name || member.username, items: memberItems });
        }

  // members info not stored locally here; add-drawer will load members when opened

        const wholeItems: any[] = [];
        for (const pli of listItems) {
          if (pli.whole_family) {
            const master = pli.item_id ? items.find((it: any) => it.id === pli.item_id) : null;
            // Use the packing-list row's master_name when available (handles one-off masters),
            // otherwise fall back to the master lookup or a generic label.
            const name = pli.display_name || pli.master_name || (master ? master.name : '') || 'Item';
            // For whole-family items, checks may be stored per-user (member_id) or
            // as a null-member_id to indicate a family-level check. Prefer the
            // current user's check when available so the UI reflects what the
            // current user actually checked.
            const checkRow = checks.find((c: any) => c.packing_list_item_id === pli.id && (c.member_id === currentUserId || !c.member_id));
            
            // Prefer server-provided check state; no local offline backup used
            const checked = !!checkRow?.checked;
            
            // use packing-list-item id for whole-family items as well
            wholeItems.push({
              id: pli.id,
              name,
              checked,
              masterId: pli.item_id || null,
              added_during_packing: !!pli.added_during_packing,
              display_name: pli.display_name || null,
              masterIsOneOff: !!pli.master_is_one_off,
              // include metadata for edit seeding
              category: pli.category || null,
              members: pli.members || [],
              whole_family: !!pli.whole_family,
            });
          }
        }

    // Initialize not-needed state from server-side persisted rows so it survives reloads
    const initialNotNeededWhole = (listItems || []).filter((pli: any) => !!pli.not_needed).map((pli: any) => pli.id);
    setNotNeededWhole(initialNotNeededWhole);
    // Use server-provided per-member not-needed rows if available
    const notNeededRows: any[] = listRes.data.not_needed_rows || [];
    const initialNotNeededByUser: Record<string, string[]> = {};
    // Only treat rows with not_needed truthy as currently not-needed. Persisted rows
    // with not_needed = 0 should not be considered not-needed in the UI.
    for (const r of notNeededRows) {
      if (!r || !r.packing_list_item_id) continue;
      // member_id may be null for whole-family not-needed rows. Only include
      // per-member rows where not_needed is truthy (1)
      if (r.member_id && !!r.not_needed) {
        if (!initialNotNeededByUser[r.member_id]) initialNotNeededByUser[r.member_id] = [];
        initialNotNeededByUser[r.member_id].push(r.packing_list_item_id);
      }
    }
    setNotNeededByUser(initialNotNeededByUser);
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

  const handleCheckItem = async (userId: string | null, itemId: string, checked: boolean) => {
    if (!activeListId) return;

    // optimistic update immediately
    if (userId) {
      setUserLists(lists => lists.map(list => list.userId === userId ? { ...list, items: list.items.map((it: any) => it.id === itemId ? { ...it, checked } : it) } : list));
    } else {
      setWholeFamilyItems(items => items.map(it => it.id === itemId ? { ...it, checked } : it));
    }

    // Try to send to server
    try {
      const result = await togglePackingListItemCheck(activeListId, itemId, userId, checked);
      if (result.response.ok) {
        // Server accepted it
        console.log('[Dashboard] Check synced to server successfully');
      } else {
        console.warn('[Dashboard] Server rejected check');
        showNotification({ title: 'Sync failed', message: 'Server rejected check update', color: 'yellow' });
      }
    } catch (err) {
      // Network error - notify user (no local backup persists)
      console.warn('[Dashboard] Failed to sync check (offline?)', err);
      showNotification({ title: 'Offline', message: 'Failed to sync check - please try again when online', color: 'yellow' });
    }
  };

  const toggleNotNeeded = async (userId: string | null, itemId: string) => {
    if (!activeListId) {
      showNotification({ title: 'Error', message: 'No active list selected', color: 'red' });
      return;
    }

    // compute current state across whole and per-user
    const currentlyWhole = notNeededWhole.includes(itemId);
    const currentlyUser = userId ? ((notNeededByUser[userId] || []).includes(itemId)) : false;
    // new value of not_needed is the inverse of the current value for the target (user or whole)
    const newValue = userId ? !currentlyUser : !currentlyWhole;

    // capture previous states for revert
    const prevWhole = notNeededWhole;
    const prevUserList = notNeededByUser;

    // optimistic updates: only update the relevant state (per-user or whole)
    if (userId) {
      setNotNeededByUser(prev => {
        const copy: Record<string, string[]> = { ...prev };
        const setForUser = new Set(copy[userId] || []);
        if (setForUser.has(itemId)) setForUser.delete(itemId);
        else setForUser.add(itemId);
        copy[userId] = Array.from(setForUser);
        return copy;
      });
    } else {
      setNotNeededWhole(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
    }

    try {
      console.log('[Dashboard] sending not_needed to server', { listId: activeListId, itemId, notNeeded: newValue, userId });
      // If toggling for a specific user (member column), call per-member API
      const result = userId ? await setPackingListItemNotNeededForMember(activeListId, itemId, userId, newValue) : await setPackingListItemNotNeeded(activeListId, itemId, newValue);
      console.log('[Dashboard] not_needed API result', result && result.response ? { status: result.response.status, ok: result.response.ok } : result);
      if (result && result.response && result.response.ok) {
        // refresh the active list to pick up canonical server state (also other clients will get broadcast)
        setListSelectionCount(prev => prev + 1);
        console.log('[Dashboard] not_needed synced to server', { itemId, newValue });
      } else {
        // revert optimistic changes
        setNotNeededWhole(prev => prevWhole ? (prev.includes(itemId) ? prev : [...prev, itemId]) : prev.filter(id => id !== itemId));
        setNotNeededByUser(prevUserList);
        console.warn('[Dashboard] not_needed API rejected update', result);
        showNotification({ title: 'Sync failed', message: 'Server rejected not-needed update', color: 'yellow' });
      }
    } catch (err) {
      // revert and notify
      setNotNeededWhole(prev => prevWhole ? (prev.includes(itemId) ? prev : [...prev, itemId]) : prev.filter(id => id !== itemId));
      setNotNeededByUser(prevUserList);
      console.warn('[Dashboard] Failed to sync not_needed (offline?)', err);
      showNotification({ title: 'Offline', message: 'Not-needed update failed - try again when online', color: 'yellow' });
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
        // Avoid duplicate adds: if the created master item is already present in
        // the active list (could have been added by server-side template propagation
        // or another client action), skip calling addItemToPackingList again.
        const masterId = payload.id;
        const alreadyInList = (() => {
          try {
            // check whole-family items
            for (const w of wholeFamilyItems || []) {
              if ((w.masterId && String(w.masterId) === String(masterId)) || (w.item_id && String(w.item_id) === String(masterId)) || (w.master_id && String(w.master_id) === String(masterId))) return true;
            }
            // check per-user lists
            for (const ul of userLists || []) {
              for (const it of ul.items || []) {
                if ((it.masterId && String(it.masterId) === String(masterId)) || (it.item_id && String(it.item_id) === String(masterId)) || (it.master_id && String(it.master_id) === String(masterId))) return true;
              }
            }
            return false;
          } catch (e) { return false; }
        })();
        if (!alreadyInList) {
          try {
            const result = await addItemToPackingList(activeListId, payload.id);
            if (result.response.ok) {
              const createdItem = result.data.item;
              const assignedMemberId = itemDrawerDefaultMember;
              if (assignedMemberId && createdItem) {
                setUserLists(prev => prev.map(ul => ul.userId === assignedMemberId ? { ...ul, items: [{ id: createdItem.id, name: payload.name || createdItem.id, checked: false, masterId: payload.id || null }, ...ul.items] } : ul));
              }
            }
          } catch (err) {
            showNotification({ title: 'Failed', message: 'Failed to add item to packing list', color: 'red' });
          }
        } else {
          console.debug('[Dashboard] Skipping addItemToPackingList because master already present in list', payload.id);
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
          {!activeListId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, padding: 24 }}>
              <div style={{ textAlign: 'center' }}>
                <Text size="lg" fw={600}>Select a list above</Text>
                <Text c="dimmed" size="sm" style={{ marginTop: 8 }}>No list selected. Use the selector above to choose a packing list.</Text>
              </div>
            </div>
            ) : (
            <PackingListsSideBySide
              userLists={userLists}
              wholeFamilyItems={wholeFamilyItems}
              onCheckItem={handleCheckItem}
              notNeededByUser={notNeededByUser}
              notNeededWhole={notNeededWhole}
              onToggleNotNeeded={toggleNotNeeded}
              onOpenAddDrawer={openAddDrawerFor}
              showWhole={!!activeListId}
              activeListId={activeListId}
              familyId={familyId}
              onRefresh={() => setListSelectionCount(prev => prev + 1)}
            />
          )}
          <ItemEditDrawer opened={showItemDrawer} onClose={() => { setShowItemDrawer(false); setItemDrawerDefaultMember(null); }} masterItemId={null} initialName={undefined} familyId={familyId} defaultAssignedMemberId={itemDrawerDefaultMember} onSaved={handleItemDrawerSaved} showIsOneOffCheckbox={true} />
        </Stack>
      </div>

      {/* ManagePackingLists moved to the Packing Lists page */}

      {/* FamilySetupWizard removed. Family creation is handled via System Administration. */}

      {/* Impersonation handled by global banner in Layout; dashboard focuses on core content */}
    </Container>
  );
}