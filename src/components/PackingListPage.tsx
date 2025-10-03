import React, { useEffect, useState } from 'react';
import { PackingListsSideBySide } from './PackingListsSideBySide';
import { getCurrentUserProfile, getItems, getMembersForItem, isAssignedToWholeFamily, setChecked } from '../api';
import { Loader, Container, Title, Group } from '@mantine/core';

export default function PackingListPage(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [userLists, setUserLists] = useState<any[]>([]);
  const [wholeFamilyItems, setWholeFamilyItems] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const profile = await getCurrentUserProfile();
      if (profile.response.ok && profile.data.family) {
        setFamilyId(profile.data.family.id);
        setMembers(profile.data.family.members || []);
        // Fetch items for this family
        const itemsRes = await getItems(profile.data.family.id);
        if (itemsRes.response.ok) {
          const items = itemsRes.data.items || [];
          // Fetch assignments for each item
          const userListsData: any[] = [];
          for (const member of profile.data.family.members || []) {
            const memberItems: any[] = [];
            for (const item of items) {
              const assignedMembersRes = await getMembersForItem(item.id);
              if (assignedMembersRes.response.ok && assignedMembersRes.data) {
                const assignedMemberIds = assignedMembersRes.data.map((m: any) => m.id);
                if (assignedMemberIds.includes(member.id)) {
                  memberItems.push({ ...item, checked: !!item.checked });
                }
              }
            }
            userListsData.push({
              userId: member.id,
              userName: member.name || member.username,
              items: memberItems
            });
          }
          // Whole family items
          const wholeFamilyItems: any[] = [];
          for (const item of items) {
            const isWholeFamilyRes = await isAssignedToWholeFamily(item.id);
            if (isWholeFamilyRes.response.ok && isWholeFamilyRes.data === true) {
              wholeFamilyItems.push({ ...item, checked: !!item.checked });
            }
          }
          setUserLists(userListsData);
          setWholeFamilyItems(wholeFamilyItems);
        }
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const handleCheckItem = async (userId: string | null, itemId: string, checked: boolean) => {
    await setChecked(itemId, checked);
    if (userId) {
      setUserLists(lists =>
        lists.map(list =>
          list.userId === userId
            ? { ...list, items: list.items.map(item => item.id === itemId ? { ...item, checked } : item) }
            : list
        )
      );
    } else {
      setWholeFamilyItems(items =>
        items.map(item => item.id === itemId ? { ...item, checked } : item)
      );
    }
  };

  if (loading) {
    return (
      <Container size="md">
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      </Container>
    );
  }

  return (
    <Container size="lg">
      <Title order={2} mb="lg">Packing Lists</Title>
      <PackingListsSideBySide
        userLists={userLists}
        wholeFamilyItems={wholeFamilyItems}
        onCheckItem={handleCheckItem}
      />
    </Container>
  );
}
