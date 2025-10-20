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
  deleteItem,
  getPackingList,
} from '../api';

type OnSavedPayload = { id?: string; name?: string } | undefined;

export interface ItemEditDrawerProps {
  opened: boolean;
  onClose: () => void;
  masterItemId: string | null | undefined; // master item id (the canonical item)
  initialName?: string;
  familyId: string | null | undefined;
  // name input is always shown now; previous showNameField prop removed
  defaultAssignedMemberId?: string | null; // pre-select this member when creating a new item
  onSaved?: (payload?: OnSavedPayload) => Promise<void> | void;
  // Whether to show the "Also add this item for future trips" checkbox when creating a new item
  showIsOneOffCheckbox?: boolean;
  // When present, indicates we're editing a packing-list one-off item and can promote it to a master
  promoteContext?: { listId: string; packingListItemId: string } | null;
  zIndex?: number;
  initialCategoryId?: string | null; // pre-select a category when creating a new item
  initialMembers?: string[]; // pre-select members when opening from a packing-list item
  initialWhole?: boolean; // pre-select whole-family assignment when opening from a packing-list item
}

export default function ItemEditDrawer({ opened, onClose, masterItemId, initialName, familyId, defaultAssignedMemberId, onSaved, promoteContext, showIsOneOffCheckbox = false, zIndex, initialCategoryId, initialMembers: initialMembersProp, initialWhole: initialWholeProp }: ItemEditDrawerProps) {
  // Log incoming props for debugging when the component mounts / props change
  const _incomingProps = { opened, onClose, masterItemId, initialName, familyId, defaultAssignedMemberId, onSaved, promoteContext, showIsOneOffCheckbox, zIndex, initialCategoryId, initialMembersProp, initialWholeProp };
  console.log('[ItemEditDrawer] props', _incomingProps);

  useEffect(() => {
    if (opened) {
      console.log('[ItemEditDrawer] opened with props', _incomingProps);
    }
  }, [opened, masterItemId, initialName, familyId, defaultAssignedMemberId, promoteContext, showIsOneOffCheckbox, zIndex, initialCategoryId, initialMembersProp, initialWholeProp]);

  // Mount-only log to guarantee at least one visible log entry in some UIs
  useEffect(() => {
    console.log('[ItemEditDrawer] mounted props', _incomingProps);
  }, []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [initialCategory, setInitialCategory] = useState<string | null>(null);
  const [isMasterOneOff, setIsMasterOneOff] = useState<boolean>(false);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [initialMembers, setInitialMembers] = useState<string[]>([]);
  const [selectedWhole, setSelectedWhole] = useState<boolean>(false);
  const [initialWhole, setInitialWhole] = useState<boolean>(false);
  const [name, setName] = useState(initialName || '');
  // Checkbox state: when checked => also add for future trips => isOneOff = 0
  const [alsoAddForFutureTrips, setAlsoAddForFutureTrips] = useState<boolean>(false);

  // Creating a one-off: new item, the "Also add for future trips" checkbox is shown
  // and the user left it unchecked => this should create a packing-list one-off master
  // and category selection should be disabled/optional in that flow.
  const isCreatingOneOff = !masterItemId && showIsOneOffCheckbox && !alsoAddForFutureTrips;
  // When editing an existing one-off, if the "add to master list" checkbox is checked,
  // treat it as a regular item (category required). If unchecked, keep one-off behavior.
  const isConvertingOneOffToRegular = masterItemId && isMasterOneOff && alsoAddForFutureTrips;
  // Effective one-off flag: true when creating a packing-list one-off OR when the
  // master item is a one-off AND not being converted to regular.
  const isOneOff = isCreatingOneOff || (isMasterOneOff && !isConvertingOneOffToRegular);

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
          console.log('[ItemEditDrawer] master payload received', { masterItemId, payload });
          // Simplified one-off detection: use item.isOneOff flag
          const masterOneOffFlag = !!(payload.item?.isOneOff);
          console.log('[ItemEditDrawer] master is one-off:', masterOneOffFlag);
          setIsMasterOneOff(masterOneOffFlag);
          // Seed the editable name from the payload if available; fall back to prop initialName
          setName(payload.item?.name || payload.name || initialName || '');
          setCategories(payload.categories || []);
          // If the consolidated payload didn't include categories, try a family-level fetch so
          // the category radios can render and the selectedCategory (which may have been
          // provided by the caller) will be visible.
          if ((!payload.categories || (Array.isArray(payload.categories) && payload.categories.length === 0)) && familyId) {
            try {
              const cats = await getCategories(familyId);
              if (cats.response && cats.response.ok) setCategories(cats.data.categories || []);
            } catch (e) {
              // ignore
            }
          }
          const itemCats = Array.isArray(payload.itemCategories) ? payload.itemCategories : (payload.itemCategories || []);
          // Prefer caller-provided initialCategoryId when defined (e.g., editing from packing list)
          const currentCat = typeof initialCategoryId !== 'undefined' && initialCategoryId !== null
            ? initialCategoryId
            : (itemCats && itemCats.length > 0 ? itemCats[0].id : null);
          console.debug('[ItemEditDrawer] existing item computed currentCat', { currentCat, initialCategoryId, itemCats });
          setInitialCategory(currentCat);
          setSelectedCategory(currentCat);
          // If the selected category id isn't present in the categories list,
          // try to populate it from itemCats (payload) so the radio can show it.
          if (currentCat && (!payload.categories || !payload.categories.find((c: any) => c.id === currentCat))) {
            const missingName = (itemCats && itemCats.find((c: any) => c.id === currentCat)?.name) || 'Uncategorized';
            setCategories(prev => {
              if (prev.find(p => p.id === currentCat)) return prev;
              return [...prev, { id: currentCat, name: missingName }];
            });
          }
          setFamilyMembers(payload.members || []);
          const itemMems = Array.isArray(payload.itemMembers) ? payload.itemMembers : (payload.itemMembers || []);
          const assignedFromPayload = itemMems.map((m: any) => m.id);
          // Prefer caller-provided initialMembers when present
          const assigned = Array.isArray(initialMembersProp) && initialMembersProp.length > 0 ? initialMembersProp : assignedFromPayload;
          setInitialMembers(assigned);
          setSelectedMembers(assigned.slice());
          const wholeAssigned = typeof initialWholeProp !== 'undefined' ? !!initialWholeProp : !!payload.wholeAssigned;
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

            // New item initial selection: prefer caller-provided initialCategoryId and initialMembers/initialWhole, otherwise empty
            const preselect = typeof initialCategoryId !== 'undefined' ? initialCategoryId : null;
            console.debug('[ItemEditDrawer] new item preselect category', { preselect, initialCategoryId });
            setInitialCategory(preselect);
            setSelectedCategory(preselect);
            if (preselect) {
              setCategories(prev => {
                if (prev.find(p => p.id === preselect)) return prev;
                // We don't have a name here; show a placeholder so the radio can show a selected state.
                return [...prev, { id: preselect, name: 'Category' }];
              });
            }
            const assigned = Array.isArray(initialMembersProp) && initialMembersProp.length > 0 ? initialMembersProp : [];
            setInitialMembers(assigned);
            setSelectedMembers(assigned.slice());
            const wholeAssigned = typeof initialWholeProp !== 'undefined' ? !!initialWholeProp : false;
            setInitialWhole(wholeAssigned);
            setSelectedWhole(wholeAssigned);
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
          }
        }
      } catch (err) {
        console.error('ItemEditDrawer load failed', err);
        showNotification({ title: 'Error', message: 'Failed to load item details', color: 'red' });
      } finally {
        setLoading(false);
      }
    })();
  }, [opened, masterItemId, familyId, defaultAssignedMemberId, promoteContext, initialMembersProp, initialWholeProp, initialCategoryId]);

  const save = async () => {
    setSaving(true);
  console.log('[ItemEditDrawer] save() called', { masterItemId, name, selectedCategory, selectedMembers, selectedWhole, alsoAddForFutureTrips, isCreatingOneOff, isMasterOneOff, isOneOff });
    try {
      const trimmedName = (name || '').trim();
      // Validation: name must be non-empty after trimming
      if (!trimmedName) {
  console.log('[ItemEditDrawer] validation failed - empty name');
        showNotification({ title: 'Validation', message: 'Item name cannot be empty.', color: 'red' });
        setSaving(false);
        return;
      }
    // Validation: category must be selected unless this is a one-off (create or master one-off)
    if (!isOneOff && !selectedCategory) {
  console.log('[ItemEditDrawer] validation failed - category required', { isOneOff, isCreatingOneOff, isMasterOneOff, selectedCategory });
        showNotification({ title: 'Validation', message: 'Select a category before saving.', color: 'red' });
        setSaving(false);
        return;
      }
      let createdId: string | undefined;
      let updatedName: string | undefined;
  const effectiveSelected = selectedCategory ? [selectedCategory] : [];
      if (!masterItemId) {
  console.log('[ItemEditDrawer] creating new master item', { familyId, trimmedName, isOneOffValue: showIsOneOffCheckbox ? (alsoAddForFutureTrips ? 0 : 1) : 0, selectedWhole, selectedMembers });
        // Validation: when creating a new item, require either Whole Family or at least one member selected
        if (!selectedWhole && (!selectedMembers || selectedMembers.length === 0)) {
          console.log('[ItemEditDrawer] validation failed - assignments required', { selectedWhole, selectedMembers });
          showNotification({ title: 'Validation', message: 'Select at least one member or assign to the whole family before saving.', color: 'red' });
          setSaving(false);
          return;
        }
        // Create a new master item
        if (!familyId) throw new Error('Family not available');
        // Determine isOneOff: when checkbox shown, unchecked => isOneOff=1, checked => isOneOff=0
        // When checkbox is hidden (management page), isOneOff should always be 0
        const isOneOffValue = showIsOneOffCheckbox ? (alsoAddForFutureTrips ? 0 : 1) : 0;
  const createRes = await createItem(familyId, trimmedName || 'New Item', isOneOffValue);
  console.log('[ItemEditDrawer] createItem response', createRes);
        if (!createRes.response.ok) throw new Error('Failed to create item');
        createdId = createRes.data?.item?.id;
  updatedName = createRes.data?.item?.name || trimmedName;
        if (!createdId) throw new Error('Create response missing id');

  // Assign a single category (if present) and members
  const ops: Promise<any>[] = [];
  if (effectiveSelected.length > 0) ops.push(assignItemToCategory(createdId, effectiveSelected[0]));
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
      console.log('[ItemEditDrawer] updating master item', { masterItemId, trimmedName, initialName, isOneOff, isConvertingOneOffToRegular, promoteContext });
      
      // Update the master item name (and isOneOff flag if converting)
      const nameChanged = trimmedName && initialName?.trim() !== trimmedName;
      if (nameChanged || isConvertingOneOffToRegular) {
        // When converting one-off to regular, set isOneOff to 0
        const newIsOneOff = isConvertingOneOffToRegular ? 0 : undefined;
        const uRes = await updateItem(masterItemId, trimmedName, newIsOneOff);
        console.log('[ItemEditDrawer] updateItem response', uRes);
        if (uRes.response.ok) updatedName = uRes.data?.item?.name || trimmedName;
      }

      // Update category and member assignments
      const ops: Promise<any>[] = [];
      
      // For one-off items, skip category updates (they don't have categories)
      if (!isOneOff) {
        const effectiveInitial = initialCategory ? [initialCategory] : [];
        const toAddCats = effectiveSelected.filter((c: string) => !effectiveInitial.includes(c));
        const toRemoveCats = effectiveInitial.filter((c: string) => !effectiveSelected.includes(c));
        // Since single-category, we'll add the new category (if any) and remove the old one
        for (const cid of toAddCats) ops.push(assignItemToCategory(masterItemId, cid));
        for (const cid of toRemoveCats) ops.push(removeItemFromCategory(masterItemId, cid));
      }

      // Update member assignments (for both one-off and regular items)
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
      const message = isOneOff ? 'One-off item updated.' : 'Item updated (applies to all lists).';
      showNotification({ title: 'Saved', message, color: 'green' });
      if (onSaved) await onSaved(updatedName ? { name: updatedName } : undefined);
      onClose();
    } catch (err) {
      console.error('ItemEditDrawer save failed', err);
      showNotification({ title: 'Error', message: 'Failed to save item', color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!masterItemId) return;
    const ok = window.confirm('Delete this master item and remove it from all templates and packing lists? This cannot be undone.');
    if (!ok) return;
    setSaving(true);
    try {
      const res = await deleteItem(masterItemId);
      if (res.response && res.response.ok) {
        showNotification({ title: 'Deleted', message: 'Item removed from master list and all packing lists/templates', color: 'green' });
        // Let caller refresh
        if (onSaved) await onSaved();
        onClose();
      } else {
        throw new Error('Delete failed');
      }
    } catch (err) {
      console.error('Failed to delete item', err);
      showNotification({ title: 'Error', message: 'Failed to delete item', color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer opened={opened} onClose={onClose} title={masterItemId ? 'Edit Item' : 'New Item'} position="right" size={720} padding="md" zIndex={zIndex}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Text size="sm" c="dimmed">
          {isOneOff 
            ? 'Note: One-off items do not have categories. Changes to name and assignments apply to this item only.'
            : 'Note: changing categories or assignments here updates the master item and will apply to all lists.'}
        </Text>
        {loading ? (<div style={{ padding: 16 }}>Loading item details...</div>) : null}

        {/* Name - full width row */}
        <div style={{ marginTop: 12 }}>
          <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </div>

        {/* Two column section: Categories (left) | Members/Assignments (right) */}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'stretch', flex: '1 1 auto' }}>
          <div style={{ flex: '1 1 50%', overflow: 'auto', borderRight: '1px solid rgba(0,0,0,0.04)', paddingRight: 12 }}>
            <Text fw={700} mb="xs">Category</Text>
            {categories.length === 0 ? (
              <Text c="dimmed">No categories</Text>
            ) : (
              <div>
                {/* Single-select using radio buttons; disabled/grayed when one-off */}
                {categories.map((c: any) => (
                  <div key={c.id} style={{ padding: '6px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: isOneOff ? '#999' : undefined }}>
                      <input type="radio" name="category" value={c.id} checked={selectedCategory === c.id} onChange={() => setSelectedCategory(c.id)} disabled={isOneOff} />
                      <span>{c.name}</span>
                    </label>
                  </div>
                ))}
                {/* When one-off, show helper text that category is optional and disabled */}
                {isOneOff ? (
                  <Text size="xs" c="dimmed">Category selection is disabled for one-off items.</Text>
                ) : null}
              </div>
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
          {/* Show checkbox when: creating with showIsOneOffCheckbox, editing via promoteContext, OR editing a one-off master item */}
          {(showIsOneOffCheckbox && !masterItemId) || promoteContext || (masterItemId && isMasterOneOff) ? (
            <div style={{ marginBottom: 8 }}>
              <Checkbox
                checked={alsoAddForFutureTrips}
                onChange={(e) => setAlsoAddForFutureTrips(e.currentTarget.checked)}
                label={promoteContext ? "Also add this item to the master list" : (masterItemId && isMasterOneOff) ? "Add this item to the master list" : "Also add this item for future trips"}
              />
              <Text size="xs" c="dimmed">
                {masterItemId && isMasterOneOff 
                  ? "If checked, this will convert the one-off item to a regular master item (requires category). This cannot be undone."
                  : "If checked, this will create a master item and convert the packing-list row to reference it. This cannot be undone."}
              </Text>
            </div>
          ) : null}

          <Group mt="md" style={{ justifyContent: 'space-between' }}>
            <div />
            <Group>
              {/* Delete button shown only when editing an existing master item */}
              {masterItemId ? (
                <Button color="red" variant="light" onClick={handleDelete} disabled={saving}>Delete</Button>
              ) : null}
              <Button variant="default" onClick={onClose}>Cancel</Button>
                      <Button onClick={save} loading={saving}
                        disabled={
                          // name must be non-empty after trimming
                          !( (name || '').trim() ) ||
                          // category must be selected when not a one-off
                          (!isOneOff && !selectedCategory) ||
                          // when creating require assignments (whole or members)
                          (!masterItemId && !selectedWhole && selectedMembers.length === 0)
                        }
                      >Save</Button>
            </Group>
          </Group>
        </div>
      </div>
    </Drawer>
  );
}
