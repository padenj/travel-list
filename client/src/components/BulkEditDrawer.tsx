import React, { useEffect, useState } from 'react';
import { Drawer, Title, Group, Button, Select, Checkbox, Stack, Loader, Text } from '@mantine/core';
import { getCategories, getMembersForItem, getMembersForItem as getMembers, assignItemToCategory, assignToMember, removeFromMember, getFamily } from '../api';

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
          // Prefer a family-level members list (getFamily) so all family members are available
          try {
            const fam = await getFamily(familyId);
            if (fam.response.ok && fam.data && fam.data.family) {
              const famMembers = fam.data.family.members || [];
              setMembers(famMembers.map((m: any) => ({ id: m.id, name: m.name })));
            }
          } catch (e) {
            // fallback to using item-based members if family endpoint isn't available
            if (itemIds && itemIds.length > 0) {
              const mres = await getMembers(itemIds[0]);
              if (mres.response.ok) {
                setMembers(Array.isArray(mres.data) ? mres.data : (mres.data?.members || []));
              }
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

  // When opening, pre-select members that are assigned to ALL of the selected items
  useEffect(() => {
    if (!opened || !itemIds || itemIds.length === 0) return;
    (async () => {
      try {
        // fetch members for each selected item and compute intersection
        const memberLists = await Promise.all(itemIds.map(async (itemId) => {
          try {
            const res = await getMembersForItem(itemId);
            if (res.response.ok) return Array.isArray(res.data) ? res.data.map((m: any) => m.id) : (res.data?.members || []).map((m: any) => m.id);
          } catch (e) { }
          return [] as string[];
        }));
        if (memberLists.length === 0) return;
  const intersection = memberLists.reduce((acc: string[], list: string[]) => acc.filter((x: string) => list.includes(x)), memberLists[0] || []);
        setSelectedMembers(intersection);
      } catch (e) {
        // ignore
      }
    })();
  }, [opened, itemIds]);

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
    <Drawer opened={opened} onClose={onClose} title={<Title order={4}>Bulk Edit ({itemIds.length})</Title>} size="lg" position="right">
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
            <Text fw={700} mb="xs">Assignments</Text>
            <div style={{ marginTop: 8 }}>
              <Text size="sm" fw={600}>Members</Text>
              {members.length === 0 ? (
                <Text c="dimmed">No family members</Text>
              ) : (
                members.map((m: any) => (
                  <div key={m.id} style={{ padding: '6px 0' }}>
                    <Checkbox
                      checked={selectedMembers.includes(m.id)}
                      onChange={(e) => {
                        const checked = (e.currentTarget as HTMLInputElement).checked;
                        setSelectedMembers(prev => checked ? [...prev, m.id] : prev.filter(x => x !== m.id));
                      }}
                      label={m.name || m.username}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
          <Group justify="right">
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button onClick={apply} disabled={loading}>Apply</Button>
          </Group>
        </Stack>
      )}
    </Drawer>
  );
}
