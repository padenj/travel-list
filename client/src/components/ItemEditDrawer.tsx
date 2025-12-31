import { useEffect, useState } from 'react';
import { Drawer, Text, Checkbox, Button, Group, TextInput, Switch, Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  getItemEditData,
  assignItemToCategory,
  removeItemFromCategory,
  assignItemToTemplate,
  removeItemFromTemplate,
  assignToMember,
  removeFromMember,
  assignToWholeFamily,
  removeFromWholeFamily,
  updateItem,
  createItem,
  getCategories,
  getCurrentUserProfile,
  getFamily,
  deleteItem,
  getPackingList,
  getItems,
  addItemToPackingList,
  getCategoriesForItem,
  getItemGroups,
} from '../api';
import useFuzzySearch from '../utils/useFuzzySearch';

type OnSavedPayload = { id?: string; name?: string; members?: string[]; whole?: boolean } | undefined;

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
  // Fields are optional because callers may only provide a `listId` when used from AddItemsDrawer.
  promoteContext?: { listId?: string; packingListItemId?: string } | null;
  zIndex?: number;
  initialCategoryId?: string | null; // pre-select a category when creating a new item
  initialMembers?: string[]; // pre-select members when opening from a packing-list item
  initialWhole?: boolean; // pre-select whole-family assignment when opening from a packing-list item
  // When true, hide the "Add this to list" action when there is no active packing list
  hideAddActionWhenNoList?: boolean;
}

