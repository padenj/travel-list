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
} from '../api';

type OnSavedPayload = { name?: string } | undefined;

export interface ItemEditDrawerProps {
  opened: boolean;
  onClose: () => void;
  masterItemId: string | null | undefined; // master item id (the canonical item)
  initialName?: string;
  familyId: string | null | undefined;
  showNameField?: boolean; // whether to expose a name input (used by ItemManagementPage)
  onSaved?: (payload?: OnSavedPayload) => Promise<void> | void;
}

export default function ItemEditDrawer({ opened, onClose, masterItemId, initialName, familyId, showNameField = false, onSaved }: ItemEditDrawerProps) {
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

  useEffect(() => {
    setName(initialName || '');
  }, [initialName]);

  useEffect(() => {
    if (!opened) return;
    (async () => {
      if (!masterItemId) return;
      setLoading(true);
      try {
        // Fetch all edit data in a single request
        const res = await getItemEditData(masterItemId, familyId || undefined);
        if (!res.response.ok) {
          throw new Error('Failed to load item edit data');
        }
        const payload = res.data || {};

        // categories for family
        setCategories(payload.categories || []);

        // assigned categories for item (normalize shape)
        const itemCats = Array.isArray(payload.itemCategories) ? payload.itemCategories : (payload.itemCategories || []);
        const currentCats = itemCats.map((c: any) => c.id);
        setInitialCategories(currentCats);
        setSelectedCategories(currentCats.slice());

        // determine virtual 'All' state
        const allCatIds = (payload.categories || []).map((c: any) => c.id);
        const isAll = allCatIds.length > 0 && allCatIds.every((id: string) => currentCats.includes(id)) && currentCats.length === allCatIds.length;
        setInitialAll(isAll);
        setSelectedAll(isAll);

        // family members
        setFamilyMembers(payload.members || []);

        // assigned members
        const itemMems = Array.isArray(payload.itemMembers) ? payload.itemMembers : (payload.itemMembers || []);
        const assigned = itemMems.map((m: any) => m.id);
        setInitialMembers(assigned);
        setSelectedMembers(assigned.slice());

        // whole-family flag
        const wholeAssigned = !!payload.wholeAssigned;
        setInitialWhole(wholeAssigned);
        setSelectedWhole(wholeAssigned);
      } catch (err) {
        console.error('ItemEditDrawer load failed', err);
        showNotification({ title: 'Error', message: 'Failed to load item details', color: 'red' });
      } finally {
        setLoading(false);
      }
    })();
  }, [opened, masterItemId, familyId]);

  const save = async () => {
    if (!masterItemId) return;
    setSaving(true);
    try {
      let updatedName: string | undefined = undefined;
      if (showNameField && name && initialName !== name) {
        const uRes = await updateItem(masterItemId, name);
        if (uRes.response.ok) updatedName = uRes.data?.item?.name || name;
      }

      const ops: Promise<any>[] = [];

      const allCatIds = (categories || []).map(c => c.id);
      const effectiveSelected = selectedAll ? allCatIds : selectedCategories;
      const effectiveInitial = initialAll ? allCatIds : initialCategories;
      const toAddCats = effectiveSelected.filter((c: string) => !effectiveInitial.includes(c));
      const toRemoveCats = effectiveInitial.filter((c: string) => !effectiveSelected.includes(c));
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
    <Drawer opened={opened} onClose={onClose} title={masterItemId ? `Edit Item` : 'Edit Item'} position="right" size={720} padding="md">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Text size="sm" c="dimmed">Note: changing categories or assignments here updates the master item and will apply to all lists.</Text>
        {loading ? (<div style={{ padding: 16 }}>Loading item details...</div>) : null}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'stretch', flex: '1 1 auto' }}>
          <div style={{ flex: '1 1 50%', overflow: 'auto', borderRight: '1px solid rgba(0,0,0,0.04)', paddingRight: 12 }}>
            {showNameField ? (
              <div style={{ marginBottom: 8 }}>
                <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
              </div>
            ) : null}
            <Text fw={700} mb="xs">Categories</Text>
            <div style={{ padding: '6px 0' }}>
              <Checkbox checked={selectedAll} onChange={(e) => {
                const checked = e.currentTarget.checked;
                setSelectedAll(checked);
                if (checked) {
                  // when All is selected, clear the explicit per-category selection to avoid visual mismatch
                  setSelectedCategories([]);
                }
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
                    // turning off any per-category should also clear the All flag
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

        <Group mt="md" style={{ justifyContent: 'space-between' }}>
          <div />
          <Group>
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </Group>
        </Group>
      </div>
    </Drawer>
  );
}
