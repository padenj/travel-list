import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Container, Group, Stack, Text, Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import ActivePackingListSelector from './ActivePackingListSelector';
import AddItemsDrawer from './AddItemsDrawer';
import PackingListAuditPanel from './PackingListAuditPanel';
import PackingListItemAuditModal from './PackingListItemAuditModal';
import { useOnline } from '../utils/useOnline';
import PersonView from './PersonView';
import DestinationColumns from './DestinationColumns';
import DashboardViewToggle, { useDashboardViewMode } from './DashboardViewToggle';
import NotesDestinationPicker from './NotesDestinationPicker';
import SplitListDialog from './SplitListDialog';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import { useListEditDrawer } from '../contexts/ListEditDrawerContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import {
  getCurrentUserProfile, getFamily, getItems, getPackingList, togglePackingListItemCheck, addItemToPackingList,
  setPackingListItemNotNeeded, setPackingListItemNotNeededForMember, updatePackingList, movePackingListItem,
} from '../api';
import { applyCheck, buildDestinationGroup, DestinationGroup, isNotNeeded, toggleNotNeededIn } from '../utils/dashboardGroups';
import type { ListTripContext, TripDestination } from '../types/trip';

type AddTarget = { listId: string; members?: string[]; whole?: boolean };

export default function Dashboard(): React.ReactElement {
  const { activeListId, requestOpenEdit, availableLists, refreshLists } = useActivePackingList();
  const { openForList } = useListEditDrawer();
  const { impersonatingFamilyId } = useImpersonation();
  const online = useOnline();
  const [viewMode, setViewMode] = useDashboardViewMode();
  const [groups, setGroups] = useState<DestinationGroup[]>([]);
  const [tripInfo, setTripInfo] = useState<{ id: string; name: string } | null>(null);
  const [listSelectionCount, setListSelectionCount] = useState(0);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [itemAudit, setItemAudit] = useState<{ listId: string; pliId: string; name: string } | null>(null);
  const [itemAuditOpened, setItemAuditOpened] = useState(false);
  // Which destination the notes editor and audit panel follow; reported by PersonView.
  const [notesSelection, setNotesSelection] = useState<{ listId: string } | null>(null);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [loadedNotes, setLoadedNotes] = useState('');
  // Keep the chosen destination while it is still part of the loaded trip; otherwise follow the active list.
  const notesListId = notesSelection && groups.some(g => g.listId === notesSelection.listId)
    ? notesSelection.listId
    : activeListId;

  // Track recent local check updates to avoid reacting to our own SSEs
  const recentLocalChecksRef = useRef<Map<string, number>>(new Map());
  const activeListIdRef = useRef<string | null>(activeListId);
  const notesListIdRef = useRef<string | null>(notesListId);
  const groupsRef = useRef<DestinationGroup[]>([]);
  const loadTokenRef = useRef(0);
  const notesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesGenerationByListRef = useRef<Map<string, number>>(new Map());
  const notesLatestDispatchedSequenceByListRef = useRef<Map<string, number>>(new Map());
  const notesEditingRef = useRef(false);

  useEffect(() => {
    activeListIdRef.current = activeListId;
  }, [activeListId]);

  useEffect(() => {
    notesListIdRef.current = notesListId;
  }, [notesListId]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const getNotesGeneration = useCallback((listId: string) => {
    return notesGenerationByListRef.current.get(listId) ?? 0;
  }, []);

  const clearNotesSaveTimer = useCallback(() => {
    if (notesSaveTimerRef.current) {
      clearTimeout(notesSaveTimerRef.current);
      notesSaveTimerRef.current = null;
    }
  }, []);

  const saveNotes = useCallback(async (listId: string, notes: string, generation: number) => {
    if (generation !== getNotesGeneration(listId)) return;
    const requestSequence = (notesLatestDispatchedSequenceByListRef.current.get(listId) ?? 0) + 1;
    notesLatestDispatchedSequenceByListRef.current.set(listId, requestSequence);
    try {
      const result = await updatePackingList(listId, { notes });
      if (!result.response.ok) {
        showNotification({ title: 'Save failed', message: 'Could not save trip notes', color: 'yellow' });
        return;
      }
      setGroups(prev => prev.map(g => (g.listId === listId ? { ...g, notes } : g)));
      if (notesListIdRef.current !== listId) return;
      if (generation !== getNotesGeneration(listId)) return;
      const latestDispatchedSequenceForList = notesLatestDispatchedSequenceByListRef.current.get(listId) ?? 0;
      if (requestSequence !== latestDispatchedSequenceForList) return;
      setLoadedNotes(notes);
      if (!notesEditingRef.current) setNotesDraft(notes);
    } catch (err) {
      showNotification({ title: 'Save failed', message: 'Could not save trip notes', color: 'yellow' });
    }
  }, [getNotesGeneration]);

  const queueNotesSave = useCallback((nextNotes: string) => {
    if (!notesListId) return;
    const generation = getNotesGeneration(notesListId);
    clearNotesSaveTimer();
    notesSaveTimerRef.current = setTimeout(() => {
      notesSaveTimerRef.current = null;
      void saveNotes(notesListId, nextNotes, generation);
    }, 500);
  }, [notesListId, clearNotesSaveTimer, getNotesGeneration, saveNotes]);

  useEffect(() => {
    clearNotesSaveTimer();
    notesEditingRef.current = false;
    if (notesListId) {
      const nextGeneration = getNotesGeneration(notesListId) + 1;
      notesGenerationByListRef.current.set(notesListId, nextGeneration);
      notesLatestDispatchedSequenceByListRef.current.set(notesListId, 0);
    }
    setNotesExpanded(false);
    // Switching destinations within a loaded trip shows that destination's notes right away.
    const known = groupsRef.current.find(g => g.listId === notesListId);
    setNotesDraft(known?.notes ?? '');
    setLoadedNotes(known?.notes ?? '');
  }, [notesListId, clearNotesSaveTimer, getNotesGeneration]);

  useEffect(() => {
    return () => {
      clearNotesSaveTimer();
    };
  }, [clearNotesSaveTimer]);

  // Increment counter whenever activeListId changes to force refresh
  useEffect(() => {
    if (activeListId) {
      setListSelectionCount(prev => prev + 1);
    }
  }, [activeListId]);

  // Refresh when any list of the active trip changes on the server
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const event = ev.detail || ev;
        if (!event || event.type !== 'packing_list_changed') return;
        if (!activeListId) return;
        const data = event.data || {};
        if (data.change === 'check' && data.itemId) {
          const when = recentLocalChecksRef.current.get(data.itemId);
          if (when && Date.now() - when < 5000) {
            setAuditRefreshKey(prev => prev + 1);
            return;
          }
        }
        const watched = event.listId === activeListId || groupsRef.current.some(g => g.listId === event.listId);
        if (watched) {
          setListSelectionCount(prev => prev + 1);
          setAuditRefreshKey(prev => prev + 1);
        }
      } catch (e) {}
    };
    window.addEventListener('server-event', handler as EventListener);
    return () => window.removeEventListener('server-event', handler as EventListener);
  }, [activeListId]);

  useEffect(() => {
    const token = ++loadTokenRef.current;
    const requestedListId = activeListId;
    const isCurrent = () => token === loadTokenRef.current && activeListIdRef.current === requestedListId;
    const clear = () => {
      groupsRef.current = [];
      setGroups([]);
      setTripInfo(null);
      setNotesDraft('');
      setLoadedNotes('');
    };

    (async () => {
      try {
        // prefer impersonation when present
        let fid = impersonatingFamilyId || null;
        let familyMembers: any[] = [];
        let profileUserId: string | null = null;
        if (!fid) {
          const profile = await getCurrentUserProfile();
          fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
          familyMembers = profile.response.ok && profile.data.family ? profile.data.family.members || [] : [];
          profileUserId = profile.response.ok && profile.data.user ? profile.data.user.id : null;
        } else {
          try {
            const famRes = await getFamily(fid);
            if (famRes.response.ok && famRes.data.family) familyMembers = famRes.data.family.members || [];
          } catch (e) {
            familyMembers = [];
          }
        }
        if (!isCurrent()) return;
        if (!fid || !requestedListId) {
          clear();
          return;
        }

        const itemsRes = await getItems(fid);
        const masterItems = itemsRes.response.ok ? itemsRes.data.items || [] : [];
        const listRes = await getPackingList(requestedListId);
        if (!isCurrent()) return;
        if (!listRes.response.ok) {
          clear();
          return;
        }

        // A destination list brings its whole trip: load the sibling lists too.
        const trip: ListTripContext | null = listRes.data.trip_destination || null;
        const destinations: TripDestination[] = trip ? trip.destinations : [];
        const listDataById = new Map<string, any>([[requestedListId, listRes.data]]);
        const siblings = destinations.filter(d => d.packingListId !== requestedListId);
        const siblingResults = await Promise.all(siblings.map(d => getPackingList(d.packingListId).catch(() => null)));
        if (!isCurrent()) return;
        siblings.forEach((d, i) => {
          const res = siblingResults[i];
          if (res && res.response.ok) listDataById.set(d.packingListId, res.data);
        });

        const build = (listId: string, destination: TripDestination | null) => buildDestinationGroup({
          listId,
          listData: listDataById.get(listId),
          masterItems,
          familyMembers,
          currentUserId: profileUserId,
          destination,
        });
        const nextGroups = trip
          ? destinations.filter(d => listDataById.has(d.packingListId)).map(d => build(d.packingListId, d))
          : [build(requestedListId, null)];

        groupsRef.current = nextGroups;
        setGroups(nextGroups);
        setTripInfo(trip ? { id: trip.tripId, name: trip.tripName } : null);
        setFamilyId(fid);
        setCurrentUserId(profileUserId);
        const notesGroup = nextGroups.find(g => g.listId === notesListIdRef.current);
        if (notesGroup) {
          setLoadedNotes(notesGroup.notes);
          if (!notesEditingRef.current) setNotesDraft(notesGroup.notes);
        }
      } catch (err) {
        console.error('Failed to load dashboard packing lists', err);
        if (isCurrent()) clear();
      }
    })();
  }, [activeListId, listSelectionCount]);

  const handleNotesChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextNotes = event.target.value;
    notesEditingRef.current = true;
    setNotesDraft(nextNotes);
    queueNotesSave(nextNotes);
  }, [queueNotesSave]);

  const handleNotesBlur = useCallback(() => {
    notesEditingRef.current = false;
    if (!notesListId) return;
    const generation = getNotesGeneration(notesListId);
    if (notesSaveTimerRef.current) {
      clearNotesSaveTimer();
      void saveNotes(notesListId, notesDraft, generation);
      return;
    }
    if (notesDraft !== loadedNotes) {
      void saveNotes(notesListId, notesDraft, generation);
    }
  }, [notesListId, clearNotesSaveTimer, getNotesGeneration, loadedNotes, notesDraft, saveNotes]);

  const selectNotesGroup = useCallback((listId: string) => {
    setNotesSelection({ listId });
  }, []);

  const handleItemNameClick = useCallback((listId: string, pliId: string, name: string) => {
    setItemAudit({ listId, pliId, name: name || 'Item history' });
    setItemAuditOpened(true);
  }, []);

  const handleCheckItem = useCallback(async (listId: string, userId: string | null, itemId: string, checked: boolean) => {
    setGroups(prev => applyCheck(prev, listId, userId, itemId, checked));
    recentLocalChecksRef.current.set(itemId, Date.now());
    setTimeout(() => { recentLocalChecksRef.current.delete(itemId); }, 6000);
    try {
      const result = await togglePackingListItemCheck(listId, itemId, userId, checked);
      if (!result.response.ok) {
        showNotification({ title: 'Sync failed', message: 'Server rejected check update', color: 'yellow' });
      }
    } catch (err) {
      showNotification({ title: 'Offline', message: 'Failed to sync check - please try again when online', color: 'yellow' });
    }
  }, []);

  const toggleNotNeeded = useCallback(async (listId: string, userId: string | null, itemId: string) => {
    const group = groupsRef.current.find(g => g.listId === listId);
    if (!group) return;
    const newValue = !isNotNeeded(group, userId, itemId);
    const flip = () => setGroups(prev => toggleNotNeededIn(prev, listId, userId, itemId));
    flip();
    try {
      const result = userId
        ? await setPackingListItemNotNeededForMember(listId, itemId, userId, newValue)
        : await setPackingListItemNotNeeded(listId, itemId, newValue);
      if (result?.response?.ok) {
        setListSelectionCount(prev => prev + 1);
      } else {
        flip();
        showNotification({ title: 'Sync failed', message: 'Server rejected not-needed update', color: 'yellow' });
      }
    } catch (err) {
      flip();
      showNotification({ title: 'Offline', message: 'Not-needed update failed - try again when online', color: 'yellow' });
    }
  }, []);

  const handleMoveSharedItem = useCallback(async (fromListId: string, itemId: string, toListId: string) => {
    try {
      const result = await movePackingListItem(fromListId, itemId, toListId);
      if (result.response.ok) {
        const target = groupsRef.current.find(g => g.listId === toListId);
        showNotification({ title: 'Moved', message: `Moved to ${target?.name ?? 'the other destination'}`, color: 'green' });
        setListSelectionCount(prev => prev + 1);
      } else {
        showNotification({ title: 'Move failed', message: result.data?.error || 'Server rejected the move', color: 'red' });
      }
    } catch (err) {
      showNotification({ title: 'Move failed', message: 'Moving items needs a connection', color: 'yellow' });
    }
  }, []);

  const openAddDrawerFor = useCallback((listId: string, userId: string | null) => {
    setAddTarget(userId === null ? { listId, whole: true } : { listId, members: [userId], whole: false });
  }, []);

  const handleAddItemsApply = useCallback(async (selectedIds: string[], keepOpen?: boolean) => {
    const listId = addTarget?.listId ?? activeListId;
    if (!listId) {
      showNotification({ title: 'No list selected', message: 'Select a list before adding', color: 'yellow' });
      return;
    }
    try {
      await Promise.all(selectedIds.map(id => addItemToPackingList(listId, id)));
      setListSelectionCount(prev => prev + 1);
    } catch (err) {
      console.error('Failed to add items to packing list', err);
      showNotification({ title: 'Failed', message: 'Failed to add items to packing list', color: 'red' });
    } finally {
      if (!keepOpen) setAddTarget(null);
    }
  }, [addTarget, activeListId]);

  const isTrip = !!tripInfo;
  const refresh = () => setListSelectionCount(prev => prev + 1);
  const addTargetGroup = groups.find(g => g.listId === addTarget?.listId);
  const listNameFor = (id: string | null) => (availableLists || []).find((list: any) => list.id === id)?.name;

  return (
    <Container size="lg">
      <div style={{ marginTop: 16 }}>
        <Stack>
          <Group justify="space-between" gap="sm">
            <Group justify="flex-start" gap="sm">
              <ActivePackingListSelector />
              <Button size="xs" onClick={() => {
                if (!notesListId) {
                  showNotification({ title: 'No list selected', message: 'Select a list before editing', color: 'yellow' });
                  return;
                }
                if (requestOpenEdit) requestOpenEdit(notesListId);
                openForList(notesListId, listNameFor(notesListId));
              }}>Edit list</Button>
              {activeListId && !isTrip && groups.length > 0 && (
                <Button size="xs" variant="light" disabled={!online} onClick={() => setSplitOpen(true)}>
                  {online ? 'Split by destination' : 'Needs a connection'}
                </Button>
              )}
            </Group>
            {activeListId && <DashboardViewToggle value={viewMode} onChange={setViewMode} />}
          </Group>
          {tripInfo && (
            <Text size="sm" c="dimmed">{`${tripInfo.name} · ${groups.length} ${groups.length === 1 ? 'destination' : 'destinations'}`}</Text>
          )}
          {!activeListId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, padding: 24 }}>
              <div style={{ textAlign: 'center' }}>
                <Text size="lg" fw={600}>Select a list above</Text>
                <Text c="dimmed" size="sm" style={{ marginTop: 8 }}>No list selected. Use the selector above to choose a packing list.</Text>
              </div>
            </div>
          ) : (
            <>
              <div style={{ border: '1px solid #dee2e6', borderRadius: 8, padding: 12 }}>
                <Group justify="space-between" gap="sm">
                  <Group gap="sm">
                    <Text fw={600}>Trip Notes</Text>
                    {isTrip && viewMode === 'columns' && (
                      <NotesDestinationPicker groups={groups} value={notesListId} onChange={selectNotesGroup} />
                    )}
                  </Group>
                  <Button
                    size="xs"
                    variant="subtle"
                    aria-label={notesExpanded ? 'Collapse notes' : 'Expand notes'}
                    onClick={() => setNotesExpanded(prev => !prev)}
                  >
                    {notesExpanded ? 'Collapse' : 'Expand'}
                  </Button>
                </Group>
                {notesExpanded ? (
                  <textarea
                    aria-label="Trip notes editor"
                    value={notesDraft}
                    onChange={handleNotesChange}
                    onBlur={handleNotesBlur}
                    rows={6}
                    style={{ width: '100%', marginTop: 8, resize: 'vertical' }}
                  />
                ) : (
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                    {notesDraft.trim()
                      ? notesDraft.split(/\r?\n/).slice(0, 3).join('\n')
                      : 'Add reminders for future trips…'}
                  </div>
                )}
              </div>
              {viewMode === 'person' ? (
                <PersonView
                  groups={groups}
                  isTrip={isTrip}
                  currentUserId={currentUserId}
                  onCheckItem={handleCheckItem}
                  onToggleNotNeeded={toggleNotNeeded}
                  onOpenAddDrawer={openAddDrawerFor}
                  onItemHistory={handleItemNameClick}
                  onMoveSharedItem={handleMoveSharedItem}
                  onSelectedGroupChange={selectNotesGroup}
                />
              ) : (
                <DestinationColumns
                  groups={groups}
                  isTrip={isTrip}
                  currentUserId={currentUserId}
                  familyId={familyId}
                  onCheckItem={handleCheckItem}
                  onItemNameClick={handleItemNameClick}
                  onToggleNotNeeded={toggleNotNeeded}
                  onOpenAddDrawer={openAddDrawerFor}
                  onRefresh={refresh}
                />
              )}
            </>
          )}

          <PackingListAuditPanel
            packingListId={notesListId}
            refreshKey={auditRefreshKey}
            onItemClick={(pliId, display) => notesListId && handleItemNameClick(notesListId, pliId, display)}
          />

          <PackingListItemAuditModal
            opened={itemAuditOpened}
            onClose={() => setItemAuditOpened(false)}
            packingListId={itemAudit?.listId ?? null}
            packingListItemId={itemAudit?.pliId ?? null}
            itemName={itemAudit?.name ?? ''}
            refreshKey={auditRefreshKey}
          />
          <AddItemsDrawer
            opened={!!addTarget}
            onClose={() => setAddTarget(null)}
            familyId={familyId}
            excludedItemIds={addTargetGroup?.excludedItemIds ?? []}
            onApply={handleAddItemsApply}
            title="Add Items"
            showIsOneOffCheckbox={true}
            initialMembers={addTarget?.members}
            initialWhole={addTarget?.whole}
            promoteContext={addTarget ? { listId: addTarget.listId, packingListItemId: '' } : null}
          />
          <SplitListDialog
            opened={splitOpen}
            onClose={() => setSplitOpen(false)}
            familyId={familyId}
            listId={activeListId}
            listName={listNameFor(activeListId) || ''}
            onSplit={() => {
              void refreshLists?.();
              refresh();
            }}
          />
        </Stack>
      </div>
    </Container>
  );
}