export default function ItemEditDrawer({ opened, onClose, masterItemId, initialName, familyId, defaultAssignedMemberId, onSaved, promoteContext, showIsOneOffCheckbox = false, zIndex, initialCategoryId, initialMembers: initialMembersProp, initialWhole: initialWholeProp, hideAddActionWhenNoList = false }: ItemEditDrawerProps) {
  // Log incoming props for debugging when the component mounts / props change
  const _incomingProps = { opened, onClose, masterItemId, initialName, familyId, defaultAssignedMemberId, onSaved, promoteContext, showIsOneOffCheckbox, zIndex, initialCategoryId, initialMembersProp, initialWholeProp, hideAddActionWhenNoList };
  // Removed verbose prop logging to reduce console noise in the UI.

  useEffect(() => {
    // no-op: removed verbose open logs
  }, [opened, masterItemId, initialName, familyId, defaultAssignedMemberId, promoteContext, showIsOneOffCheckbox, zIndex, initialCategoryId, initialMembersProp, initialWholeProp]);

  // Mount-only log to guarantee at least one visible log entry in some UIs
  useEffect(() => {
    // mount log removed
  }, []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [initialCategory, setInitialCategory] = useState<string | null>(null);
  const [isMasterOneOff, setIsMasterOneOff] = useState<boolean>(false);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [itemFamilyId, setItemFamilyId] = useState<string | null>(familyId || null);
  const [itemGroups, setItemGroups] = useState<any[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [initialGroupIds, setInitialGroupIds] = useState<string[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [initialMembers, setInitialMembers] = useState<string[]>([]);
  const [selectedWhole, setSelectedWhole] = useState<boolean>(false);
  const [initialWhole, setInitialWhole] = useState<boolean>(false);
  const [name, setName] = useState(initialName || '');
  // Checkbox state: when checked => also add for future trips => isOneOff = 0
  // Checkbox state: when checked => this trip only (one-off) => isOneOff = 1
  // Default to false so OFF = add for future trips (master item)
  const [alsoAddForFutureTrips, setAlsoAddForFutureTrips] = useState<boolean>(false);
  const [promotionConfirm, setPromotionConfirm] = useState<{ open: boolean; reason?: string }>(() => ({ open: false }));

  // Creating a one-off: new item, the "Also add for future trips" checkbox is shown
  // and the user left it unchecked => this should create a packing-list one-off master
  // and category selection should be disabled/optional in that flow.
  const isCreatingOneOff = !masterItemId && showIsOneOffCheckbox && alsoAddForFutureTrips;
  // When editing an existing one-off, if the "add to master list" checkbox is checked,
  // treat it as a regular item (category required). If unchecked, keep one-off behavior.
  const isConvertingOneOffToRegular = masterItemId && isMasterOneOff && alsoAddForFutureTrips;
  // Effective one-off flag: true when creating a packing-list one-off OR when the
  // master item is a one-off AND not being converted to regular.
  const isOneOff = isCreatingOneOff || (isMasterOneOff && !isConvertingOneOffToRegular);

  useEffect(() => {
    setName(initialName || '');
  }, [initialName]);

  const [masterItems, setMasterItems] = useState<any[]>([]);
  const [loadingMasterItems, setLoadingMasterItems] = useState(false);
  const [similarResults, setSimilarResults] = useState<any[]>([]);
  const [existingMasterIds, setExistingMasterIds] = useState<Set<string>>(new Set());
  const [itemCategoriesMap, setItemCategoriesMap] = useState<Record<string, any[]>>({});

  // Prepare fuzzy search results using shared hook (no debouncing here)
  const rawFuseResults = useFuzzySearch(masterItems, (name || '').trim(), { threshold: 0.25, distance: 32, minMatchCharLength: 2, ignoreLocation: true }, 10);

  // Load master items for similarity lookup when creating a new item
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!opened) return;
      if (masterItemId) return; // only for new item dialog
      setLoadingMasterItems(true);
      try {
        let fid = familyId;
        if (!fid) {
          const prof = await getCurrentUserProfile();
          if (prof.response.ok && prof.data.family) fid = prof.data.family.id;
        }
        if (!fid) return;
        const res = await getItems(fid);
        if (res.response.ok && !cancelled) {
          const items = res.data.items || [];
          setMasterItems(items);
        }
      } catch (e) {
        // ignore
      } finally {
        if (!cancelled) setLoadingMasterItems(false);
      }
    })();
    return () => { cancelled = true; };
  }, [opened, masterItemId, familyId]);

  // If opened in promote/add-to-list context, load the target packing list's master item ids
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!opened) return;
      const lid = promoteContext && (promoteContext as any).listId;
      if (!lid) return;
      try {
        const res = await getPackingList(lid);
        if (res.response.ok && !cancelled) {
          const ids = new Set<string>();
          const items = res.data.items || [];
          for (const it of items) {
            if (it.item_id) ids.add(it.item_id);
          }
          setExistingMasterIds(ids);
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [opened, promoteContext]);

  // Compute similar results as the name changes (debounced) using shared fuzzy hook
  useEffect(() => {
    if (masterItemId) return; // only for new item
    const trimmed = (name || '').trim();
    if (!trimmed || trimmed.length < 2 || masterItems.length === 0) {
      setSimilarResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      if (!active) return;
      try {
        const raw = rawFuseResults || [];
        const scored = raw.filter(r => typeof r.score === 'number' ? r.score <= 0.45 : true).slice(0, 5).map(r => r.item);
        if (!active) return;
        setSimilarResults(scored);

        // fetch categories for the filtered items if we don't already have them
        const missing = scored.filter(it => !itemCategoriesMap[it.id]).map(it => it.id);
        if (missing.length > 0) {
          const mapCopy: Record<string, any[]> = { ...itemCategoriesMap };
          await Promise.all(missing.map(async (iid) => {
            try {
              const cr = await getCategoriesForItem(iid as string);
              if (cr.response && cr.response.ok) mapCopy[iid] = cr.data.categories || cr.data || [];
              else mapCopy[iid] = [];
            } catch (e) {
              mapCopy[iid] = [];
            }
          }));
          if (active) setItemCategoriesMap(mapCopy);
        }
      } catch (e) {
        console.error('Fuzzy search failed', e);
        setSimilarResults([]);
      }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [rawFuseResults, name, masterItems, masterItemId]);

  useEffect(() => {
    // default checkbox state: unchecked => OFF = add for future trips (master item)
    // User can toggle ON to mark as "This Trip Only" (one-off)
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
          // master payload received (verbose log removed)
          const masterOneOffFlag = !!(payload.item?.isOneOff);
          setIsMasterOneOff(masterOneOffFlag);
          setItemFamilyId(payload.item?.familyId || familyId || null);
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
          // existing item currentCat computation (debug log removed)
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
          // Item groups (templates) support: payload may include itemGroups and itemGroupIds
          const groups = Array.isArray(payload.itemGroups) ? payload.itemGroups : [];
          const groupIds = Array.isArray(payload.itemGroupIds) ? payload.itemGroupIds : [];
          setItemGroups(groups);
          setInitialGroupIds(groupIds);
          setSelectedGroupIds(groupIds.slice());
          // Use memberIds and wholeFamily from API if present, fallback to previous logic
          let assigned: string[] = [];
          if (Array.isArray(payload.memberIds)) {
            assigned = payload.memberIds;
          } else {
            const itemMems = Array.isArray(payload.itemMembers) ? payload.itemMembers : (payload.itemMembers || []);
            assigned = itemMems.map((m: any) => m.id);
          }
          // Prefer caller-provided initialMembers when present
          const finalAssigned = Array.isArray(initialMembersProp) && initialMembersProp.length > 0 ? initialMembersProp : assigned;
          setInitialMembers(finalAssigned);
          setSelectedMembers(finalAssigned.slice());
          // Always use wholeFamily from API for edit mode
          const wholeAssigned = typeof payload.wholeFamily !== 'undefined' ? !!payload.wholeFamily : (typeof payload.wholeAssigned !== 'undefined' ? !!payload.wholeAssigned : false);
          setInitialWhole(wholeAssigned);
          setSelectedWhole(wholeAssigned);
        } else {
          // New item: load family-level categories and members
          if (familyId) {
            setItemFamilyId(familyId || null);
            let familyMembersFromProfile: any[] = [];
            try {
              const cats = await getCategories(familyId);
              if (cats.response.ok) setCategories(cats.data.categories || []);
            } catch (e) {
              // ignore
            }
            try {
              // Prefer explicit family fetch so impersonation-selected family members are returned.
              // IMPORTANT: when an explicit familyId is provided (which happens during impersonation)
              // do NOT fall back to the current user's profile. We must avoid leaking member data
              // from the logged-in user's profile into the impersonated family's context.
              const famRes = await getFamily(familyId!);
              if (famRes.response.ok && famRes.data.family) {
                familyMembersFromProfile = famRes.data.family.members || [];
                setFamilyMembers(familyMembersFromProfile);
              } else {
                // If the family fetch doesn't return a family (unexpected), treat as no members
                familyMembersFromProfile = [];
                setFamilyMembers([]);
              }
            } catch (e) {
              // If getFamily fails (network/server), do not fall back to profile when a familyId
              // was explicitly provided. Leave members empty so the caller can handle missing members.
              familyMembersFromProfile = [];
              setFamilyMembers([]);
            }

            // New item initial selection: prefer caller-provided initialCategoryId and initialMembers/initialWhole, otherwise empty
            const preselect = typeof initialCategoryId !== 'undefined' ? initialCategoryId : null;
            // new-item preselect debug removed
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

  // When opening in create mode (no masterItemId), ensure the name is cleared and
  // the selected members/whole are seeded from the parent's initial props so
  // the parent can persist the last-used selections across opens.
  useEffect(() => {
    if (!opened) return;
    if (masterItemId) return; // only for create mode
    // Seed the name input: prefer provided initialName when opening from another UI, otherwise clear
    setName(initialName || '');
    // Seed selected members/whole from initial props
    const assigned = Array.isArray(initialMembersProp) ? initialMembersProp.slice() : [];
    setSelectedMembers(assigned);
    setSelectedWhole(!!initialWholeProp);
  }, [opened, masterItemId, initialMembersProp, initialWholeProp]);

  // If familyMembers load after we seeded selectedMembers, re-apply the initialMembers
  // to ensure checkboxes reflect the parent's selections (handles async ordering).
  useEffect(() => {
    if (!opened) return;
    if (masterItemId) return;
    if (!Array.isArray(initialMembersProp) || initialMembersProp.length === 0) return;
    // Only re-apply if the UI hasn't already got selections
    setSelectedMembers(prev => {
      if (prev && prev.length > 0) return prev;
      return initialMembersProp.slice();
    });
  }, [familyMembers, initialMembersProp, opened, masterItemId]);

  // Load item groups when opening the drawer in create mode so the new-item UI shows groups
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!opened) return;
      if (masterItemId) return; // only for create mode
      if (!familyId) return;
      try {
        const res = await getItemGroups(familyId);
        if (!cancelled && res.response && res.response.ok) {
          setItemGroups(res.data?.itemGroups || res.data?.templates || []);
        }
      } catch (e) {
        if (!cancelled) setItemGroups([]);
      }
    })();
    return () => { cancelled = true; };
  }, [opened, masterItemId, familyId]);

  const save = async () => {
    setSaving(true);
    try {
      const trimmedName = (name || '').trim();
      // Validation: name must be non-empty after trimming
      if (!trimmedName) {
        showNotification({ title: 'Validation', message: 'Item name cannot be empty.', color: 'red' });
        setSaving(false);
        return;
      }
    // Validation: category must be selected unless this is a one-off (create or master one-off)
    if (!isOneOff && !selectedCategory) {
        showNotification({ title: 'Validation', message: 'Select a category before saving.', color: 'red' });
        setSaving(false);
        return;
      }
      let createdId: string | undefined;
      let updatedName: string | undefined;
  const effectiveSelected = selectedCategory ? [selectedCategory] : [];
      if (!masterItemId) {
        // Validation: when creating a new item, require either Whole Family or at least one member selected
        if (!selectedWhole && (!selectedMembers || selectedMembers.length === 0)) {
          // assignments validation failed (log removed)
          showNotification({ title: 'Validation', message: 'Select at least one member or assign to the whole family before saving.', color: 'red' });
          setSaving(false);
          return;
        }
        // Create a new master item
        if (!familyId) throw new Error('Family not available');
        // Determine isOneOff: when checkbox shown, checked => isOneOff=1 (This Trip Only), unchecked => isOneOff=0 (Add for Future Trips)
        // When checkbox is hidden (management page), isOneOff should always be 0
        const isOneOffValue = showIsOneOffCheckbox ? (alsoAddForFutureTrips ? 1 : 0) : 0;
  const createRes = await createItem(familyId, trimmedName || 'New Item', isOneOffValue, selectedCategory || null);
        if (!createRes.response.ok) throw new Error('Failed to create item');
        createdId = createRes.data?.item?.id;
  updatedName = createRes.data?.item?.name || trimmedName;
        if (!createdId) throw new Error('Create response missing id');

  // Assign a single category (if present) and members
  const ops: Promise<any>[] = [];
  if (effectiveSelected.length > 0) ops.push(assignItemToCategory(createdId, effectiveSelected[0]));
        const assignFamilyId = familyId || itemFamilyId;
        if (selectedWhole && assignFamilyId) ops.push(assignToWholeFamily(createdId, assignFamilyId));
        if (!selectedWhole) {
          for (const mid of selectedMembers) ops.push(assignToMember(createdId, mid));
        }
        await Promise.all(ops);
        // Assign item to selected item groups (templates)
        try {
          const groupOps: Promise<any>[] = [];
          for (const gid of selectedGroupIds || []) {
            groupOps.push(assignItemToTemplate(gid, createdId));
          }
          await Promise.all(groupOps);
        } catch (e) {
          console.error('Failed to assign item to groups', e);
        }
        showNotification({ title: 'Saved', message: 'Item created.', color: 'green' });
        if (onSaved) await onSaved(createdId ? { id: createdId, name: updatedName, members: selectedMembers.slice(), whole: !!selectedWhole } : undefined);
        onClose();
        return;
      }

      // Existing item update
      if (!masterItemId) throw new Error('masterItemId missing');
      // update item called (verbose log removed)
      
      // Update the master item name (and isOneOff flag if converting)
      const nameChanged = trimmedName && initialName?.trim() !== trimmedName;
      if (nameChanged || isConvertingOneOffToRegular) {
        // When converting one-off to regular, set isOneOff to 0
        const newIsOneOff = isConvertingOneOffToRegular ? 0 : undefined;
        const uRes = await updateItem(masterItemId, trimmedName, newIsOneOff);
        if (uRes.response.ok) updatedName = uRes.data?.item?.name || trimmedName;
      }

      // Update category and member assignments
      const ops: Promise<any>[] = [];
      
      // Always update the single category assignment for the item
      const effectiveInitial = initialCategory ? [initialCategory] : [];
      const toAddCats = effectiveSelected.filter((c: string) => !effectiveInitial.includes(c));
      const toRemoveCats = effectiveInitial.filter((c: string) => !effectiveSelected.includes(c));
      // Since single-category, we'll add the new category (if any) and remove the old one
      for (const cid of toAddCats) ops.push(assignItemToCategory(masterItemId, cid));
      for (const cid of toRemoveCats) ops.push(removeItemFromCategory(masterItemId, cid));

      // Update member assignments (for both one-off and regular items)
      const assignFamilyId = familyId || itemFamilyId;
      if (selectedWhole && !initialWhole) {
        if (assignFamilyId) ops.push(assignToWholeFamily(masterItemId, assignFamilyId));
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
      // Update item group assignments: add/remove as necessary
      try {
        const toAdd = selectedGroupIds.filter(g => !initialGroupIds.includes(g));
        const toRemove = initialGroupIds.filter(g => !selectedGroupIds.includes(g));
        const groupOps: Promise<any>[] = [];
        for (const gid of toAdd) groupOps.push(assignItemToTemplate(gid, masterItemId));
        for (const gid of toRemove) groupOps.push(removeItemFromTemplate(gid, masterItemId));
        await Promise.all(groupOps);
      } catch (e) {
        console.error('Failed to sync item group assignments', e);
      }
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
          {'Note: changes here will apply according to whether this is a one-off or a master item. All items require a category and assignment.'}
        </Text>
        {loading ? (<div style={{ padding: 16 }}>Loading item details...</div>) : null}

        {/* Name - full width row */}
        <div style={{ marginTop: 12 }}>
          <TextInput label="Item" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </div>

        {/* Similar existing items lookup */}
        {(!masterItemId && similarResults && similarResults.length > 0) ? (
          <div style={{ marginTop: 8, border: '1px dashed rgba(0,0,0,0.06)', padding: 8, borderRadius: 6 }}>
            <Text size="sm" fw={600} style={{ marginBottom: 6 }}>Similar items</Text>
                {similarResults.map((it: any) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <div>
                  <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</Text>
                  <Text size="xs" c="dimmed">{it.description || ''}</Text>
                </div>
                <div style={{ marginLeft: 12 }}>
                  {((!promoteContext || !promoteContext.listId) && ((typeof initialCategoryId !== 'undefined' && initialCategoryId !== null) || hideAddActionWhenNoList)) ? (
                    (() => {
                      const cats = itemCategoriesMap[it.id] || [];
                      let displayName = '';
                      if (initialCategoryId) {
                        const match = cats && cats.length > 0 ? cats.find((c: any) => c.id === initialCategoryId) : null;
                        if (match && (match.name || match)) displayName = match.name || match;
                        else {
                          const lookup = categories.find(c => c.id === initialCategoryId);
                          displayName = lookup ? lookup.name : (cats && cats.length > 0 ? cats.map((c: any) => c.name || c).join(', ') : 'category');
                        }
                      } else if (cats && cats.length > 0) {
                        displayName = cats.map((c: any) => c.name || c).join(', ');
                      } else {
                        displayName = 'category';
                      }
                      return (<div style={{ padding: '6px 10px', borderRadius: 4, background: 'rgba(0,0,0,0.02)', color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>{`Already in ${displayName}`}</div>);
                    })()
                  ) : (
                    existingMasterIds.has(it.id) ? (
                      <div style={{ padding: '6px 10px', borderRadius: 4, background: 'rgba(0,0,0,0.02)', color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>Already on list</div>
                    ) : (
                      <Button size="xs" onClick={async () => {
                        try {
                          if (promoteContext && promoteContext.listId) {
                            const res = await addItemToPackingList(promoteContext.listId, it.id);
                            if (res && res.response && res.response.ok) {
                              showNotification({ title: 'Added', message: 'Item added to packing list', color: 'green' });
                              try {
                                // Notify window listeners (same shape as SSE events) so UI can refresh immediately
                                window.dispatchEvent(new CustomEvent('server-event', { detail: { type: 'packing_list_changed', listId: promoteContext.listId } }));
                              } catch (e) { /* ignore */ }
                            } else {
                              showNotification({ title: 'Error', message: 'Failed to add item to packing list', color: 'red' });
                            }
                            onClose();
                            return;
                          }
                          if (onSaved) {
                            await onSaved({ id: it.id, name: it.name });
                          } else {
                            showNotification({ title: 'Selected', message: 'Existing item selected. Open the list and add it from Add Items.', color: 'blue' });
                          }
                        } catch (err) {
                          console.error('Failed to add existing item to list', err);
                          showNotification({ title: 'Error', message: 'Failed to add item to list', color: 'red' });
                        }
                      }}>Add this to list</Button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Unified toggle: creation and promote/edit flows use the same switch */}
        {(showIsOneOffCheckbox && !masterItemId) || promoteContext || (masterItemId && isMasterOneOff) ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch
                checked={alsoAddForFutureTrips}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  // If turning on for an existing item (promote/convert flow), require confirmation.
                  // Do NOT show the confirmation when creating a new item (masterItemId is null).
                  if (on && masterItemId && (promoteContext || isMasterOneOff)) {
                    setPromotionConfirm({ open: true, reason: promoteContext ? 'promote' : 'convert' });
                    return;
                  }
                  setAlsoAddForFutureTrips(on);
                }}
                aria-label={alsoAddForFutureTrips ? 'This Trip Only' : 'Add to master list'}
              />
              <Text size="sm">This Trip Only</Text>
            </div>
            <Text size="xs" c={alsoAddForFutureTrips ? undefined : 'dimmed'} style={{ marginTop: 6, color: alsoAddForFutureTrips ? 'rgba(0,0,0,0.85)' : undefined }}>
              {promoteContext || (masterItemId && isMasterOneOff)
                ? 'Adding this item only to this list means it will not be available on other lists. Toggle it off to add it to the master list for future trips.'
                : 'When checked, the item will be created only for this list. When unchecked, it will be added to the master list for future trips.'}
            </Text>
          </div>
        ) : null}

        {/* Two column section: Categories (left) | Members/Assignments (right) */}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'stretch', flex: '1 1 auto' }}>
          <div style={{ flex: '1 1 50%', overflow: 'auto', borderRight: '1px solid rgba(0,0,0,0.04)', paddingRight: 12 }}>
            <Text fw={700} mb="xs">Category</Text>
            {categories.length === 0 ? (
              <Text c="dimmed">No categories</Text>
            ) : (
              <div>
                {/* Single-select using radio buttons; category is required for all items now */}
                {categories.map((c: any) => (
                  <div key={c.id} style={{ padding: '6px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="radio" name="category" value={c.id} checked={selectedCategory === c.id} onChange={() => setSelectedCategory(c.id)} />
                      <span>{c.name}</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
            {/* Item Groups (Templates) moved here under categories */}
            <div style={{ marginTop: 12 }}>
              <Text size="sm" fw={700}>Item Groups</Text>
              {itemGroups.length === 0 ? (
                <Text c="dimmed">No item groups</Text>
              ) : (
                itemGroups.map((g: any) => (
                  <div key={g.id} style={{ padding: '6px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: (isCreatingOneOff ? 'rgba(0,0,0,0.4)' : undefined) }}>
                      <input type="checkbox" value={g.id} disabled={isCreatingOneOff} checked={selectedGroupIds.includes(g.id)} onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setSelectedGroupIds(prev => checked ? [...prev, g.id] : prev.filter(id => id !== g.id));
                      }} />
                      <span>{g.name}</span>
                    </label>
                  </div>
                ))
              )}
            </div>
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
              {/* Item groups are shown on the left under Categories (no duplicate here) */}
            </div>
          </div>
        </div>

        {/* Buttons below in single column; promote/edit checkbox handled above for create-case */}
        <div style={{ marginTop: 12 }}>
          {/* Buttons area - promotion handled by unified switch above */}

          <Modal opened={promotionConfirm.open} onClose={() => setPromotionConfirm({ open: false })} title={promotionConfirm.reason === 'promote' ? 'Promote this item to the master list?' : 'Convert this one-off to a regular master item?'} zIndex={(zIndex ?? 2000) + 100}>
          <div>
            <Text size="sm">This will create/update a master item so the item appears on all lists. Changes may require selecting a category. Proceed?</Text>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Button variant="default" onClick={() => setPromotionConfirm({ open: false })}>Cancel</Button>
              <Button color="blue" onClick={async () => {
                // Confirm promotion: enable the flag and close modal
                setAlsoAddForFutureTrips(true);
                setPromotionConfirm({ open: false });
              }}>Promote Item</Button>
            </div>
          </div>
          </Modal>

          {/* Show validation hint when Save is disabled due to missing category or assignments */}
          {(
            // Save would be disabled when name empty, no category, or missing assignments on create
            // We only show the validation hint when the name is present (so the user knows why Save is disabled)
            (name && (name || '').trim()) && (
              (!selectedCategory) || (!masterItemId && !selectedWhole && selectedMembers.length === 0)
            )
          ) ? (
            <div style={{ marginBottom: 8 }}>
              <Text size="sm" color="red">Please select a category and at least one assignment (member or Whole Family) before saving.</Text>
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
                          // category must be selected for all items
                          !selectedCategory ||
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
