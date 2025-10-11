import { useEffect, useState } from 'react';
import { Drawer, Text, Checkbox, Button, Group, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  getItemEditData,
  assignItemToCategory,
  removeItemFromCategory,
  assignToMember,
  removeFromMember,
  assignToWholeFamily,
  removeFromWholeFamily,
  updateItem,
  createItem,
  getCategories,
  getCurrentUserProfile,
} from '../api';

type OnSavedPayload = { id?: string; name?: string } | undefined;

export interface ItemEditDrawerProps {
  opened: boolean;
  onClose: () => void;
  masterItemId: string | null | undefined; // master item id (the canonical item)
  initialName?: string;
  familyId: string | null | undefined;
  showNameField?: boolean; // whether to expose a name input (used by ItemManagementPage)
  defaultAssignedMemberId?: string | null; // pre-select this member when creating a new item
  onSaved?: (payload?: OnSavedPayload) => Promise<void> | void;
  // Whether to show the "Also add this item for future trips" checkbox when creating a new item
  showIsOneOffCheckbox?: boolean;
  // When present, indicates we're editing a packing-list one-off item and can promote it to a master
  promoteContext?: { listId: string; packingListItemId: string } | null;
  zIndex?: number;
}

export default function ItemEditDrawer({ opened, onClose, masterItemId, initialName, familyId, showNameField = false, defaultAssignedMemberId, onSaved, promoteContext, zIndex }: ItemEditDrawerProps) {
  // default showIsOneOffCheckbox to false if not provided (ItemManagementPage will keep it hidden)
  const showIsOneOffCheckbox = (arguments[0] as ItemEditDrawerProps)?.showIsOneOffCheckbox || false;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [initialCategories, setInitialCategories] = useState<string[]>([]);
  const [selectedAll, setSelectedAll] = useState<boolean>(false);
  const [initialAll, setInitialAll] = useState<boolean>(false);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [initialMembers, setInitialMembers] = useState<string[]>([]);
  const [selectedWhole, setSelectedWhole] = useState<boolean>(false);
  const [initialWhole, setInitialWhole] = useState<boolean>(false);
  const [name, setName] = useState(initialName || '');
  // Checkbox state: when checked => also add for future trips => isOneOff = 0
  const [alsoAddForFutureTrips, setAlsoAddForFutureTrips] = useState<boolean>(false);

  useEffect(() => {
    setName(initialName || '');
  }, [initialName]);

  useEffect(() => {
    // default checkbox state: unchecked (isOneOff = 1) when creating from dashboard/edit packing list drawer
    setAlsoAddForFutureTrips(false);
  }, [opened, masterItemId, promoteContext]);

  useEffect(() => {
    if (!opened) return;
    (async () => {
      setLoading(true);
      try {
        if (masterItemId) {
          // Fetch all edit data in a single request for existing item
          const res = await getItemEditData(masterItemId, familyId || undefined);
          if (!res.response.ok) throw new Error('Failed to load item edit data');
          const payload = res.data || {};
          setCategories(payload.categories || []);
          const itemCats = Array.isArray(payload.itemCategories) ? payload.itemCategories : (payload.itemCategories || []);
          const currentCats = itemCats.map((c: any) => c.id);
          setInitialCategories(currentCats);
          setSelectedCategories(currentCats.slice());
          const allCatIds = (payload.categories || []).map((c: any) => c.id);
          const isAll = allCatIds.length > 0 && allCatIds.every((id: string) => currentCats.includes(id)) && currentCats.length === allCatIds.length;
          setInitialAll(isAll);
          setSelectedAll(isAll);
          setFamilyMembers(payload.members || []);
          const itemMems = Array.isArray(payload.itemMembers) ? payload.itemMembers : (payload.itemMembers || []);
          const assigned = itemMems.map((m: any) => m.id);
          setInitialMembers(assigned);
          setSelectedMembers(assigned.slice());
          const wholeAssigned = !!payload.wholeAssigned;
          setInitialWhole(wholeAssigned);
          setSelectedWhole(wholeAssigned);
        } else {
          // New item: load family-level categories and members
          if (familyId) {
            let familyMembersFromProfile: any[] = [];
            try {
              const cats = await getCategories(familyId);
              if (cats.response.ok) setCategories(cats.data.categories || []);
            } catch (e) {
              // ignore
            }
            try {
              const profile = await getCurrentUserProfile();
              if (profile.response.ok && profile.data.family) {
                familyMembersFromProfile = profile.data.family.members || [];
                setFamilyMembers(familyMembersFromProfile);
              }
            } catch (e) {
              // ignore
            }

            // New item initial selections are empty, except possibly a caller-provided default
            setInitialCategories([]);
            setSelectedCategories([]);
            setInitialMembers([]);
            // If caller explicitly passed `null` as the defaultAssignedMemberId,
            // that indicates "open for Whole Family" (PackingListsSideBySide uses
            // onOpenAddDrawer(null) for the Whole Family add button). In that
            // case pre-select the Whole Family checkbox. If a specific member id
            // was passed, pre-select that member instead.
            if (defaultAssignedMemberId === null) {
              setSelectedWhole(true);
              setSelectedMembers([]);
            } else if (defaultAssignedMemberId && familyMembersFromProfile.some((m: any) => m.id === defaultAssignedMemberId)) {
              setSelectedMembers([defaultAssignedMemberId]);
              setSelectedWhole(false);
            } else {
              setSelectedMembers([]);
              setSelectedWhole(false);
            }
            // initialWhole reflects persisted state; new items start false
            setInitialWhole(false);
            setInitialAll(false);
            setSelectedAll(false);
          }
        }
      } catch (err) {
        console.error('ItemEditDrawer load failed', err);
        showNotification({ title: 'Error', message: 'Failed to load item details', color: 'red' });
      } finally {
        setLoading(false);
      }
    })();
  }, [opened, masterItemId, familyId, defaultAssignedMemberId]);

  const save = async () => {
    setSaving(true);
    try {
      let createdId: string | undefined;
      let updatedName: string | undefined;
      const allCatIds = (categories || []).map((c: any) => c.id);
      const effectiveSelected = selectedAll ? allCatIds : selectedCategories;

      if (!masterItemId) {
        // Create a new master item
        if (!familyId) throw new Error('Family not available');
        // Determine isOneOff: when checkbox shown, unchecked => isOneOff=1, checked => isOneOff=0
        // When checkbox is hidden (management page), isOneOff should always be 0
        const isOneOffValue = showIsOneOffCheckbox ? (alsoAddForFutureTrips ? 0 : 1) : 0;
        const createRes = await createItem(familyId, name || 'New Item', isOneOffValue);
        if (!createRes.response.ok) throw new Error('Failed to create item');
        createdId = createRes.data?.item?.id;
        updatedName = createRes.data?.item?.name || name;
        if (!createdId) throw new Error('Create response missing id');

        // Assign categories and members like update flow
        const ops: Promise<any>[] = [];
        for (const cid of effectiveSelected) ops.push(assignItemToCategory(createdId, cid));
        if (selectedWhole && familyId) ops.push(assignToWholeFamily(createdId, familyId));
        if (!selectedWhole) {
          for (const mid of selectedMembers) ops.push(assignToMember(createdId, mid));
        }
        await Promise.all(ops);
        showNotification({ title: 'Saved', message: 'Item created.', color: 'green' });
        if (onSaved) await onSaved(createdId ? { id: createdId, name: updatedName } : undefined);
        onClose();
        return;
      }

      // Existing item update
      if (!masterItemId) throw new Error('masterItemId missing');
      if (showNameField && name && initialName !== name) {
        const uRes = await updateItem(masterItemId, name);
        if (uRes.response.ok) updatedName = uRes.data?.item?.name || name;
      }

      const effectiveInitial = initialAll ? allCatIds : initialCategories;
      const toAddCats = effectiveSelected.filter((c: string) => !effectiveInitial.includes(c));
      const toRemoveCats = effectiveInitial.filter((c: string) => !effectiveSelected.includes(c));
      const ops: Promise<any>[] = [];
      for (const cid of toAddCats) ops.push(assignItemToCategory(masterItemId, cid));
      for (const cid of toRemoveCats) ops.push(removeItemFromCategory(masterItemId, cid));

      if (selectedWhole && !initialWhole) {
        if (familyId) ops.push(assignToWholeFamily(masterItemId, familyId));
      } else if (!selectedWhole && initialWhole) {
        ops.push(removeFromWholeFamily(masterItemId));
      }

      if (!selectedWhole) {
        const toAddMembers = selectedMembers.filter(m => !initialMembers.includes(m));
        const toRemoveMembers = initialMembers.filter(m => !selectedMembers.includes(m));
        for (const mid of toAddMembers) ops.push(assignToMember(masterItemId, mid));
        for (const mid of toRemoveMembers) ops.push(removeFromMember(masterItemId, mid));
      }

      await Promise.all(ops);
      showNotification({ title: 'Saved', message: 'Item updated (applies to all lists).', color: 'green' });
      if (onSaved) await onSaved(updatedName ? { name: updatedName } : undefined);
      onClose();
    } catch (err) {
      console.error('ItemEditDrawer save failed', err);
      showNotification({ title: 'Error', message: 'Failed to save item', color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer opened={opened} onClose={onClose} title={masterItemId ? 'Edit Item' : 'New Item'} position="right" size={720} padding="md" zIndex={zIndex}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Text size="sm" c="dimmed">Note: changing categories or assignments here updates the master item and will apply to all lists.</Text>
        {loading ? (<div style={{ padding: 16 }}>Loading item details...</div>) : null}

        {/* Name - full width row */}
        {showNameField ? (
          <div style={{ marginTop: 12 }}>
            <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          </div>
        ) : null}

        {/* Two column section: Categories (left) | Members/Assignments (right) */}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'stretch', flex: '1 1 auto' }}>
          <div style={{ flex: '1 1 50%', overflow: 'auto', borderRight: '1px solid rgba(0,0,0,0.04)', paddingRight: 12 }}>
            <Text fw={700} mb="xs">Categories</Text>
            <div style={{ padding: '6px 0' }}>
              <Checkbox checked={selectedAll} onChange={(e) => {
                const checked = e.currentTarget.checked;
                setSelectedAll(checked);
                if (checked) setSelectedCategories([]);
              }} label="All categories (virtual)" />
            </div>
            {categories.length === 0 ? (
              <Text c="dimmed">No categories</Text>
            ) : (
              categories.map((c: any) => (
                <div key={c.id} style={{ padding: '6px 0' }}>
                  <Checkbox disabled={selectedAll} checked={selectedCategories.includes(c.id)} onChange={(e) => {
                    const checked = e.currentTarget.checked;
                    setSelectedCategories(prev => checked ? [...prev, c.id] : prev.filter(x => x !== c.id));
                    if (!checked && selectedAll) setSelectedAll(false);
                  }} label={c.name} />
                </div>
              ))
            )}
          </div>

          <div style={{ flex: '1 1 50%', overflow: 'auto', paddingLeft: 12 }}>
            <Text fw={700} mb="xs">Assignments</Text>
            <div style={{ marginBottom: 8 }}>
              <Checkbox checked={selectedWhole} onChange={(e) => setSelectedWhole(e.currentTarget.checked)} label="Assign to Whole Family" />
              <Text size="xs" c="dimmed">When checked, the item is assigned to the whole family. Individual member assignments will be ignored.</Text>
            </div>
            <div style={{ marginTop: 8 }}>
              <Text size="sm" fw={600}>Members</Text>
              {familyMembers.length === 0 ? (
                <Text c="dimmed">No family members</Text>
              ) : (
                familyMembers.map((m: any) => (
                  <div key={m.id} style={{ padding: '6px 0' }}>
                    <Checkbox disabled={selectedWhole} checked={selectedMembers.includes(m.id)} onChange={(e) => {
                      const checked = e.currentTarget.checked;
                      setSelectedMembers(prev => checked ? [...prev, m.id] : prev.filter(x => x !== m.id));
                    }} label={m.name || m.username} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Checkbox and buttons below in single column */}
        <div style={{ marginTop: 12 }}>
          {!masterItemId && (showIsOneOffCheckbox || promoteContext) ? (
            <div style={{ marginBottom: 8 }}>
              <Checkbox
                checked={alsoAddForFutureTrips}
                onChange={(e) => setAlsoAddForFutureTrips(e.currentTarget.checked)}
                label={promoteContext ? "Also add this item to the master list" : "Also add this item for future trips"}
              />
              <Text size="xs" c="dimmed">If checked, this will create a master item and convert the packing-list row to reference it. This cannot be undone.</Text>
            </div>
          ) : null}

          <Group mt="md" style={{ justifyContent: 'space-between' }}>
            <div />
            <Group>
              <Button variant="default" onClick={onClose}>Cancel</Button>
              <Button onClick={save} loading={saving}>Save</Button>
            </Group>
          </Group>
        </div>
      </div>
    </Drawer>
  );
}
