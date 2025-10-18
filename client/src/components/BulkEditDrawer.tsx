import React, { useEffect, useState } from 'react';
import { Drawer, Title, Group, Button, Select, Checkbox, Stack, Loader, Text } from '@mantine/core';
import { getCategories, getMembersForItem, getMembersForItem as getMembers, assignItemToCategory, assignToMember, removeFromMember } from '../api';

type Props = {
  opened: boolean;
  onClose: () => void;
  itemIds: string[];
  familyId?: string | null;
  initialCategoryId?: string;
  onApplied?: () => void;
};

export default function BulkEditDrawer({ opened, onClose, itemIds, familyId, initialCategoryId, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(initialCategoryId);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      if (familyId) {
        const cats = await getCategories(familyId);
        if (cats.response.ok) setCategories(cats.data.categories || []);
        // load family members by fetching edit data for first item or via profile — reuse getMembersForItem by calling with any item
        try {
          // If there are members returned by item edit data endpoints, clients already have an API; fallback to using item-based members
          if (itemIds && itemIds.length > 0) {
            const mres = await getMembers(itemIds[0]);
            if (mres.response.ok) {
              setMembers(Array.isArray(mres.data) ? mres.data : (mres.data?.members || []));
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }
    if (opened) load();
  }, [opened, familyId]);

  useEffect(() => setSelectedCategory(initialCategoryId), [initialCategoryId]);

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const apply = async () => {
    setLoading(true);
    try {
      for (const itemId of itemIds) {
        if (selectedCategory) {
          await assignItemToCategory(itemId, selectedCategory);
        }
        // For members: remove all existing members then add the selected ones.
        // There's no single API to replace members; we'll call assign/remove based on getMembersForItem current state.
        const mres = await getMembers(itemId);
        const current: string[] = mres.response.ok ? (Array.isArray(mres.data) ? mres.data.map((m: any) => m.id) : []) : [];
        // remove members not selected
        for (const mid of current) {
          if (!selectedMembers.includes(mid)) {
            try { await removeFromMember(itemId, mid); } catch (e) { /* ignore */ }
          }
        }
        // add members selected that aren't present
        for (const mid of selectedMembers) {
          if (!current.includes(mid)) {
            try { await assignToMember(itemId, mid); } catch (e) { /* ignore */ }
          }
        }
      }
      if (onApplied) onApplied();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer opened={opened} onClose={onClose} title={<Title order={4}>Bulk Edit ({itemIds.length})</Title>} size="lg">
      {loading ? <Loader /> : (
        <Stack>
          <div>
            <Text size="sm" c="dimmed">Category (this category will be preselected for context)</Text>
            <Select
              data={categories.map(c => ({ value: c.id, label: c.name }))}
              value={selectedCategory}
              onChange={(v) => setSelectedCategory(v || undefined)}
              placeholder="Select category"
            />
          </div>
          <div>
            <Text size="sm" c="dimmed">Assign to family members</Text>
            {members.length === 0 ? <Text c="dimmed">No family members</Text> : (
              members.map(m => (
                <Checkbox key={m.id} label={m.name} checked={selectedMembers.includes(m.id)} onChange={() => toggleMember(m.id)} />
              ))
            )}
          </div>
          <Group position="right">
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button onClick={apply} disabled={loading}>Apply</Button>
          </Group>
        </Stack>
      )}
    </Drawer>
  );
}
